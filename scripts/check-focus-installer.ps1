param(
  [ValidatePattern('^2\.0\.0$')][string]$Version = '2.0.0',
  [switch]$Execute,
  [string]$ResumeReport,
  [ValidateSet('installed', 'reinstalled', 'uninstalled')][string]$ObserveStage
)
$ErrorActionPreference = 'Stop'
if ($ObserveStage -and ($Execute -or -not $ResumeReport)) { throw 'Observation requires -ResumeReport and must never include -Execute.' }
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$evidenceParent = [IO.Path]::GetFullPath((Join-Path $projectRoot 'test-results'))
$resultRoot = if ($ResumeReport) { [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($ResumeReport)) }
  else { [IO.Path]::GetFullPath((Join-Path $evidenceParent ('focus-installer-' + [guid]::NewGuid().ToString('N')))) }
$reportFilename = if ($ObserveStage) { 'installer-check.observe-' + $ObserveStage + '-' + [guid]::NewGuid().ToString('N') + '.json' }
  elseif ($ResumeReport) { 'installer-check.resume-' + [guid]::NewGuid().ToString('N') + '.json' } else { 'installer-check.json' }
$installDirectory = [IO.Path]::GetFullPath((Join-Path $resultRoot '安装 PondClock Focus'))
$installer = Join-Path $projectRoot ('release\PondClock-Setup-' + $Version + '-x64.exe')
$unpacked = [IO.Path]::GetFullPath((Join-Path $projectRoot 'release\win-unpacked'))
$productName = 'PondClock Focus'
$shortcutName = '水塘时钟·专注版.lnk'
# electron-builder productFilename follows executableName, not DisplayName.
$uninstallerName = 'Uninstall PondClock.exe'
$focusGuid = '2f2611ae-3f88-5de7-b8bc-6f8556d12449'
$report = [ordered]@{
  startedAt = (Get-Date).ToUniversalTime().ToString('o')
  passed = $false; preflightPassed = $false; executionRequested = [bool]$Execute
  observationStage = $ObserveStage; entireInstallChainVerified = $false
  resultScope = $(if ($ObserveStage) { 'Only the named read-only observation stage; not the complete install chain.' } else { 'Install chain only if executionRequested and passed are both true.' })
  resumeRequested = [bool]$ResumeReport; version = $Version; productName = $productName; appId = 'cn.pondclock.focus'; focusGuid = $focusGuid
  target = $installDirectory; uninstallerName = $uninstallerName; checks = @(); launchedProcesses = @()
  profileBoundary = 'Script never launches PondClock.exe, opens a save, or changes any APPDATA directory. Native UI checks must use an explicit isolated --user-data-dir separately.'
  oldEditionBoundary = 'Only Focus identity is checked. No old PondClock registry, shortcut, installation or save is changed. No registry/shortcut deletion or recursive cleanup is performed by this script.'
  evidenceRetained = $true; manualDeletionUsed = $false
  executionIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
}

