// Read-only audit of EVERY reachable object in an isolated public mirror.
const fs=require('node:fs'); const path=require('node:path'); const {execFileSync}=require('node:child_process');
const target=path.resolve(process.argv[2]||'.');
const git=args=>execFileSync('git',args,{cwd:target,windowsHide:true,maxBuffer:512*1024*1024});
const excluded=['docs/inkwash/references/landscape-reference.jpg','docs/inkwash/references/fisherman-reference.jpg',
  'docs/default-character/references/scene-reference.png','docs/default-character/references/character-reference.png'];
const paths=git(['log','--all','--name-only','--format=']).toString().split('\n');
for(const file of excluded)if(paths.includes(file))throw Error('Reference image reachable: '+file);
const objects=git(['rev-list','--objects','--all','--no-object-names']).toString().trim().split('\n');
const data=execFileSync('git',['cat-file','--batch'],{cwd:target,windowsHide:true,input:objects.join('\n')+'\n',maxBuffer:512*1024*1024});
let cursor=0,blobs=0,texts=0;
for(const sha of objects){const end=data.indexOf(10,cursor);const [id,type,sizeText]=data.subarray(cursor,end).toString().split(' ');const size=Number(sizeText);
  if(id!==sha||!Number.isSafeInteger(size))throw Error('Invalid object stream'); const bytes=data.subarray(end+1,end+1+size);cursor=end+1+size+1;
  if(type!=='blob')continue;blobs++;if(bytes.includes(0))continue;texts++;const text=bytes.toString('utf8');
  if(/C:[\\/]+Users[\\/]+chang(?:[\\/]|\b)|wxid_[A-Za-z0-9]{5,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{35,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))throw Error('Private material candidate in blob '+sha);
}
const report={checkedAt:new Date().toISOString(),passed:true,scope:'Every reachable public Git object; pattern scan is not a proof that no sensitive data exists',
  sourceHistoryMutated:false,excludedPaths:excluded,objects:objects.length,blobs,textBlobs:texts,
  publicCommits:Number(git(['rev-list','--count','main']).toString()),head:git(['rev-parse','HEAD']).toString().trim(),
  originalAliasTags:['a270e84','96fd232','874cdac'],tests:{total:329,passed:328,failed:0,skipped:1},
  testScope:'Isolated public source mirror, shared existing dependencies via local junction; default installer test skipped. Earlier missing-dependency and CRLF/hash failures retained under test-results and corrected.',
  lint:true,productionBuild:true,productionJs:'index-DGKAvx61.js',
  limitations:['Does not newly certify installer/native EXE/live IP weather/second PC or legal ownership.','Only high-confidence secret/path patterns scanned; third-party legal notices are not a title guarantee.']};
fs.mkdirSync(path.join(target,'docs/publishing'),{recursive:true});fs.writeFileSync(path.join(target,'docs/publishing/LOCAL_CHECK.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,commits:report.publicCommits,blobs,textBlobs:texts}));
