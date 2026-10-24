import { validateSave } from '../domain/saveSchema.js';
import { STORAGE_CONFIG } from '../config/storage.js';
import { stableSeed } from '../domain/loot.js';

export function createRepository() {
  if (window.pondDesktop) return window.pondDesktop;
  const keys = [STORAGE_CONFIG.webKey, `${STORAGE_CONFIG.webKey}.backup`];
  const loadSave = async () => {
    const valid = [], errors = [];
    let future = false;
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.schemaVersion > STORAGE_CONFIG.schemaVersion) { future = true; continue; }
        valid.push({ snapshot: validateSave(parsed), raw, key, originalSchemaVersion: parsed.schemaVersion });
      } catch (e) { errors.push(e.message); }
    }
    valid.sort((a, b) => b.snapshot.revision - a.snapshot.revision);
    if (future) throw new Error('发现较新版本的存档，请使用新版应用；原文件已保留');
    if (valid.length > 1 && valid[0].snapshot.revision === valid[1].snapshot.revision && JSON.stringify(valid[0].snapshot) !== JSON.stringify(valid[1].snapshot)) throw new Error('同修订号存档内容冲突，请保留备份并恢复');
    if (!valid.length && errors.length) throw new Error('存档损坏，原文件已保留，请导入备份');
    let migrated = false;
    if (valid[0] && valid[0].originalSchemaVersion < STORAGE_CONFIG.schemaVersion) {
      // localStorage.setItem is atomic per key; first retain every original slot.
      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const backupKey = `${key}.pre-schema${STORAGE_CONFIG.schemaVersion}.${stableSeed(raw).toString(16)}-${raw.length}`;
        const existing = localStorage.getItem(backupKey);
        if (existing !== null && existing !== raw) throw new Error('旧档备份冲突，原存档已保留');
        if (existing === null) localStorage.setItem(backupKey, raw);
      }
      const normalized = JSON.stringify(valid[0].snapshot);
      localStorage.setItem(valid[0].key, normalized);
      if (localStorage.getItem(valid[0].key) !== normalized) throw new Error('迁移保存未确认，原档备份已保留');
      migrated = true;
    }
    return { snapshot: valid[0]?.snapshot || null,
      recovery: errors.length || migrated ? { recovered: errors.length > 0, migrated, message: errors.length ? '已从备用存档恢复' : '旧档已备份并迁移' } : null };
  };
  return {
    loadSave,
    async saveGame(input) {
      const snapshot = validateSave(input);
      const current = (await loadSave()).snapshot;
      if (current && current.revision === snapshot.revision && JSON.stringify(current) === JSON.stringify(snapshot)) return { status: 'already-committed', snapshot: current };
      if (current && snapshot.revision !== current.revision + 1) throw new Error('存档版本冲突');
      if (!current && ![0, 1].includes(snapshot.revision)) throw new Error('新存档修订号无效');
      if (current && snapshot.lastEffectiveNowMs < current.lastEffectiveNowMs) throw new Error('存档逻辑时间不能倒退');
      const key = keys[snapshot.revision % keys.length];
      localStorage.setItem(key, JSON.stringify(snapshot));
      validateSave(JSON.parse(localStorage.getItem(key)));
      return { status: 'committed', snapshot };
    },
    async exportSave(snapshot) {
      const url = URL.createObjectURL(new Blob([JSON.stringify(validateSave(snapshot), null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'pondclock-save.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { canceled: false };
    },
  };
}