function Assert-OwnedTarget {
  $resolvedRoot = [IO.Path]::GetFullPath($resultRoot)
  $resolvedTarget = [IO.Path]::GetFullPath($installDirectory)
  if ([IO.Path]::GetDirectoryName($resolvedRoot) -ne $evidenceParent -or
      [IO.Path]::GetFileName($resolvedRoot) -notmatch '^focus-installer-[0-9a-f]{32}$' -or
      [IO.Path]::GetDirectoryName($resolvedTarget) -ne $resolvedRoot -or
      [IO.Path]::GetFileName($resolvedTarget) -ne '安装 PondClock Focus') { throw 'Test path is outside its unique evidence directory.' }
  foreach ($entry in @($evidenceParent, $resolvedRoot, $resolvedTarget)) {
    if (Test-Path -LiteralPath $entry) {
      if (((Get-Item -LiteralPath $entry -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'A test path is a reparse point; refusing installation or uninstallation.' }
    }
  }
  if (Test-Path -LiteralPath $resolvedTarget) {
    $links = @(Get-ChildItem -LiteralPath $resolvedTarget -Recurse -Force | Where-Object {
      ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
    })
    if ($links.Count) { throw 'Owned install tree contains a reparse point; refusing file verification or uninstallation.' }
  }
}

function Write-Report {
  $script:report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $resultRoot $reportFilename) -Encoding utf8
}

function Get-OptionalReadableRegistryKey([string]$Path) {
  try { return Get-Item -LiteralPath $Path -ErrorAction Stop }
  catch [System.Management.Automation.ItemNotFoundException] { return $null }
  catch { throw ('Cannot safely read registry path; absence is unproven: ' + $Path + '; ' + $_.Exception.Message) }
}

function Find-FocusRegistration {
  foreach ($hive in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
      'HKCU:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
    if (-not (Get-OptionalReadableRegistryKey $hive)) { continue }
    foreach ($key in Get-ChildItem -LiteralPath $hive) {
      $item = Get-ItemProperty -LiteralPath $key.PSPath
      if ($key.PSChildName -eq $focusGuid -or $item.DisplayName -eq $productName -or $item.DisplayName -like ($productName + ' (*')) {
        [pscustomobject]@{ path = $key.PSPath; key = $key.PSChildName; displayName = $item.DisplayName
          version = $item.DisplayVersion; uninstall = $item.UninstallString; quietUninstall = $item.QuietUninstallString }
      }
    }
  }
}

function Find-FocusInstallKey {
  foreach ($hive in @('HKCU:\Software', 'HKLM:\Software', 'HKCU:\Software\WOW6432Node', 'HKLM:\Software\WOW6432Node')) {
    $name = Join-Path $hive $focusGuid
    if (Get-OptionalReadableRegistryKey $name) {
      $item = Get-ItemProperty -LiteralPath $name
      [pscustomobject]@{ path = $name; location = $item.InstallLocation; shortcutName = $item.ShortcutName }
    }
  }
}

function Find-FocusShortcut {
  foreach ($folder in @('Desktop', 'Programs', 'CommonDesktopDirectory', 'CommonPrograms')) {
    $directory = [Environment]::GetFolderPath($folder)
    if ($directory -and (Test-Path -LiteralPath $directory)) {
      Get-ChildItem -LiteralPath $directory -Filter $shortcutName -File -Recurse -Force | Select-Object -ExpandProperty FullName
    }
  }
}

function Assert-SilentNoLaunch {
  $config = Get-Content -LiteralPath (Join-Path $projectRoot 'electron-builder.yml') -Raw
  foreach ($line in @('appId: cn.pondclock.focus', 'productName: PondClock Focus', 'executableName: PondClock',
      '  oneClick: false', '  perMachine: false', '  deleteAppDataOnUninstall: false', '  shortcutName: 水塘时钟·专注版')) {
    if (-not ($config -split '\r?\n' -contains $line)) { throw ('Unreviewed builder identity or install mode: ' + $line) }
  }
  if ($config -match '(?m)^\s*(script|guid):') { throw 'Custom NSIS script/GUID is not supported by this checker.' }
  $template = Join-Path $projectRoot 'node_modules\app-builder-lib\templates\nsis\installSection.nsh'
  $source = Get-Content -LiteralPath $template -Raw
  if ($source -notmatch '\$\{if\} \$\{isForceRun\}\s+\$\{andIf\} \$\{Silent\}\s+!insertmacro doStartApp') {
    throw 'Cannot prove assisted silent installation avoids auto launch; no installer will be executed.'
  }
  $custom = Get-Content -LiteralPath (Join-Path $projectRoot 'desktop\installer.nsh') -Raw
  if ($custom -match '(?im)^\s*!macro\s+(customInstall|customFinishPage|customInit|customUnInit|customUnInstall|customUnInstallSection|customRemoveFiles)\b|^\s*(Exec|ExecWait|ExecShell)\b') {
    throw 'Custom installer launch hooks require a new review; no installer will be executed.'
  }
  $script:report.silentLaunchProof = [ordered]@{ assistedInstaller = $true; forceRunFlagPassed = $false
    arguments = '/S /currentuser /D=<unique-owned-directory>'; template = 'app-builder-lib/templates/nsis/installSection.nsh'
    templateSha256 = (Get-FileHash -LiteralPath $template -Algorithm SHA256).Hash
    customIncludeSha256 = (Get-FileHash -LiteralPath (Join-Path $projectRoot 'desktop\installer.nsh') -Algorithm SHA256).Hash }
}

function Assert-NoTargetProcess {
  $expectedExe = Join-Path $installDirectory 'PondClock.exe'
  $matches = @(Get-Process -Name PondClock -ErrorAction SilentlyContinue | Where-Object {
    try { $_.Path -and [IO.Path]::GetFullPath($_.Path) -eq $expectedExe } catch { $false }
  } | Select-Object Id, Path)
  if ($matches.Count) { $script:report.unexpectedTargetProcesses = $matches; throw 'Installed test app started unexpectedly. It will not be force-closed or uninstalled automatically.' }
}

function Run-OwnedInstaller([string]$File, [string]$Arguments, [string]$Label) {
  Assert-OwnedTarget
  if ([IO.Path]::GetFullPath($File) -ne [IO.Path]::GetFullPath($installer) -and
      [IO.Path]::GetFullPath($File) -ne (Join-Path $installDirectory $uninstallerName)) { throw 'Only this build installer or the exact owned test uninstaller may run.' }
  if ($Arguments -match 'force-run|allusers|delete-app-data') { throw 'Unsafe or cross-user installer option rejected.' }
  $script:report.phase = $Label
  Write-Report
  $process = Start-Process -FilePath $File -ArgumentList $Arguments -PassThru -WindowStyle Hidden
  $script:report.launchedProcesses += [ordered]@{ label = $Label; pid = $process.Id; file = $File; arguments = $Arguments }
  Write-Report
  if (-not $process.WaitForExit(30000)) {
    $script:report.waitingPid = $process.Id
    throw 'Installer exceeded30 seconds. Evidence and its PID are retained; no unrelated process is stopped.'
  }
  $process.Refresh()
  if ($process.ExitCode -ne 0) { throw ($Label + ': installer exit code ' + $process.ExitCode) }
}

function Check-Installed([string]$Label) {
  Assert-OwnedTarget
  $exe = Join-Path $installDirectory 'PondClock.exe'
  $uninstaller = Join-Path $installDirectory $uninstallerName
  if (-not (Test-Path -LiteralPath $exe -PathType Leaf) -or -not (Test-Path -LiteralPath $uninstaller -PathType Leaf)) { throw ($Label + ': installed executable or uninstaller missing') }
  Assert-NoTargetProcess
  $registrations = @(Find-FocusRegistration)
  $installKeys = @(Find-FocusInstallKey)
  if ($registrations.Count -ne 1 -or $registrations[0].key -ne $focusGuid -or $registrations[0].displayName -ne $productName -or $registrations[0].version -ne $Version) { throw ($Label + ': exact Focus registration identity/version differs') }
  if ($registrations[0].uninstall -ne ('"' + $uninstaller + '" /currentuser')) { throw ($Label + ': uninstall registration points outside this test') }
  if ($installKeys.Count -ne 1 -or [IO.Path]::GetFullPath($installKeys[0].location) -ne $installDirectory) { throw ($Label + ': install-location registration points outside this test') }
  $actualLinks = @(Find-FocusShortcut | Sort-Object -Unique)
  foreach ($expectedLink in $script:expectedShortcuts) {
    if (-not ($actualLinks -contains $expectedLink)) { throw ($Label + ': missing expected Focus shortcut: ' + $expectedLink) }
  }
  $shell = New-Object -ComObject WScript.Shell
  try {
    foreach ($link in $actualLinks) {
      $shortcut = $shell.CreateShortcut($link)
      if ([IO.Path]::GetFullPath($shortcut.TargetPath) -ne $exe -or $shortcut.Arguments) { throw ($Label + ': shortcut target/arguments differ: ' + $link) }
    }
  } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }
  foreach ($payload in $script:expectedPayload) {
    $target = [IO.Path]::GetFullPath((Join-Path $installDirectory $payload.relativePath))
    if (-not $target.StartsWith($installDirectory + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Payload escaped owned directory.' }
    if (-not (Test-Path -LiteralPath $target -PathType Leaf) -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $payload.sha256) { throw ($Label + ': payload SHA256 differs: ' + $payload.relativePath) }
  }
  $script:report.checks += [ordered]@{ name = $Label; passed = $true; payloadFilesMatched = $script:expectedPayload.Count
    productVersion = (Get-Item -LiteralPath $exe).VersionInfo.ProductVersion; shortcutTargetsVerified = $actualLinks
    registrations = $registrations; installKeys = $installKeys; appNotLaunched = $true }
  Write-Report
}

function Check-Uninstalled {
  Assert-OwnedTarget
  Assert-NoTargetProcess
  # Check ownership again immediately before the uninstaller's own removal step.
  Check-Installed 'ownership before uninstallation'
  Run-OwnedInstaller (Join-Path $installDirectory $uninstallerName) '/S /currentuser' 'ordinary uninstallation'
  $deadline = (Get-Date).AddSeconds(30)
  do {
    Assert-OwnedTarget
    $leftovers = @(if (Test-Path -LiteralPath $installDirectory) { Get-ChildItem -LiteralPath $installDirectory -Recurse -File -Force })
    if (-not $leftovers.Count) { break }
    Start-Sleep -Milliseconds 200
  } while ((Get-Date) -lt $deadline)
  if ($leftovers.Count) { throw 'Uninstaller returned but files remain. No manual cleanup will mask this failure.' }
  if (@(Find-FocusRegistration).Count -or @(Find-FocusInstallKey).Count -or @(Find-FocusShortcut).Count) { throw 'Focus registration or shortcuts remain after uninstallation.' }
  $script:report.checks += [ordered]@{ name = 'ordinary uninstallation'; passed = $true; payloadFilesRemoved = $true
    registrationsRemoved = $true; shortcutsRemoved = $true; emptyInstallDirectoryMayRemain = $true }
}

function Observe-Uninstalled {
  Assert-OwnedTarget
  Assert-NoTargetProcess
  $leftovers = @(if (Test-Path -LiteralPath $installDirectory) { Get-ChildItem -LiteralPath $installDirectory -Recurse -File -Force })
  if ($leftovers.Count) { throw 'Read-only uninstalled observation: files remain in the original test target.' }
  if (@(Find-FocusRegistration).Count -or @(Find-FocusInstallKey).Count -or @(Find-FocusShortcut).Count) {
    throw 'Read-only uninstalled observation: Focus registration or shortcuts remain.'
  }
  $script:report.checks += [ordered]@{ name = 'observed uninstalled'; passed = $true; payloadFilesRemoved = $true
    registrationsRemoved = $true; shortcutsRemoved = $true; emptyInstallDirectoryMayRemain = $true; readOnly = $true }
}

New-Item -ItemType Directory -Path $evidenceParent -Force | Out-Null
Assert-OwnedTarget
if ($ResumeReport) {
  if (-not (Test-Path -LiteralPath $resultRoot -PathType Container) -or [IO.Path]::GetFileName($ResumeReport) -ne 'installer-check.json') { throw 'Resume requires the original installer-check.json in its existing unique evidence directory.' }
} else {
  if (Test-Path -LiteralPath $resultRoot) { throw 'Unique result directory already exists.' }
  New-Item -ItemType Directory -Path $resultRoot | Out-Null
}
$expectedShortcuts = @((Join-Path ([Environment]::GetFolderPath('Desktop')) $shortcutName),
  (Join-Path ([Environment]::GetFolderPath('Programs')) $shortcutName))
try {
  $report.phase = 'read-only preflight'
  $report.registrationBefore = @(Find-FocusRegistration)
  $report.installKeysBefore = @(Find-FocusInstallKey)
  $report.shortcutsBefore = @(Find-FocusShortcut | Sort-Object -Unique)
  if (-not $ResumeReport -and ($report.registrationBefore.Count -or $report.installKeysBefore.Count -or $report.shortcutsBefore.Count)) { throw 'Existing Focus installation identity or shortcut found. Refusing to replace it; old PondClock identity does not block this check.' }
  Assert-SilentNoLaunch
  foreach ($required in @($installer, (Join-Path $unpacked 'PondClock.exe'), (Join-Path $unpacked 'resources\app.asar'))) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw ('Required release file missing: ' + $required) }
  }
  $info = (Get-Item -LiteralPath (Join-Path $unpacked 'PondClock.exe')).VersionInfo
  if ($info.ProductName -ne $productName -or $info.ProductVersion -notmatch ('^' + [regex]::Escape($Version) + '(\.0)?$')) { throw 'Unpacked build product identity/version differs.' }
  $report.installerSha256 = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash
  $expectedPayload = @(Get-ChildItem -LiteralPath $unpacked -File -Recurse | ForEach-Object {
    [pscustomobject]@{ relativePath = $_.FullName.Substring($unpacked.Length + 1); sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
  })
  $report.expectedPayload = $expectedPayload
  $resumePayloadOnly = $false
  if ($ResumeReport) {
    $originalReport = Get-Content -LiteralPath $ResumeReport -Raw | ConvertFrom-Json
    if ($originalReport.target -ne $installDirectory -or $originalReport.appId -ne 'cn.pondclock.focus' -or
        $originalReport.focusGuid -ne $focusGuid -or $originalReport.version -ne $Version -or
        -not $originalReport.executionRequested -or -not $originalReport.preflightPassed -or
        $originalReport.installerSha256 -ne $report.installerSha256) { throw 'Resume report ownership or exact release hash differs; refusing execution.' }
    $originalLaunch = @($originalReport.launchedProcesses | Where-Object {
      $_.label -eq 'fresh Focus installation' -and $_.file -eq $installer -and
      $_.arguments -eq ('/S /currentuser /D=' + $installDirectory)
    })
    if ($originalLaunch.Count -ne 1) { throw 'Original report does not prove this exact owned installation was started once.' }
    $oldFiles = @($originalReport.expectedPayload | Sort-Object relativePath)
    $newFiles = @($expectedPayload | Sort-Object relativePath)
    if ($oldFiles.Count -ne $newFiles.Count) { throw 'Resume payload count differs from original release.' }
    for ($index = 0; $index -lt $newFiles.Count; $index++) {
      if ($oldFiles[$index].relativePath -ne $newFiles[$index].relativePath -or $oldFiles[$index].sha256 -ne $newFiles[$index].sha256) { throw 'Resume payload manifest differs from original release.' }
      if ($ObserveStage -ne 'uninstalled') {
        $installedFile = [IO.Path]::GetFullPath((Join-Path $installDirectory $newFiles[$index].relativePath))
        if (-not $installedFile.StartsWith($installDirectory + '\', [StringComparison]::OrdinalIgnoreCase) -or
            -not (Test-Path -LiteralPath $installedFile -PathType Leaf) -or
            (Get-FileHash -LiteralPath $installedFile -Algorithm SHA256).Hash -ne $newFiles[$index].sha256) { throw ('Resume installed payload differs: ' + $newFiles[$index].relativePath) }
      }
    }
    Assert-NoTargetProcess
    $report.resumedFrom = [IO.Path]::GetFullPath($ResumeReport)
    $report.originalReportSha256 = (Get-FileHash -LiteralPath $ResumeReport -Algorithm SHA256).Hash
    if ($ObserveStage -eq 'uninstalled') { Observe-Uninstalled }
    else {
      if (-not (Test-Path -LiteralPath (Join-Path $installDirectory $uninstallerName) -PathType Leaf)) { throw 'Resume lacks the original test uninstaller.' }
      if ($ObserveStage) { Check-Installed ('observed ' + $ObserveStage) }
      else {
        $resumePayloadOnly = -not ($report.registrationBefore.Count -or $report.installKeysBefore.Count -or $report.shortcutsBefore.Count)
        if ($resumePayloadOnly) { $report.resumeState = 'All original payload bytes match, but no Focus registration/shortcut exists; retry installation required.' }
        else { Check-Installed 'resumed original Focus installation'; $report.resumeState = 'Exact original installation ownership confirmed.' }
      }
    }
  }
  $report.preflightPassed = $true
  if ($ObserveStage) {
    $report.passed = $true
    $report.phase = 'read-only observation completed: ' + $ObserveStage
  } elseif ($Execute) {
    if (-not $ResumeReport) {
      if (Test-Path -LiteralPath $installDirectory) { throw 'Install leaf must not exist before the first test.' }
      Run-OwnedInstaller $installer ('/S /currentuser /D=' + $installDirectory) 'fresh Focus installation'
      Check-Installed 'fresh Focus installation'
    } elseif ($resumePayloadOnly) {
      Run-OwnedInstaller $installer ('/S /currentuser /D=' + $installDirectory) 'retry original payload-only Focus installation'
      Check-Installed 'original payload-only installation repaired by installer'
    }
    Run-OwnedInstaller $installer ('/S /currentuser /D=' + $installDirectory) 'same-version Focus reinstallation'
    Check-Installed 'same-version Focus reinstallation'
    Check-Uninstalled
    $report.passed = $true
    $report.entireInstallChainVerified = $true
    $report.phase = 'completed'
  } else { $report.phase = 'preflight only; installation not executed' }
} catch {
  $report.error = $_.Exception.Message
  try { $report.registrationAfter = @(Find-FocusRegistration) }
  catch { $report.registrationInspectionError = $_.Exception.Message }
  try { $report.installKeysAfter = @(Find-FocusInstallKey) }
  catch { $report.installKeyInspectionError = $_.Exception.Message }
  try { $report.shortcutsAfter = @(Find-FocusShortcut | Sort-Object -Unique) }
  catch { $report.shortcutInspectionError = $_.Exception.Message }
} finally {
  $report.finishedAt = (Get-Date).ToUniversalTime().ToString('o')
  Write-Report
  Write-Output ($report | ConvertTo-Json -Depth 10 -Compress)
  Write-Output ('Report: ' + (Join-Path $resultRoot $reportFilename))
}
if ($report.error -or ($Execute -and -not $report.passed)) { exit 1 }
