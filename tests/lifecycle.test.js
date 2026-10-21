import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { validateSave } from '../src/domain/saveSchema.js';
import { createNewGame } from '../src/domain/gameState.js';
import { DEFAULT_REGION } from '../src/lib/gameConfig.js';

const require = createRequire(import.meta.url);
const { createSaveRepository } = require('../desktop/saveRepository.cjs');
const { resolveUserDataDirectory, createShutdownController, createStartupGuard, startupLogRecord } = require('../desktop/lifecycle.cjs');
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('quit waits for the actual atomic save and refuses new writes while closing', async (t) => {
  const temporaryRoot = path.resolve('tests', '.tmp');
  await fs.mkdir(temporaryRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(temporaryRoot, 'pondclock-lifecycle-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), temporaryRoot);
    assert.ok(path.basename(directory).startsWith('pondclock-lifecycle-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const renameStarted = deferred();
  const allowRename = deferred();
  const repository = createSaveRepository({ directory, validate: validateSave, fileSystem: {
    ...fs, rename: async (...args) => { renameStarted.resolve(); await allowRename.promise; return fs.rename(...args); },
  } });
  const exits = [];
  const lifecycle = createShutdownController({ finish: (code) => exits.push(code) });
  const snapshot = createNewGame(DEFAULT_REGION);
  const accepted = lifecycle.runWrite(() => repository.save(snapshot));
  await renameStarted.promise;
  const closing = lifecycle.requestQuit();
  assert.equal(lifecycle.isQuitting(), true);
  assert.equal(lifecycle.isReady(), false);
  assert.deepEqual(exits, []);
  let unexpectedWrite = false;
  await assert.rejects(lifecycle.runWrite(() => { unexpectedWrite = true; }), { code: 'APP_QUITTING' });
  assert.equal(unexpectedWrite, false);
  allowRename.resolve();
  await accepted;
  await closing;
  assert.equal(lifecycle.isReady(), true);
  assert.deepEqual(exits, [0]);
  const restarted = createSaveRepository({ directory, validate: validateSave });
  assert.deepEqual((await restarted.load()).snapshot, snapshot);
});

test('repeated quit requests share a drain and a failed pending write cannot strand the process', async () => {
  const write = deferred();
  const failures = [];
  const exits = [];
  const lifecycle = createShutdownController({ finish: (code) => exits.push(code),
    onWriteFailure: async (error) => { failures.push(error.code); throw new Error('Log directory unavailable'); } });
  const accepted = lifecycle.runWrite(() => write.promise);
  const rejected = assert.rejects(accepted, { code: 'SAVE_WRITE_FAILED' });
  const first = lifecycle.requestQuit();
  assert.equal(lifecycle.requestQuit({ code: 1 }), first);
  write.reject(Object.assign(new Error('Disk unavailable'), { code: 'SAVE_WRITE_FAILED' }));
  await rejected;
  await first;
  assert.deepEqual(failures, ['SAVE_WRITE_FAILED']);
  assert.deepEqual(exits, [1]);
});

test('a quit immediately after accepting a write still executes and drains it', async () => {
  const events = [];
  const lifecycle = createShutdownController({ finish: () => events.push('exit') });
  const accepted = lifecycle.runWrite(async () => { events.push('saved'); });
  await lifecycle.requestQuit();
  await accepted;
  assert.deepEqual(events, ['saved', 'exit']);
});

function guardHarness() {
  const events = [];
  let timerCallback;
  let timerActive = false;
  const guard = createStartupGuard({
    onReady: () => events.push('visible'),
    onFailure: (reason) => events.push(reason),
    schedule: (callback) => { timerCallback = callback; timerActive = true; return 1; },
    cancel: () => { timerActive = false; },
  });
  return { guard, events, fire: () => { if (timerActive) timerCallback(); } };
}

test('a window that never shows fails once and cannot later appear behind the failure dialog', () => {
  const { guard, events, fire } = guardHarness();
  fire();
  guard.ready();
  guard.fail('DOCUMENT_LOAD_FAILED');
  assert.deepEqual(events, ['WINDOW_SHOW_TIMEOUT']);
});

test('a shown window cancels startup timeout and a later renderer crash remains fatal', () => {
  const { guard, events, fire } = guardHarness();
  guard.ready();
  guard.ready();
  fire();
  guard.fail('RENDER_PROCESS_GONE');
  guard.fail('DOCUMENT_LOAD_FAILED');
  assert.deepEqual(events, ['visible', 'RENDER_PROCESS_GONE']);
});

test('intentional shutdown suppresses spurious renderer or load failure reports', () => {
  const { guard, events, fire } = guardHarness();
  guard.stop();
  fire();
  guard.ready();
  guard.fail('RENDER_PROCESS_GONE');
  assert.deepEqual(events, []);
});

test('CLI profile accepts fully qualified Windows paths and rejects relative or device paths', () => {
  const normal = 'C:/Users/PUBLIC-USER\\AppData\\Roaming\\PondClock';
  assert.equal(resolveUserDataDirectory('', normal, path.win32), normal);
  assert.equal(resolveUserDataDirectory('X:\\isolated profiles\\one', normal, path.win32), 'X:\\isolated profiles\\one');
  assert.equal(resolveUserDataDirectory('\\\\server\\profiles\\one', normal, path.win32), '\\\\server\\profiles\\one');
  for (const input of ['relative', 'C:relative', '\\root-only', '\\\\?\\C:\\device', '\\\\.\\pipe\\name', 'C:\\bad\0path']) {
    assert.throws(() => resolveUserDataDirectory(input, normal, path.win32), { code: 'INVALID_USER_DATA_DIR' });
  }
});

test('startup diagnostics omit messages, stacks, URLs, IPs and arbitrary error properties', () => {
  const error = Object.assign(new Error('private fish data 192.0.2.45 https://example.test/secret'), {
    code: 'SAVE_WRITE_FAILED', snapshot: { coins: 98765 }, url: 'https://example.test/private',
  });
  const record = startupLogRecord('STARTUP_FAILED', error, new Date('2026-10-21T00:00:00Z'));
  assert.deepEqual(JSON.parse(record), { at: '2026-10-21T00:00:00.000Z', event: 'STARTUP_FAILED', name: 'Error', code: 'SAVE_WRITE_FAILED' });
  assert.equal(/192\.0\.2|https:|98765|stack|message/.test(record), false);
  assert.deepEqual(JSON.parse(startupLogRecord('ip 192.0.2.45', { name: 'private value', code: 'bad url https:' }, new Date('2026-10-21T00:00:00Z'))),
    { at: '2026-10-21T00:00:00.000Z', event: 'UNKNOWN_EVENT' });
});
