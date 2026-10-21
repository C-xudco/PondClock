const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const { version } = require('../package.json');
const { GAME_VERSION } = (() => {
  const config = fs.readFileSync(path.join(root, 'src/config/storage.js'), 'utf8');
  return { GAME_VERSION: config.match(/export const GAME_VERSION = '([^']+)'/)?.[1] };
})();
if (GAME_VERSION !== version) throw new Error('Package and game versions differ');
const archive = path.join(root, 'release/win-unpacked/resources/app.asar');
const installer = path.join(root, `release/PondClock-Setup-${version}-x64.exe`);
const portable = path.join(root, `release/PondClock-${version}-x64.zip`);
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
const portableBytes = fs.readFileSync(portable);
if (portableBytes.subarray(0, 2).toString() !== 'PK') throw new Error('Not a ZIP archive');
const packedPackage = JSON.parse(asar.extractFile(archive, 'package.json'));
if (packedPackage.version !== version) throw new Error('Packed package version differs');
const report = { checkedAt: new Date().toISOString(), version, installer: path.basename(installer), bytes: bytes.length,
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  portable: { file: path.basename(portable), bytes: portableBytes.length,
    sha256: crypto.createHash('sha256').update(portableBytes).digest('hex') },
  installerExtensionSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'desktop/installer.nsh'))).digest('hex'),
  packedRuntimeFilesMatch: files, productionSandboxConfigured: fs.readFileSync(path.join(root, 'desktop/main.cjs'), 'utf8').includes('sandbox: true') };
fs.writeFileSync(path.join(root, 'docs/RELEASE_CHECK.json'), JSON.stringify(report, null, 2) + '\n');
const artifacts = fs.readdirSync(path.join(root, 'release')).filter((name) => /^PondClock-(?:Setup-)?[\d.]+-x64\.(?:exe|zip)$/.test(name));
fs.writeFileSync(path.join(root, 'release/SHA256SUMS.txt'), artifacts.sort().map((name) =>
  `${crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'release', name))).digest('hex')}  ${name}\n`).join(''));
console.log(JSON.stringify({ installer: report.installer, portable: report.portable.file, bytes: report.bytes, sha256: report.sha256, matchingFiles: files.length }));
