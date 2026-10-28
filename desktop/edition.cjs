const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const EDITION = Object.freeze({ id: 'first-focus', appId: 'cn.pondclock.focus', profile: 'PondClock-Focus' });

// Read old envelopes directly: opening an old repository with a new validator
// could migrate its slots in place. Only the new profile is ever written here.
async function importLegacyCopy({ legacyDirectory, newDirectory, repository, validate, fileSystem = fs }) {
  if ((await repository.load()).snapshot) return { imported: false };
  const candidates = [];
  for (const name of ['save-a.json', 'save-b.json']) {
    let raw;
    try { raw = await fileSystem.readFile(path.join(legacyDirectory, name)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (raw.length > 16 * 1024 * 1024 + 4096) throw new Error('旧版存档过大，原件未改动，请手动导入。');
    try {
      const envelope = JSON.parse(raw.toString('utf8'));
      if (envelope.snapshot?.schemaVersion > 3 ||
          (envelope.format === 'pondclock.save' && envelope.envelopeVersion > 1)) {
        throw new Error('旧目录含较新存档，请手动选择兼容备份。');
      }
      const digest = createHash('sha256').update(JSON.stringify(envelope.snapshot)).digest('hex');
      if (envelope.format !== 'pondclock.save' || envelope.envelopeVersion !== 1 ||
          envelope.checksum !== digest || envelope.revision !== envelope.snapshot?.revision) throw new Error('旧存档校验失败。');
      candidates.push({ raw, name, revision: envelope.revision, snapshot: validate(envelope.snapshot), digest });
    } catch (error) {
      candidates.push({ raw, name, error });
    }
  }
  const valid = candidates.filter(entry => entry.snapshot).sort((a, b) => b.revision - a.revision);
  if (!candidates.length) return { imported: false };
  if (!valid.length || candidates.some(entry => /较新存档/.test(entry.error?.message || ''))) {
    throw new Error('旧版进度未自动导入，原件完整保留；请在设置里选择备份。');
  }
  if (valid[1]?.revision === valid[0].revision && valid[1].digest !== valid[0].digest) {
    throw new Error('旧版存档槽冲突，原件未改动，请手动选择备份。');
  }
  const backup = path.join(newDirectory, 'legacy-copy');
  await fileSystem.mkdir(backup, { recursive: true });
  for (const entry of candidates) {
    const fingerprint = createHash('sha256').update(entry.raw).digest('hex');
    const filename = path.join(backup, `${entry.name}.${fingerprint}.bak`);
    try { await fileSystem.writeFile(filename, entry.raw, { flag: 'wx', mode: 0o600 }); }
    catch (error) {
      if (error.code !== 'EEXIST' || !(await fileSystem.readFile(filename)).equals(entry.raw)) throw error;
    }
  }
  await repository.importLegacySnapshot(valid[0].snapshot);
  return { imported: true };
}

module.exports = { EDITION, importLegacyCopy };
