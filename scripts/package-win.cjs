const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const portableOnly = process.argv.includes('--portable-only');
const temporary = path.join(root, '.cache', 'nsis-temp');
fs.mkdirSync(temporary, { recursive: true });
// Keep NSIS !tempfile and downloadable build tools in a writable project directory.
// These environment changes apply only to this child, not Windows/global settings.
const child = spawn(process.execPath, [path.join(root, 'node_modules', 'electron-builder', 'cli.js'),
  '--config', 'electron-builder.yml', '--win', ...(portableOnly ? ['zip'] : ['nsis', 'zip']), '--x64', '--publish', 'never',
  ...process.argv.slice(2).filter(argument => argument !== '--portable-only')], {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, TEMP: temporary, TMP: temporary,
    ELECTRON_CACHE: path.join(root, '.cache', 'electron'),
    ELECTRON_BUILDER_CACHE: path.join(root, '.cache', 'electron-builder') },
});
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
