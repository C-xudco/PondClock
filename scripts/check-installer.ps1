param(
  [string]$Version = '1.0.1',
  [switch]$UpgradeFrom100
)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$resultRoot = Join-Path $projectRoot ('test-results\installer-' + $Version + '-' + [guid]::NewGuid().ToString('N'))
$installDirectory = Join-Path $resultRoot '安装 PondClock'
$installer = Join-Path $projectRoot ('release\PondClock-Setup-' + $Version + '-x64.exe')
$report = [ordered]@{ startedAt = (Get-Date).ToUniversalTime().ToString('o'); passed = $false; target = $installDirectory; checks = @() }

function Find-PondClockRegistration {
  foreach ($hive in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKCU:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
    Get-ChildItem -LiteralPath $hive -ErrorAction SilentlyContinue | Get-ItemProperty -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -match 'PondClock|水塘时钟' } |
      Select-Object PSPath, DisplayName, DisplayVersion, UninstallString
  }
}

function Run-OwnedInstaller([string]$File, [string]$Arguments) {
  $script:report.phase = 'waiting for Windows launch: ' + [IO.Path]::GetFileName($File)
  $script:report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $resultRoot 'installer-check.json') -Encoding utf8
  Write-Output ('Starting: ' + [IO.Path]::GetFileName($File))
  $process = Start-Process -FilePath $File -ArgumentList $Arguments -PassThru -WindowStyle Hidden
  if (-not $process.WaitForExit(30000)) {
    # This PID was created by this function, never an arbitrary matching image.
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw ('Installer timed out: ' + [IO.Path]::GetFileName($File))
  }
  $process.Refresh()
  if ($process.ExitCode -ne 0) { throw ('Installer exit code: ' + $process.ExitCode) }
  return $process.ExitCode
}

function Check-Installed([string]$Label) {
  $exe = Join-Path $installDirectory 'PondClock.exe'
  $uninstaller = Join-Path $installDirectory 'Uninstall PondClock.exe'
  if (-not (Test-Path -LiteralPath $exe) -or -not (Test-Path -LiteralPath $uninstaller)) { throw ($Label + ': missing executable') }
  $registrations = @(Find-PondClockRegistration)
  if ($registrations.Count -ne 1 -or $registrations[0].DisplayVersion -ne $Version) { throw ($Label + ': registration version differs') }
  if (-not $registrations[0].UninstallString.Contains($installDirectory)) { throw ($Label + ': registration points outside this test') }
  foreach ($shortcut in $script:shortcuts) {
    if (-not (Test-Path -LiteralPath $shortcut)) { throw ($Label + ': missing shortcut ' + $shortcut) }
  }
  $script:report.checks += [ordered]@{ name = $Label; passed = $true; version = (Get-Item -LiteralPath $exe).VersionInfo.ProductVersion;
    archiveSha256 = (Get-FileHash -LiteralPath (Join-Path $installDirectory 'resources\app.asar') -Algorithm SHA256).Hash;
    shortcutsExist = $true }
}

function Check-Uninstalled([string]$Label) {
  $uninstaller = Join-Path $installDirectory 'Uninstall PondClock.exe'
  $null = Run-OwnedInstaller $uninstaller '/S /currentuser'
  $deadline = (Get-Date).AddSeconds(30)
  do {
    $remains = (Test-Path -LiteralPath (Join-Path $installDirectory 'PondClock.exe')) -or
      (Test-Path -LiteralPath (Join-Path $installDirectory 'resources\app.asar')) -or
      (Test-Path -LiteralPath $uninstaller)
    if (-not $remains) { break }
    Start-Sleep -Milliseconds 200
  } while ((Get-Date) -lt $deadline)
  if ($remains) { throw ($Label + ': application files remain; exit code 0 is insufficient') }
  if (@(Find-PondClockRegistration).Count) { throw ($Label + ': registration remains') }
  foreach ($shortcut in $script:shortcuts) {
    if (Test-Path -LiteralPath $shortcut) { throw ($Label + ': shortcut remains') }
  }
  $script:report.checks += [ordered]@{ name = $Label; passed = $true; applicationFilesRemoved = $true; shortcutsRemoved = $true; registrationRemoved = $true }
}

New-Item -ItemType Directory -Path $resultRoot | Out-Null
$shortcuts = @((Join-Path ([Environment]::GetFolderPath('Desktop')) '水塘时钟.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) '水塘时钟.lnk'))
try {
  $report.registrationBefore = @(Find-PondClockRegistration)
  if ($report.registrationBefore.Count) { throw 'An existing PondClock installation is registered; refusing an isolated test that could replace it.' }
  foreach ($shortcut in $shortcuts) {
    if (Test-Path -LiteralPath $shortcut) { throw ('An existing player shortcut is present; refusing to replace it: ' + $shortcut) }
  }
  if ($UpgradeFrom100) {
    $legacy = Join-Path $projectRoot 'release\PondClock-Setup-1.0.0-x64.exe'
    if ((Get-FileHash -LiteralPath $legacy -Algorithm SHA256).Hash -ne '994EA8F1AEB1854ACCA9C913F8E1F6FE763E449667D6624F23F1329C4036EA77') { throw 'Legacy installer hash differs' }
    $null = Run-OwnedInstaller $legacy ('/S /currentuser /D=' + $installDirectory)
    if (-not (Test-Path -LiteralPath (Join-Path $installDirectory 'PondClock.exe'))) { throw 'Legacy setup did not install the actual executable' }
    $report.checks += [ordered]@{ name = 'original 1.0.0 installed as upgrade input'; passed = $true }
  }
  $null = Run-OwnedInstaller $installer ('/S /currentuser /D=' + $installDirectory)
  Check-Installed $(if ($UpgradeFrom100) { 'upgrade 1.0.0 to 1.0.1' } else { 'fresh installation' })
  $null = Run-OwnedInstaller $installer ('/S /currentuser /D=' + $installDirectory)
  Check-Installed 'same-version reinstallation'
  Check-Uninstalled 'ordinary silent uninstallation'
  $null = Run-OwnedInstaller $installer ('/S /currentuser /D=' + $installDirectory)
  Check-Installed 'reinstallation after uninstallation'
  Check-Uninstalled 'final ordinary uninstallation'
  $report.passed = $true
} catch {
  $report.error = $_.Exception.Message
  $report.manualDeletionUsed = $false
  $report.registrationAfter = @(Find-PondClockRegistration)
} finally {
  $report.finishedAt = (Get-Date).ToUniversalTime().ToString('o')
  $reportPath = Join-Path $resultRoot 'installer-check.json'
  $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding utf8
  Write-Output ($report | ConvertTo-Json -Depth 8 -Compress)
  Write-Output ('Report: ' + $reportPath)
}
if (-not $report.passed) { exit 1 }
