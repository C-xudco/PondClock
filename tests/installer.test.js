import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));

async function findCompiler(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = await findCompiler(candidate);
      if (found) return found;
    } else if (entry.name.toLowerCase() === 'makensis.exe') return candidate;
  }
  return null;
}

// These executables never install/uninstall anything, touch the registry, or read
// user saves. They exercise the actual NSIS/Win32 check against disposable PIDs.
test('native installer check isolates the exact app path and refuses a running target', {
  skip: process.platform !== 'win32' || process.env.PONDCLOCK_NATIVE_INSTALLER_TEST !== '1',
  timeout: 60000,
}, async (t) => {
  const compiler = await findCompiler(path.join(root, '.cache', 'electron-builder'));
  assert.ok(compiler, 'run the Windows packaging tool once to populate the local NSIS cache');
  const temporaryRoot = path.join(root, 'tests', '.tmp');
  await fs.mkdir(temporaryRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(temporaryRoot, 'pondclock-installer-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), temporaryRoot);
    assert.ok(path.basename(directory).startsWith('pondclock-installer-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const targetName = "目标 PondClock's";
  const target = path.join(directory, targetName);
  await fs.mkdir(target);
  const include = path.join(root, 'desktop', 'installer.nsh');

  async function compile(name, source) {
    const script = path.join(directory, `${name}.nsi`);
    await fs.writeFile(script, `\uFEFF${source}`, 'utf8');
    await execute(compiler, ['/WX', '/V2', script], { windowsHide: true, timeout: 20000 });
    return path.join(directory, `${name}.exe`);
  }
  const holder = await compile('holder', `Unicode true
Name "PondClock test process"
OutFile "${path.join(directory, 'holder.exe')}"
RequestExecutionLevel user
SilentInstall silent
Section
  Sleep 300000
SectionEnd
`);
  const probeHeader = (name) => `Unicode true
Name "PondClock process check test"
OutFile "${path.join(directory, `${name}.exe`)}"
RequestExecutionLevel user
SilentInstall silent
!define APP_EXECUTABLE_FILENAME "PondClock.exe"
!define UNINSTALL_FILENAME "Uninstall PondClock.exe"
!include "${include}"
!insertmacro customHeader
Section
  StrCpy $INSTDIR "${target}"
`;
  const probe = await compile('probe', `${probeHeader('probe')}
  Call PCFindTargetProcess
  SetErrorLevel $PCCheckResult
SectionEnd
`);
  const hook = await compile('hook', `${probeHeader('hook')}
  !insertmacro customCheckAppRunning
  SetErrorLevel 0
SectionEnd
`);
  // Compile the BUILD_UNINSTALLER branch as well, without running an uninstaller.
  await compile('uninstall-compile-only', `Unicode true
Name "PondClock uninstaller compile test"
OutFile "${path.join(directory, 'uninstall-compile-only.exe')}"
RequestExecutionLevel user
!define APP_EXECUTABLE_FILENAME "PondClock.exe"
!define BUILD_UNINSTALLER
!include "${include}"
!insertmacro customHeader
Section
  WriteUninstaller "$EXEDIR\\unused-test-uninstaller.exe"
SectionEnd
Section "Uninstall"
  !insertmacro customCheckAppRunning
SectionEnd
`);

  // Inject a failed native snapshot to verify the safe-error branch at runtime.
  const deniedInclude = path.join(directory, 'denied-process-query.nsh');
  await fs.writeFile(deniedInclude, `\uFEFF${(await fs.readFile(include, 'utf8'))
    .replace("System::Call 'kernel32::CreateToolhelp32Snapshot(i 2, i 0) p.r0'", 'StrCpy $0 -1')}`, 'utf8');
  const denied = await compile('denied', `${probeHeader('denied').replace(include, deniedInclude)}
  Call PCFindTargetProcess
  SetErrorLevel $PCCheckResult
SectionEnd
`);

  async function exitCode(executable) {
    try {
      await execute(executable, [], { windowsHide: true, timeout: 10000 });
      return 0;
    } catch (error) {
      if (typeof error.code === 'number') return error.code;
      throw error;
    }
  }
  assert.equal(await exitCode(probe), 0, 'no target process is clear');
  assert.equal(await exitCode(hook), 0, 'actual custom hook accepts a clear directory');
  assert.equal(await exitCode(denied), 2, 'process enumeration failure never means safe to overwrite');

  for (const [relative, expected] of [
    [`${targetName}-copy/PondClock.exe`, 0],
    ['other/PondClock.exe', 0],
    [`${targetName}/PondClock-Setup-1.0.1-x64.exe`, 0],
    [`${targetName}/Uninstall PondClock.exe`, 0],
    [`${targetName}/PondClock.exe`, 1],
  ]) {
    const fixture = path.join(directory, relative);
    await fs.mkdir(path.dirname(fixture), { recursive: true });
    await fs.copyFile(holder, fixture);
    const child = spawn(fixture, [], { windowsHide: true, stdio: 'ignore' });
    const closed = new Promise((resolve, reject) => {
      child.once('close', resolve);
      child.once('error', reject);
    });
    try {
      await new Promise((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
      assert.equal(await exitCode(probe), expected, relative);
      if (expected === 1) {
        assert.equal(await exitCode(hook), 2, 'silent installer cancels instead of overwriting a running app');
      } else if (relative.endsWith('/Uninstall PondClock.exe')) {
        assert.equal(await exitCode(hook), 2, 'locked old uninstaller cannot be overwritten even though it is not the game');
      } else {
        assert.equal(await exitCode(hook), 0, 'unrelated process does not block the installer hook');
      }
      assert.equal(child.exitCode, null, 'check never terminates even its matching process');
    } finally {
      child.kill(); // Only the disposable fixture PID created immediately above.
      await closed;
    }
  }
  assert.equal(await exitCode(probe), 0, 'target exit unblocks installation');
  assert.equal(await exitCode(hook), 0, 'closed old uninstaller and game unblock the full hook');
});
