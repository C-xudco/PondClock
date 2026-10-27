// Documentation-only candidate exports. Does not mutate src, version or saves.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { FISH, REGIONS } from '../../src/lib/gameConfig.js';
import { REGION_LOCATIONS } from '../../src/data/regionLocations.js';
import { ROUTES } from '../../src/domain/routes.js';
import { TRAVEL_CONFIG } from '../../src/config/travel.js';
const dir=path.dirname(fileURLToPath(import.meta.url));
const draft=JSON.parse(fs.readFileSync(path.join(dir,'REGION_CANDIDATE.json'),'utf8'));
const regions=[...REGIONS,...draft.newRegions];
const species=[...FISH,...draft.newSpecies];
const speciesMap=new Map(species.map(s=>[s.id,s]));
const ids=regions.map(r=>r.id);
if(new Set(ids).size!==17 || speciesMap.size!==56) throw Error('Expected17 regions and56 unique species');
for(const r of regions){
  if(new Set(r.fish.map(x=>x[0])).size!==r.fish.length)throw Error('Duplicate pool species');
  for(const [id,w] of r.fish)if(!speciesMap.has(id)||!Number.isFinite(w)||w<=0)throw Error('Invalid pool');
}
const locations={...REGION_LOCATIONS,...Object.fromEntries(draft.newRegions.map(r=>[r.id,r]))};
const rad=x=>x*Math.PI/180;
function distance(a,b){const p=rad(b.latitude-a.latitude),q=rad(b.longitude-a.longitude); const x=Math.sin(p/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(q/2)**2;return 2*6371*Math.asin(Math.sqrt(Math.max(0,Math.min(1,x))));}
const pairs=ids.flatMap((a,i)=>ids.slice(i+1).map(b=>({a,b,d:distance(locations[a],locations[b])})));
const min=Math.min(...pairs.map(p=>p.d)),max=Math.max(...pairs.map(p=>p.d));
const routes=pairs.flatMap(({a,b,d})=>[ [a,b],[b,a] ].map(([fromId,toId])=>{
  const ratio=Math.max(0,Math.min(1,(d-min)/(max-min)));
  return {id:`${fromId}:${toId}`,fromId,toId,distanceKm:d,durationMs:Math.round(60000+120000*ratio),price:Math.round((200+5800*ratio)/10)*10,ruleVersionDraft:2,coordinateStatus:'includes-planning-approximation'};
}));
const routeMap=new Map(routes.map(r=>[r.id,r]));
if(routes.length!==272||routes.some(r=>r.fromId===r.toId||r.durationMs<60000||r.durationMs>180000))throw Error('Route invariant failed');
for(const r of routes){const reverse=routeMap.get(`${r.toId}:${r.fromId}`);if(reverse.price!==r.price||reverse.durationMs!==r.durationMs)throw Error('Reverse mismatch');}
const oldDelta=ROUTES.map(old=>({id:old.id,oldPrice:old.price,newPrice:routeMap.get(old.id).price,oldDurationMs:old.durationMs,newDurationMs:routeMap.get(old.id).durationMs}));
const shares=new Map();
for(const r of regions){const total=r.fish.reduce((s,x)=>s+x[1],0);for(const [id,w] of r.fish)shares.set(`${id}:${r.id}`,w/total);}
const oldShares=new Map();
for(const r of REGIONS){const total=r.fish.reduce((s,x)=>s+x[1],0);for(const [id,w]of r.fish)oldShares.set(`${id}:${r.id}`,w/total);}
const market=species.flatMap(s=>{
  const maxSupply=Math.max(...regions.map(r=>shares.get(`${s.id}:${r.id}`)||0));
  if(!maxSupply)throw Error(`Orphan ${s.id}`);
  const oldMax=Math.max(0,...REGIONS.map(r=>oldShares.get(`${s.id}:${r.id}`)||0));
  return regions.map(r=>{
    const share=shares.get(`${s.id}:${r.id}`)||0;
    const oldShare=oldShares.get(`${s.id}:${r.id}`)||0;
    return {speciesId:s.id,name:s.name,regionId:r.id,supplyShare:share,maxSupplyShare:maxSupply,multiplier:0.8+1.2*(1-share/maxSupply),oldMultiplier:REGIONS.some(x=>x.id===r.id)&&oldMax>0?0.8+1.2*(1-oldShare/oldMax):null};
  });
});
const csv=rows=>'\uFEFF'+[Object.keys(rows[0]).join(','),...rows.map(r=>Object.values(r).map(v=>JSON.stringify(v??'')).join(','))].join('\n')+'\n';
fs.writeFileSync(path.join(dir,'ROUTES_CANDIDATE.csv'),csv(routes));
fs.writeFileSync(path.join(dir,'OLD_ROUTE_DELTAS.csv'),csv(oldDelta));
fs.writeFileSync(path.join(dir,'MARKETS_CANDIDATE.csv'),csv(market));
fs.writeFileSync(path.join(dir,'NEW_POOLS.csv'),csv(draft.newRegions.flatMap(r=>r.fish.map(([id,w])=>({regionId:r.id,speciesId:id,name:speciesMap.get(id).name,weight:w,share:w/r.fish.reduce((s,x)=>s+x[1],0)})))));
const report={date:'2026-10-27',status:'PLANNING_DATA_CHECK_ONLY',implemented:false,regions:regions.length,species:species.length,newRegions:5,newSpecies:6,routes:routes.length,newDirectedRoutes:routes.length-ROUTES.length,oldRoutesRepriced:oldDelta.filter(r=>r.oldPrice!==r.newPrice).length,oldRoutesRetimed:oldDelta.filter(r=>r.oldDurationMs!==r.newDurationMs).length,routeBoundsKm:{min,max},minDurationMs:Math.min(...routes.map(r=>r.durationMs)),maxDurationMs:Math.max(...routes.map(r=>r.durationMs)),minPrice:Math.min(...routes.map(r=>r.price)),maxPrice:Math.max(...routes.map(r=>r.price)),marketCells:market.length,oldMarketMultipliersChanged:market.filter(r=>r.oldMultiplier!==null&&Math.abs(r.oldMultiplier-r.multiplier)>1e-12).length,oldMarketMultiplierDirection:'May change both ways; no nondecrease guarantee after expanding supplies.',oldPaidFlightPolicy:'Preserve original quoted price, departure/arrival and rules; never reprice a paid trip.',examples:draft.newRegions.map(r=>routeMap.get(`jiangnan:${r.id}`)),checks:{uniqueRegionAndFishIds:true,allPoolsPositiveAndResolvable:true,routeCoverageNoSelf:true,reverseSymmetry:true,priceDurationBounds:true,allSpeciesHaveOrigin:true,fullMarketMatrix:true},unverified:['Coordinates are approximate design points, not verified weather/airport locations','Candidate pool weights are game balance, not field abundance','No17-region gross-50 calibration has passed','No code, migration, UI, network or release acceptance performed'],sourceHashes:Object.fromEntries(['src/lib/gameConfig.js','src/data/regionLocations.js','src/domain/routes.js','src/domain/market.js','src/config/travel.js'].map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL('../../'+p,import.meta.url))).digest('hex')]))};
fs.writeFileSync(path.join(dir,'REGION_CHECK.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
