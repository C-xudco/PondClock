// Read-only source audit. Outputs a compact structural summary, never changes game data.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const sourcePath = 'X:/全球可钓鱼类名录_10类栖息地与垂钓方式.txt';
const bytes = fs.readFileSync(sourcePath);
const source = bytes.toString('utf8').replace(/^\uFEFF/, '');
const speciesSection = source.split('五、按栖息地检索的物种编号索引')[0];
const starts = [...speciesSection.matchAll(/^\[(F\d{4})\] (.+)$/gm)];
const field = (text, key) => text.match(new RegExp('^' + key + '：(.+)$', 'm'))?.[1]?.trim() ?? '';
const records = starts.map((m, i) => {
  const block = speciesSection.slice(m.index, starts[i+1]?.index ?? speciesSection.length);
  const angling = block.match(/^垂钓方式【([^】]+)】[：:](.+)$/m);
  return { id:m[1], name:m[2].trim(), scientificName:field(block,'学名'), category:field(block,'收录类别').split('；')[0], ecology:field(block,'原始生态'), distribution:field(block,'快照原生分布标记示例（未逐条复核）'), habitats:[...field(block,'栖息地').matchAll(/H\d{2}/g)].map(x=>x[0]), methodLabel:angling?.[1]?.trim()??'', method:angling?.[2]?.trim()??'', block };
});
const count = (rows, key) => rows.reduce((o,r) => (o[r[key]]=(o[r[key]]??0)+1,o),{});
const duplicateNames = [...new Set(records.map(x=>x.scientificName))].filter(n=>records.filter(x=>x.scientificName===n).length>1);
const summary = { sourcePath, sha256:crypto.createHash('sha256').update(bytes).digest('hex'), bytes:bytes.length, utf8Bom:bytes.subarray(0,3).toString('hex')==='efbbbf', lines:source.split(/\r?\n/).length, total:records.length, categoryCounts:count(records,'category'), uniqueIds:new Set(records.map(x=>x.id)).size, uniqueScientificNames:new Set(records.map(x=>x.scientificName)).size, duplicateScientificNames:duplicateNames, missingScientificName:records.filter(x=>!x.scientificName).map(x=>x.id), contiguousIds:records.every((x,i)=>x.id==='F'+String(i+1).padStart(4,'0')), habitatCounts:Object.fromEntries(Array.from({length:10},(_,i)=>'H'+String(i+1).padStart(2,'0')).map(h=>[h,records.filter(r=>r.habitats.includes(h)).length])), freshwaterFlag:records.filter(r=>r.ecology.startsWith('淡水')).length, chinaExample:records.filter(r=>/中国大陆/.test(r.distribution)).length };
summary.methodLabelNonEmptyCount = records.filter(r=>r.methodLabel).length;
summary.methodTextNonEmptyCount = records.filter(r=>r.method).length;
summary.missingMethodRecordIds = records.filter(r=>!r.methodLabel||!r.method).map(r=>r.id);
if (process.argv[2] === 'blocks') {
  const requested = process.argv.slice(3);
  console.log(records.filter(r=>requested.includes(r.id)||requested.some(q=>r.name.includes(q)||r.scientificName.toLowerCase().includes(q.toLowerCase()))).map(r=>r.block).join('\n'));
} else if (process.argv[2] === 'fresh') {
  console.log(records.filter(r=>r.ecology.startsWith('淡水')).map(r=>[r.id,r.category,r.name,r.scientificName,r.distribution].join(' | ')).join('\n'));
} else if (process.argv[2] === 'summary') {
  console.log(JSON.stringify(summary,null,2));
} else if (process.argv[2] === 'existing') {
  const {FISH} = require(path.resolve(__dirname,'../../../../src/lib/gameConfig.js'));
  console.log(FISH.map(f=>[f.id,f.name,records.filter(r=>r.name.includes(f.name)).map(r=>r.id+':'+r.scientificName).join(';')].join(' | ')).join('\n'));
} else {
  module.exports = { summary, records };
}
