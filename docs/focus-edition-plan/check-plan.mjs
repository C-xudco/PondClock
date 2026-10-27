// Read-only product/document checks; writes only PLAN_CHECK.json beside this script.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const before=JSON.parse(fs.readFileSync(path.join(dir,'PRODUCT_BEFORE.json'),'utf8'));
const observed=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard','--','src','desktop','public','scripts','tests','package.json','pnpm-lock.yaml'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const changed=Object.entries(before.files).filter(([file,hash])=>!fs.existsSync(path.join(root,file))||sha(fs.readFileSync(path.join(root,file)))!==hash).map(([file])=>file);
const added=observed.filter(p=>!(p in before.files));
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const md=[...walk(dir).filter(p=>p.endsWith('.md')),path.join(root,'README.md'),path.join(root,'docs/team/BASELINE.md'),path.join(root,'docs/team/REQUESTS.md')];
let checkedLinks=0;const broken=[];
for(const file of md){
  const content=fs.readFileSync(file,'utf8');
  for(const match of content.matchAll(/\]\(([^)\n]+)\)/g)){
    const link=match[1].replace(/^<|>$/g,'');
    if(/^(https?:|mailto:|data:|#|codex:)/i.test(link))continue;
    const target=path.resolve(path.dirname(file),decodeURIComponent(link.split('#')[0]));
    checkedLinks++;
    if(!fs.existsSync(target))broken.push({file:path.relative(root,file),link});
  }
}
const region=JSON.parse(fs.readFileSync(path.join(dir,'REGION_CHECK.json'),'utf8'));
const economy=JSON.parse(fs.readFileSync(path.join(dir,'roles/economy/ECONOMY_CHECK.json'),'utf8'));
const widths=economy.assumptions.widths;
const colorSuccess=widths.red*.1+widths.yellow*.5+widths.green;
const spec=fs.readFileSync(path.join(dir,'SPEC.md'),'utf8');
const checks={productFilesUnchanged:changed.length===0&&added.length===0,allLocalMarkdownLinksExist:broken.length===0,firstOnlySecondUndefined:spec.includes('第二版尚未定义'),fifteenGaugeCharges:spec.includes('每进入一次收鱼进度条扣1次，空挥不扣'),singleRunningPlan:spec.includes('同时只能运行一个计划'),newRegionCounts:region.regions===17&&region.species===56&&region.routes===272&&region.marketCells===952,lootTableSums:9740+150+20+10+4*20===10000,economyUsesFirstEditionTable:economy.assumptions.editionOneLoot.fishProbability===.974&&economy.assumptions.editionOneLoot.nonFishDirectSalePerSuccess===.233,colorsSumOne:Math.abs(Object.values(widths).reduce((s,x)=>s+x,0)-1)<1e-12,uniformColorSuccess:Math.abs(colorSuccess-.425)<1e-12,no17AreaCalibrationClaim:spec.includes('不能把旧12区结果套过去'),mixedHourlyWithinBounds:(3600*50*.65/101)>(3600*50*.3/110)&&(3600*50*.65/101)<(3600*50/92)};
const runtime={node:process.version,pnpmDeclared:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).packageManager};
const result={date:'2026-10-27',status:Object.values(checks).every(Boolean)?'PLAN_DOCUMENT_AND_ARITHMETIC_CHECK_PASS':'CHECK_FAILED',implemented:false,checks,runtime,productSnapshotFiles:Object.keys(before.files).length,productChanged:changed,productAdded:added,markdownFiles:md.length,checkedLocalLinks:checkedLinks,brokenLinks:broken,primaryDocHashes:Object.fromEntries(['SPEC.md','REGIONS.md','REGION_CANDIDATE.json','FORK_RECORD.json'].map(p=>[p,sha(fs.readFileSync(path.join(dir,p)))])),notValidated:['No first-edition product implementation or migration','No final17-region expected-reward calibration','No verified new coordinates or completed angling evidence','No UI, keyboard, timer, network, executable, installer or release acceptance']};
fs.writeFileSync(path.join(dir,'PLAN_CHECK.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
if(!Object.values(checks).every(Boolean))process.exitCode=1;
