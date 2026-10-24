const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const FORMAT = 'pondclock.save';
const ENVELOPE_VERSION = 1;
const MAX_SAVE_BYTES = 16 * 1024 * 1024;

function storageError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function checksum(snapshot) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

function serializeSnapshot(snapshot) {
  const json = JSON.stringify(snapshot);
  if (Buffer.byteLength(json, 'utf8') > MAX_SAVE_BYTES) {
    throw storageError('SAVE_TOO_LARGE', '存档超过 16 MB 上限，请先导出备份。');
  }
  return JSON.parse(json);
}

function createSaveRepository({ directory, validate, fileSystem = fs, supportedSchemaVersion = validate?.supportedSchemaVersion ?? 1 }) {
  if (!path.isAbsolute(directory) || typeof validate !== 'function') {
    throw new TypeError('An absolute directory and snapshot validator are required.');
  }
  const slots = ['save-a.json', 'save-b.json'].map((name) => path.join(directory, name));
  let queue = Promise.resolve();
  const serial = (action) => {
    const pending = queue.then(action);
    queue = pending.catch(() => {});
    return pending;
  };

  async function readSlot(filename) {
    try {
      const stat = await fileSystem.stat(filename);
      if (stat.size > MAX_SAVE_BYTES + 4096) throw storageError('SAVE_TOO_LARGE', '存档文件过大。');
      const envelope = JSON.parse(await fileSystem.readFile(filename, 'utf8'));
      if (envelope.format === FORMAT && Number.isSafeInteger(envelope.envelopeVersion) && envelope.envelopeVersion > ENVELOPE_VERSION) {
        return { filename, future: true, revision: envelope.revision };
      }
      if (envelope.format !== FORMAT || envelope.envelopeVersion !== ENVELOPE_VERSION ||
          !Number.isSafeInteger(envelope.revision) || envelope.revision < 0 ||
          envelope.snapshot?.revision !== envelope.revision ||
          envelope.checksum !== checksum(envelope.snapshot)) {
        throw storageError('SAVE_CORRUPT', '存档封装、修订号或校验和无效。');
      }
      if (envelope.snapshot.schemaVersion > supportedSchemaVersion) {
        return { filename, future: true, revision: envelope.revision };
      }
      const snapshot = validate(envelope.snapshot);
      return { filename, snapshot, digest: checksum(snapshot), revision: snapshot.revision,
        originalSchemaVersion: envelope.snapshot.schemaVersion };
    } catch (error) {
      if (error.code === 'ENOENT') return { filename, missing: true };
      return { filename, error };
    }
  }

  async function loadInternal() {
    const candidates = await Promise.all(slots.map(readSlot));
    if (candidates.some((candidate) => candidate.future)) {
      throw storageError('SAVE_NEWER_VERSION', '发现较新版本的存档。请使用新版应用打开，原文件已保留。');
    }
    const valid = candidates.filter((candidate) => candidate.snapshot)
      .sort((a, b) => b.revision - a.revision);
    if (valid.length > 1 && valid[0].revision === valid[1].revision && valid[0].digest !== valid[1].digest) {
      throw storageError('SAVE_CONFLICT', '两个存档槽有相同修订号但内容不同，已停止写入以保留原档。');
    }
    const errors = candidates.filter((candidate) => candidate.error);
    if (!valid.length && errors.length) {
      throw storageError('SAVE_RECOVERY_REQUIRED', '两个存档槽均无法恢复。请从导出备份导入，原文件已保留。');
    }
    let migrated = false;
    if (valid[0] && valid[0].snapshot.schemaVersion > valid[0].originalSchemaVersion) {
      // Retain exact original bytes in both slots before replacing a legacy slot.
      // Deterministic filenames make interrupted migration retry safe and bounded.
      for (const filename of slots) {
        let original;
        try {
          original = await fileSystem.readFile(filename);
        } catch (error) {
          if (error.code === 'ENOENT') continue;
          throw storageError('SAVE_MIGRATION_FAILED', '旧档读取失败，原存档已保留。', error);
        }
        try {
          const digest = createHash('sha256').update(original).digest('hex');
          const backup = `${filename}.pre-schema${valid[0].snapshot.schemaVersion}-${digest}.bak`;
          try { await fileSystem.writeFile(backup, original, { flag: 'wx', mode: 0o600 }); }
          catch (error) {
            if (error.code !== 'EEXIST' || !Buffer.from(await fileSystem.readFile(backup)).equals(Buffer.from(original))) throw error;
          }
        } catch (error) {
          throw storageError('SAVE_MIGRATION_FAILED', '旧档备份失败，原存档已保留。', error);
        }
      }
      await writeSnapshot(valid[0].snapshot, valid[0].filename);
      migrated = true;
    }
    return {
      snapshot: valid[0]?.snapshot ?? null,
      recovery: {
        recovered: Boolean(valid.length && errors.length),
        invalidSlots: errors.map((candidate) => path.basename(candidate.filename)),
        backupAvailable: valid.length > 1,
        migrated,
      },
    };
  }

  async function writeSnapshot(normalized, target = slots[normalized.revision % 2]) {
    await fileSystem.mkdir(directory, { recursive: true });
    const temporary = path.join(directory, `.save-${randomUUID()}.tmp`);
    const envelope = {
      format: FORMAT, envelopeVersion: ENVELOPE_VERSION, revision: normalized.revision,
      checksum: checksum(normalized), snapshot: normalized,
    };
    let handle;
    try {
      handle = await fileSystem.open(temporary, 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify(envelope)}\n`, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      await fileSystem.rename(temporary, target);
      const verified = await readSlot(target);
      if (!verified.snapshot || verified.digest !== checksum(normalized)) {
        throw storageError('SAVE_COMMIT_UNKNOWN', '写入后的验证未成功，请重新读取存档确认结果。');
      }
      return verified.snapshot;
    } catch (error) {
      if (error.code === 'SAVE_COMMIT_UNKNOWN') throw error;
      throw storageError('SAVE_WRITE_FAILED', '存档写入失败，请重新读取存档确认已提交状态。', error);
    } finally {
      if (handle) await handle.close().catch(() => {});
      await fileSystem.unlink(temporary).catch(() => {});
    }
  }

  async function commitInternal(input, { imported = false } = {}) {
    const snapshot = validate(serializeSnapshot(input));
    if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) {
      throw storageError('SAVE_INVALID_REVISION', '存档修订号必须为非负整数。');
    }
    let loaded;
    try {
      loaded = await loadInternal();
    } catch (error) {
      if (!imported || !['SAVE_RECOVERY_REQUIRED', 'SAVE_CONFLICT'].includes(error.code)) throw error;
      // A conflict does not mean there is no existing revision. The imported
      // snapshot must supersede every valid original slot after a restart.
      const candidates = await Promise.all(slots.map(readSlot));
      if (candidates.some((candidate) => candidate.future)) {
        throw storageError('SAVE_NEWER_VERSION', '发现较新版本的存档。请使用新版应用打开，原文件已保留。');
      }
      const highestRevision = Math.max(-1, ...candidates.filter((candidate) => candidate.snapshot).map((candidate) => candidate.revision));
      // An explicit import may repair corrupt slots; copy both originals before replacing either.
      await fileSystem.mkdir(directory, { recursive: true });
      const recoveryId = randomUUID();
      for (const filename of slots) {
        let original;
        try {
          original = await fileSystem.readFile(filename);
        } catch (backupError) {
          if (backupError.code === 'ENOENT') continue;
          throw storageError('SAVE_RECOVERY_BACKUP_FAILED', '恢复前读取原档失败，原文件已保留。', backupError);
        }
        try {
          await fileSystem.writeFile(`${filename}.recovery-${recoveryId}.bak`, original, { flag: 'wx', mode: 0o600 });
        } catch (backupError) {
          throw storageError('SAVE_RECOVERY_BACKUP_FAILED', '恢复前备份失败，原文件已保留。', backupError);
        }
      }
      loaded = { snapshot: null, highestRevision,
        recovery: { recovered: true, invalidSlots: slots.map((filename) => path.basename(filename)), backupAvailable: true } };
    }
    const current = loaded.snapshot;
    if (!imported && current && snapshot.revision === current.revision && checksum(snapshot) === checksum(current)) {
      return { status: 'already-committed', snapshot: current, recovery: loaded.recovery };
    }
    if (!imported && ((current && snapshot.revision !== current.revision + 1) ||
        (!current && ![0, 1].includes(snapshot.revision)))) {
      throw storageError('SAVE_REVISION_CONFLICT', '存档修订号冲突，请重新读取已提交存档后恢复。');
    }
    if (!imported && current && snapshot.lastEffectiveNowMs < current.lastEffectiveNowMs) {
      throw storageError('SAVE_REVISION_CONFLICT', '存档逻辑时间不能倒退，请重新读取已提交存档后恢复。');
    }
    if (imported) snapshot.revision = Math.max(current?.revision ?? -1, loaded.highestRevision ?? -1) + 1;
    const normalized = validate(snapshot);
    const saved = await writeSnapshot(normalized);
    if (imported) {
      const verified = await loadInternal();
      if (!verified.snapshot || checksum(verified.snapshot) !== checksum(saved)) {
        throw storageError('SAVE_COMMIT_UNKNOWN', '导入后的完整存档核验未成功，请重新读取存档确认结果。');
      }
    }
    return { status: 'committed', snapshot: saved, recovery: loaded.recovery };
  }

  return Object.freeze({
    load: () => serial(loadInternal),
    save: (snapshot) => serial(() => commitInternal(snapshot)),
    // The caller must first confirm an explicit file-dialog import. This never runs on startup.
    importSnapshot: (snapshot) => serial(() => commitInternal(snapshot, { imported: true })),
  });
}

module.exports = { createSaveRepository, checksum, MAX_SAVE_BYTES };
