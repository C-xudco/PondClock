const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const archive = path.join(root, 'release/win-unpacked/resources/app.asar');
const installer = path.join(root, 'release/PondClock-Setup-1.0.0-x64.exe');
const files = ['build-desktop/index.html'];
const walk = (relative) => {
  for (const item of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const name = `${relative}/${item.name}`;
    if (item.isDirectory()) walk(name);
    else if (/\.(js|cjs)$/.test(name)) files.push(name);
  }
};
for (const directory of ['desktop', 'src/domain', 'src/config', 'src/data']) walk(directory);
files.push('src/lib/gameConfig.js');
const index = fs.readFileSync(path.join(root, 'build-desktop/index.html'), 'utf8');
for (const match of index.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)) files.push(`build-desktop/${match[1]}`);
for (const file of files) {
  if (!fs.readFileSync(path.join(root, file)).equals(asar.extractFile(archive, path.normalize(file)))) throw new Error(`Packed resource differs: ${file}`);
}
if (!fs.readFileSync(path.join(root, 'desktop/assets/icon.ico')).equals(fs.readFileSync(path.join(root, 'release/win-unpacked/resources/icon.ico')))) throw new Error('Application icon resource missing or mismatched');
const bytes = fs.readFileSync(installer);
if (bytes.subarray(0, 2).toString() !== 'MZ') throw new Error('Not a Windows executable');
const report = { checkedOn: '2026-10-20', installer: path.basename(installer), bytes: bytes.length,
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  packedRuntimeFilesMatch: files, productionSandboxConfigured: fs.readFileSync(path.join(root, 'desktop/main.cjs'), 'utf8').includes('sandbox: true') };
fs.writeFileSync(path.join(root, 'docs/RELEASE_CHECK.json'), JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'release/SHA256SUMS.txt'), `${report.sha256}  ${report.installer}\n`);
console.log(JSON.stringify({ installer: report.installer, bytes: report.bytes, sha256: report.sha256, matchingFiles: files.length }));
