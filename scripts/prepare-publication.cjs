// Build a NEW sanitized Git repository. The source repository/history is read-only.
// No network or credentials. Review the output before pushing any ref.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname,'..');
const target = path.resolve(process.argv[2] || path.join(root,'test-results','github-publication'));
if (!target.startsWith(path.resolve('X:/game')+path.sep) || target === root || fs.existsSync(target)) throw Error('Use a new destination inside X:/game, separate from source');
const git = (args, options={}) => execFileSync('git', args, {cwd:root,windowsHide:true,maxBuffer:512*1024*1024,...options});
const excluded = new Set(['docs/inkwash/references/landscape-reference.jpg','docs/inkwash/references/fisherman-reference.jpg',
  'docs/default-character/references/scene-reference.png','docs/default-character/references/character-reference.png']);
const commits = git(['rev-list','--reverse','--topo-order','HEAD']).toString().trim().split('\n');
const all = new Map(); const trees = new Map();
for (const commit of commits) {
  const rows = git(['ls-tree','-rz',commit]).toString().split('\0').filter(Boolean).map(row=>{
    const split=row.indexOf('\t'); const [mode,type,sha]=row.slice(0,split).split(' '); return {mode,type,sha,file:row.slice(split+1)};
  }).filter(row=>!excluded.has(row.file));
  trees.set(commit,rows);
  for(const row of rows) { if(row.type!=='blob') throw Error('Unexpected submodule/tree'); all.set(row.sha,true); }
}
const shas=[...all.keys()];
const batch=git(['cat-file','--batch'],{input:shas.join('\n')+'\n'}); let cursor=0;
const objects=new Map();
for(const sha of shas) { const end=batch.indexOf(10,cursor); const header=batch.subarray(cursor,end).toString().split(' '); const size=Number(header[2]);
  if(header[0]!==sha||header[1]!=='blob'||!Number.isSafeInteger(size))throw Error('Invalid Git object stream');
  objects.set(sha,batch.subarray(end+1,end+1+size));cursor=end+1+size+1; }
const chunks=[]; let mark=1; const marks=new Map(); const changed=[]; const fileBySha=new Map();
for(const rows of trees.values())for(const row of rows)fileBySha.set(row.sha,row.file);
const write=text=>chunks.push(Buffer.from(text));
for(const [sha,bytes] of objects) {
  const file=fileBySha.get(sha); let safe=bytes;
  if(!bytes.includes(0) && /\.(md|txt|json|js|jsx|cjs|mjs|css|html|csv|ya?ml)$|(^|\/)LICENSE$/.test(file)) {
    let text=bytes.toString('utf8');
    if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{35,}/.test(text))throw Error('Potential credential in '+file+'; review locally');
    text=text.replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'<>]+/gi,'C:/Users/PUBLIC-USER');
    text=text.replace(/wxid_[A-Za-z0-9_]+/g,'WECHAT-USER-REMOVED');
    text=text.replace(/[A-Za-z]:[\\/]+doucument[\\/]+WeChat[^\r\n"'`)]*/gi,'LOCAL-REFERENCE-PATH-REMOVED');
    // Test membership line by line; an unanchored .* pattern is quadratic on
    // historical minified files and must not be run over the whole source blob.
    text=text.split('\n').filter(line=>!(line.includes('|') && line.includes('[docs/')
      && [...excluded].some(file=>line.includes('['+file+']')))).join('\n');
    text=text.replace(/!?\[[^\]]*\]\([^)]*(?:landscape-reference\.jpg|fisherman-reference\.jpg|scene-reference\.png|character-reference\.png)[^)]*\)/g,'（参考原图不包含在公开镜像，见版权说明）');
    if(text!==bytes.toString('utf8')) changed.push({blob:sha,file});
    safe=Buffer.from(text);
  }
  const id=mark++;marks.set(sha,id);write(`blob\nmark :${id}\ndata ${safe.length}\n`);chunks.push(safe);write('\n');
}
const map=[]; const commitMarks=new Map();
for(const commit of commits) {
  console.log('Sanitizing source commit '+commit.slice(0,7));
  const fields=git(['show','-s','--format=%an%x00%at%x00%aI%x00%B%x00%P',commit]).toString().trimEnd().split('\0');
  const [originalAuthor,time,iso,message,parentText]=fields; const parents=(parentText||'').split(' ').filter(Boolean);
  const author=['Codex','NoCode'].includes(originalAuthor)?originalAuthor:'C-xudco';
  const msg=Buffer.from(message.trimEnd()+`\n\nSource-Commit: ${commit}\nPublic mirror: reference originals excluded; personal paths normalized.\n`);
  const id=mark++;commitMarks.set(commit,id);write(`commit refs/heads/main\nmark :${id}\nauthor ${author} <162823386+C-xudco@users.noreply.github.com> ${time} +0800\ncommitter C-xudco <162823386+C-xudco@users.noreply.github.com> ${time} +0800\ndata ${msg.length}\n`);chunks.push(msg);write('\n');
  if(parents.length)write(`from :${commitMarks.get(parents[0])}\n`);
  for(const parent of parents.slice(1))write(`merge :${commitMarks.get(parent)}\n`);
  write('deleteall\n');for(const row of trees.get(commit))write(`M ${row.mode} :${marks.get(row.sha)} ${JSON.stringify(row.file)}\n`);write('\n');
  map.push({source:commit,date:iso,summary:message.split('\n')[0],mark:id});
}
// These two short aliases preserve the existing historical audit test inputs.
for(const ref of ['96fd232','874cdac']) {const source=commits.find(c=>c.startsWith(ref));if(source)write(`reset refs/tags/${ref}\nfrom :${commitMarks.get(source)}\n\n`);}
fs.mkdirSync(target,{recursive:true});git(['init','--initial-branch=main'],{cwd:target});
git(['fast-import','--quiet','--export-marks='+path.join(target,'.git','publication-marks')],{cwd:target,input:Buffer.concat(chunks)});
git(['reset','--hard','main'],{cwd:target});
const exported=new Map(fs.readFileSync(path.join(target,'.git','publication-marks'),'utf8').trim().split('\n').map(line=>line.split(' ')));
const history={preparedAt:new Date().toISOString(),sourceCommit:commits.at(-1),sourceUnchanged:true,excludedPaths:[...excluded],normalizedTextBlobs:changed,
  explanation:'Source SHAs are provenance identifiers only. Public commits have filtered trees and differ; two short tag aliases preserve historical tests. Original local history is unchanged.',
  commits:map.map(({mark,...row})=>({...row,public:exported.get(':'+mark)}))};
fs.mkdirSync(path.join(target,'docs/publishing'),{recursive:true});
fs.writeFileSync(path.join(target,'docs/publishing/HISTORY_MAP.json'),JSON.stringify(history,null,2)+'\n');
git(['add','docs/publishing/HISTORY_MAP.json'],{cwd:target});
git(['-c','user.name=C-xudco','-c','user.email=162823386+C-xudco@users.noreply.github.com','commit','-m','docs: record sanitized development history mapping'],{cwd:target});
console.log(JSON.stringify({target,commits:commits.length,excludedPaths:excluded.size,normalizedTextBlobs:changed.length,head:git(['rev-parse','HEAD'],{cwd:target}).toString().trim()}));
