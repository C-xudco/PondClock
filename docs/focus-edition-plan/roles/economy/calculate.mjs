// Proposal calculator only. Reads frozen prior proposal inputs; writes this directory only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const dir=path.dirname(fileURLToPath(import.meta.url));
const oldDir=path.resolve(dir,'../../../classic-items-proposal/roles/economy');
const inputFile=path.join(oldDir,'INPUT_SNAPSHOT.json');
const candidateFile=path.join(oldDir,'BALANCE_CANDIDATE.json');
const input=JSON.parse(fs.readFileSync(inputFile,'utf8'));
const previousCandidate=JSON.parse(fs.readFileSync(candidateFile,'utf8'));
const candidate={...previousCandidate,fishProbability:.974,nonFishDirectSalePerRound:.233}; // Edition One proposal: defer unused rod-upgrade token; return20 slots to fish.
const speciesById=new Map(input.FISH.map(s=>[s.id,s]));
const shares=new Map();
for(const r of input.REGIONS){const sum=r.fish.reduce((a,[,w])=>a+w,0); for(const [id,w] of r.fish)shares.set(`${id}:${r.id}`,w/sum);}
const maxShare=new Map(input.FISH.map(s=>[s.id,Math.max(...input.REGIONS.map(r=>shares.get(`${s.id}:${r.id}`)||0))]));
const ec=input.ECONOMY_CONFIG;
function meanQuote(s,r,q){
  const [a,b]=s.wt.map(x=>x*100);let mean=0,mass=0;
  const base=Math.max(s.basePrice,Math.round(candidate.priceRule.offset+candidate.priceRule.slope*s.basePrice));
  const scarcity=ec.abundantMultiplier+(ec.absentMultiplier-ec.abundantMultiplier)*(1-(shares.get(`${s.id}:${r.id}`)||0)/maxShare.get(s.id));
  for(let cents=Math.ceil(a-.5);cents<=Math.floor(b+.5);cents++){
    const p=Math.max(0,Math.min(b,cents+.5)-Math.max(a,cents-.5))/(b-a);if(!p)continue;
    const wt=cents/100;const average=(s.wt[0]+s.wt[1])/2||1;
    const factor=Math.min(ec.weightFactorMax,Math.max(ec.weightFactorMin,ec.weightFactorBase+(wt||average)/average*ec.weightFactorRate));
    mean+=p*Math.max(ec.minimumFreshPrice,Math.round(base*q.mult*factor*scarcity));mass+=p;
  }
  if(Math.abs(mass-1)>1e-9)throw Error('Weight mass');return mean;
}
const activeFactors={common:1,rare:1.25,epic:3.5,legendary:5};
function state(r,bait,pity,active){
  let fishMean=0;const probabilities={common:0,rare:0,epic:0,legendary:0};const sum=r.fish.reduce((a,[,w])=>a+w,0);
  for(const [id,w]of r.fish){const s=speciesById.get(id);
    const qualityWeights=input.QUALITIES.map(q=>{
      let x=s.qw[q.id]*candidate.qualityRule.baseScale*(q.id==='rare'?candidate.qualityRule.rareFactors[r.id]:1)+(bait?input.BAIT_QUALITY_BONUS:0)*(input.FISHING_CONFIG.qualityBonusRate[q.id]||0);
      if(pity&&['epic','legendary'].includes(q.id))x*=input.FISHING_CONFIG.pityWeightMultiplier;
      if(active)x*=activeFactors[q.id];return x;
    });const total=qualityWeights.reduce((a,b)=>a+b,0);
    input.QUALITIES.forEach((q,i)=>{const p=w/sum*qualityWeights[i]/total;probabilities[q.id]+=p;fishMean+=p*meanQuote(s,r,q);});
  }return{fishMean,probabilities,high:probabilities.epic+probabilities.legendary};
}
function steady(r,bait){const normal=state(r,bait,false,false),pity=state(r,bait,true,false);const survival=1-normal.high;const normalMass=(1-survival**input.PITY_THRESHOLD)/normal.high,tailMass=survival**input.PITY_THRESHOLD/pity.high;const tail=tailMass/(normalMass+tailMass);return{fishMean:(1-tail)*normal.fishMean+tail*pity.fishMean,gross:candidate.fishProbability*((1-tail)*normal.fishMean+tail*pity.fishMean)+candidate.nonFishDirectSalePerRound,probabilities:Object.fromEntries(input.QUALITIES.map(q=>[q.id,(1-tail)*normal.probabilities[q.id]+tail*pity.probabilities[q.id]]))};}
const normalRows=input.REGIONS.flatMap(r=>[false,true].map(bait=>({regionId:r.id,bait,...steady(r,bait)})));
const activeRows=input.REGIONS.map(r=>({regionId:r.id,...state(r,false,false,true)}));
const waitMean=90,manualResponse=2,biteWindow=20,gross=50;
const normalHourly={manual:3600/(waitMean+manualResponse)*gross,automatic:[.2,.3,.4].map(p=>({p,grossPerBite:p*gross,grossPerHour:3600/(waitMean+biteWindow)*p*gross,ratioToManual:p*(waitMean+manualResponse)/(waitMean+biteWindow)}))};
const widths={white:.2,red:.25,yellow:.3,green:.25};const success=widths.red*.1+widths.yellow*.5+widths.green; // .425 uniform-time benchmark, not a player skill prediction
const bundlePrice=450,charges=15,swingSeconds=3,swingsMean=2.5,gaugeSeconds=6;
const activeRowsWithEconomy=activeRows.map(r=>({...r,allGreenBundleGross:charges*r.fishMean,uniformStopBundleGross:charges*success*r.fishMean,allGreenNet:charges*r.fishMean-bundlePrice,uniformStopNet:charges*success*r.fishMean-bundlePrice,breakEvenSuccess:bundlePrice/(charges*r.fishMean)}));
const range=rows=>[Math.min(...rows),Math.max(...rows)];
const result={date:'2026-10-27',status:'DRAFT_AWAITING_USER_APPROVAL',implemented:false,scope:'All requirements here are Edition One; Edition Two undefined.',inputs:[inputFile,candidateFile].map(file=>({path:path.relative(dir,file).replaceAll('\\','/'),sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')})),assumptions:{normal:'One ordinary rod, no upgrade quality/speed/window bonus, no idle acceleration; 20s response window. Manual click before deadline catches with100% success, not guaranteed fish vs item.',normalMeanTarget:50,priorPricingAndLootCandidateApproved:false,editionOneLoot:{fishProbability:.974,nonFishDirectSalePerSuccess:.233,ferryTokenDeferred:true},pityThreshold:input.PITY_THRESHOLD,baitCatches:input.BAIT_CATCHES,active:'Fish-only pool; no bait, separate from ordinary pity; factors compare normal non-pity species distributions. 15 gauge activations, empty swings do not consume charges (confirmed by user).',activeFactors,widths,uniformStopSuccess:success,bundlePrice,charges,swingSeconds,swingsMean,gaugeSeconds},normalHourly,normalRows,activeRows:activeRowsWithEconomy,summary:{normalSuccessfulCatchGrossRange:range(normalRows.map(r=>r.gross)),normalNoBaitGrossRange:range(normalRows.filter(r=>!r.bait).map(r=>r.gross)),activeSuccessfulFishGrossRange:range(activeRows.map(r=>r.fishMean)),activeAllGreenBundleGross:range(activeRows.map(r=>charges*r.fishMean)),activeUniformStopBundleGross:range(activeRows.map(r=>charges*success*r.fishMean)),activeBreakEvenSuccessRange:range(activeRows.map(r=>bundlePrice/(charges*r.fishMean))),activeAllGreenBundleNet:range(activeRows.map(r=>charges*r.fishMean-bundlePrice)),activeUniformStopBundleNet:range(activeRows.map(r=>charges*success*r.fishMean-bundlePrice)),estimatedBundleSeconds:charges*(swingSeconds*swingsMean+gaugeSeconds)},exclusions:['Five new regions not yet approved or configured; all monetary conclusions require rerun against final17-area supply matrix.','Prior price and quality inputs are unapproved. Edition One loot candidate uses97.4% fish; prior97.2% table is historical and still unimplemented.','Hourly comparison ignores transaction/animation latency beyond2s manual response, no sleeping/offline catch-up, no automatic sale or coin credit.','Special-rod all-green scenario is upper skill benchmark; uniform stop .425 is a mathematical control, not observed human success.','Bait gift has no direct coin credit; current shop120/5 is not its marginal earning value.','No manual sales-buff, cross-region arbitrage, repairs, ticket savings or seven-day inventory aging in target.']};
result.previousFiveItemHistoricalComparison={status:'HISTORICAL_UNIMPLEMENTED_PROPOSAL',fishProbability:.972,nonFishDirectSalePerSuccess:.283,note:'Previous five-new-item draft included upgrade token; Edition One now defers it.',normalGrossRange:range(normalRows.map(r=>.972*r.fishMean+.283)),normalNoBaitGrossRange:range(normalRows.filter(r=>!r.bait).map(r=>.972*r.fishMean+.283))};
const allActiveHigherThanOrdinaryWithBait = activeRows.every(a=>{const n=normalRows.find(n=>n.regionId===a.regionId&&n.bait);return ['rare','epic','legendary'].every(q=>a.probabilities[q]>n.probabilities[q]);});
result.summary.allActiveHigherThanOrdinaryWithBait=allActiveHigherThanOrdinaryWithBait;
result.summary.activeQualityProbabilityRanges=Object.fromEntries(input.QUALITIES.map(q=>[q.id,range(activeRows.map(r=>r.probabilities[q.id]))]));
if(!allActiveHigherThanOrdinaryWithBait)throw Error('Active high-quality advantage');
if(!normalRows.every(r=>r.gross>=45&&r.gross<=55))throw Error('Provisional normal target');
if(!normalHourly.automatic.every(r=>r.ratioToManual<.4))throw Error('Auto ratio');
if(Math.abs(Object.values(widths).reduce((a,b)=>a+b,0)-1)>1e-12)throw Error('Gauge widths');
fs.writeFileSync(path.join(dir,'ECONOMY_CHECK.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({summary:result.summary,normalHourly,checks:'PASSED_PROPOSAL_ARITHMETIC_ONLY'}));
