const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = ['README.md', 'docs/HISTORY_1.1.1.md', 'docs/HISTORY_1.2.0.md', 'docs/HISTORY_1.3.0.md'];
function walk(relative) {
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const name = `${relative}/${entry.name}`;
    if (entry.isDirectory()) walk(name);
    else if (name.endsWith('.md')) files.push(name);
  }
}
for (const directory of ['docs/team', 'docs/next-iteration', 'docs/inkwash', 'docs/style-packs', 'docs/default-character']) walk(directory);
const broken = [];
let checked = 0;
for (const file of files) {
  const markdown = fs.readFileSync(path.join(root, file), 'utf8');
  for (const match of markdown.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^(https?:|mailto:|plugin:)/.test(target)) continue;
    const filename = path.isAbsolute(target) ? target : path.resolve(root, path.dirname(file), target);
    checked++;
    if (!fs.existsSync(filename)) broken.push({ file, target });
  }
}
const report = { checkedAt: new Date().toISOString(), markdownFiles: files.length, localLinks: checked,
  broken, passed: broken.length === 0, scope: 'Local link existence only, not feature or external-source verification.' };
fs.writeFileSync(path.join(root, 'docs/next-iteration/LINK_CHECK.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
if (broken.length) process.exitCode = 1;
