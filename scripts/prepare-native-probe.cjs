// Make an isolated offline profile for ordinary final EXE verification.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createNewGame } = require('../src/domain/gameState.js');
const { validateSave } = require('../src/domain/saveSchema.js');
const { createSaveRepository } = require('../desktop/saveRepository.cjs');
const { version } = require('../package.json');
async function main() {
  const root = path.resolve(__dirname, '..');
  const parent = path.join(root, 'test-results');
  await fs.mkdir(parent, { recursive: true });
  const directory = await fs.mkdtemp(path.join(parent, `native-${version}-`));
  const profile = path.join(directory, 'profile');
  const initial = createNewGame('jiangnan', Date.now());
  const snapshot = validateSave({ ...initial, settings: { ...initial.settings, onlineEnhancements: false } });
  await createSaveRepository({ directory: path.join(profile, 'saves'), validate: validateSave }).save(snapshot);
  const report = { createdAt: new Date().toISOString(), version, directory, profile,
    network: 'Offline preference; command-line blocked proxy is also required for the probe.',
    expectedNormalSandbox: true, passed: false };
  await fs.writeFile(path.join(parent, 'native-probe-latest.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
