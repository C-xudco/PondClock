const path = require('node:path');

function resolveUserDataDirectory(argument, defaultDirectory, paths = path) {
  if (!argument) return defaultDirectory;
  const fullyQualifiedWindowsPath = /^(?:[a-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+(?:[\\/]|$))/i;
  if (typeof argument !== 'string' || argument.includes('\0') || !paths.isAbsolute(argument) ||
      (paths === path.win32 && (!fullyQualifiedWindowsPath.test(argument) || /^[\\/]{2}[?.][\\/]/.test(argument)))) {
    throw Object.assign(new Error('--user-data-dir 必须是完整绝对路径。'), { code: 'INVALID_USER_DATA_DIR' });
  }
  return paths.resolve(argument);
}

// Only operations accepted before shutdown are drained. The repository retains its own
// serial transaction queue; this controller does not reorder or retry those operations.
function createShutdownController({ finish, onWriteFailure = async () => {} }) {
  const pending = new Set();
  let requested = false;
  let ready = false;
  let exitCode = 0;
  let completion;

  function runWrite(action) {
    if (requested) {
      return Promise.reject(Object.assign(new Error('应用正在退出，请重新打开后继续操作。'), { code: 'APP_QUITTING' }));
    }
    const operation = Promise.resolve().then(action);
    pending.add(operation);
    operation.then(() => pending.delete(operation), () => pending.delete(operation));
    return operation;
  }

  function requestQuit({ code = 0 } = {}) {
    exitCode = Math.max(exitCode, code);
    if (completion) return completion;
    requested = true;
    completion = (async () => {
      const results = await Promise.allSettled([...pending]);
      for (const result of results) {
        if (result.status === 'rejected') {
          try { await onWriteFailure(result.reason); } catch { /* Logging must not prevent exit. */ }
        }
      }
      ready = true;
      finish(exitCode);
    })();
    return completion;
  }

  return Object.freeze({ runWrite, requestQuit, isQuitting: () => requested, isReady: () => ready });
}

function createStartupGuard({ onReady, onFailure, timeoutMs = 30000, schedule = setTimeout, cancel = clearTimeout }) {
  let failed = false;
  let stopped = false;
  let visible = false;
  const timer = schedule(() => fail('WINDOW_SHOW_TIMEOUT'), timeoutMs);
  timer?.unref?.();

  function fail(reason, error) {
    if (failed || stopped) return;
    failed = true;
    cancel(timer);
    onFailure(reason, error);
  }

  function ready() {
    if (failed || stopped || visible) return;
    visible = true;
    cancel(timer);
    onReady();
  }

  function stop() { stopped = true; cancel(timer); }
  return Object.freeze({ ready, fail, stop });
}

// Error messages and stacks can contain URLs, IPs, or document contents. Keep a
// small diagnostic vocabulary instead; the startup log never serializes an error.
function startupLogRecord(event, error, now = new Date()) {
  const safeToken = (value) => typeof value === 'string' && /^[a-z0-9_-]{1,64}$/i.test(value) ? value : undefined;
  return JSON.stringify({ at: now.toISOString(), event: safeToken(event) || 'UNKNOWN_EVENT',
    name: safeToken(error?.name), code: safeToken(String(error?.code ?? '')) });
}

module.exports = { resolveUserDataDirectory, createShutdownController, createStartupGuard, startupLogRecord };
