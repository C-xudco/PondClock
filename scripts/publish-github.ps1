param(
  [Parameter(Mandatory)][ValidateSet('CreateRepo','CreateRelease','UploadAsset','Verify')][string]$Action,
  [string]$BodyFile,
  [long]$ReleaseId,
  [string]$AssetPath
)
$ErrorActionPreference = 'Stop'
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'never'
# Standard Git credential helper authentication for this explicit GitHub task.
# Credentials remain in memory: never write or print the helper response/headers.
$credentialLines = @('protocol=https','host=github.com','username=C-xudco','') | git credential fill
if ($LASTEXITCODE -ne 0) { throw 'GitHub authentication unavailable; no credential data is printed.' }
$credentialFields = @{}
foreach ($line in $credentialLines) {
  $separator = $line.IndexOf('=')
  if ($separator -gt 0) { $credentialFields[$line.Substring(0,$separator)] = $line.Substring($separator+1) }
}
if (-not $credentialFields['password']) { throw 'GitHub helper returned no authentication.' }
$headers = @{ Authorization = 'Bearer ' + $credentialFields['password']; Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28'; 'User-Agent' = 'PondClock-Publish' }
$credentialLines = $null
$credentialFields = $null
function Request-GitHub([string]$Method,[string]$Uri,$Body = $null) {
  if (-not $Uri.StartsWith('https://api.github.com/')) { throw 'Unexpected API destination' }
  try {
    if ($null -eq $Body) { return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -TimeoutSec 60 }
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 8))) -TimeoutSec 60
  } catch {
    $status = [int]$_.Exception.Response.StatusCode
    throw "GitHub request failed (HTTP $status); credential material suppressed."
  }
}
$identity = Request-GitHub 'GET' 'https://api.github.com/user'
if ($identity.login -cne 'C-xudco') { throw 'Authenticated GitHub account does not match approved owner.' }
$base = 'https://api.github.com/repos/C-xudco/PondClock'
switch ($Action) {
  'CreateRepo' {
    try { $existing = Request-GitHub 'GET' $base } catch { if ($_.Exception.Message -notmatch 'HTTP 404') { throw } }
    if ($existing) { throw 'PondClock already exists; inspect it before any write.' }
    $repo = Request-GitHub 'POST' 'https://api.github.com/user/repos' @{ name='PondClock'; private=$false; auto_init=$false; description='水塘时钟：离线桌面钓鱼与番茄钟。允许非商业二创，商业使用需另行授权。'; has_issues=$true; has_wiki=$false }
    [ordered]@{ url=$repo.html_url; owner=$repo.owner.login; visibility=$repo.visibility; defaultBranch=$repo.default_branch } | ConvertTo-Json
  }
  'CreateRelease' {
    if (-not (Test-Path -LiteralPath $BodyFile -PathType Leaf)) { throw 'Missing reviewed release notes.' }
    $release = Request-GitHub 'POST' ($base + '/releases') @{ tag_name='v2.0.1'; target_commitish='main'; name='水塘时钟 V2.0.1 · 免安装与开发全过程'; body=[IO.File]::ReadAllText((Resolve-Path -LiteralPath $BodyFile)); draft=$false; prerelease=$false; make_latest='true' }
    [ordered]@{ id=$release.id; url=$release.html_url; tag=$release.tag_name } | ConvertTo-Json
  }
  'UploadAsset' {
    if ($ReleaseId -le 0) { throw 'Missing release id.' }
    $asset = (Resolve-Path -LiteralPath $AssetPath).Path
    $allowed = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../test-results/github-release-assets')) + [IO.Path]::DirectorySeparatorChar
    if (-not $asset.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)) { throw 'Asset must be in the reviewed release staging directory.' }
    $name = [IO.Path]::GetFileName($asset)
    $uri = "https://uploads.github.com/repos/C-xudco/PondClock/releases/$ReleaseId/assets?name=$([Uri]::EscapeDataString($name))"
    $contentType = if ($name.EndsWith('.zip')) { 'application/zip' } else { 'text/plain' }
    try { $uploaded = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType $contentType -InFile $asset -TimeoutSec 600 }
    catch { $status=[int]$_.Exception.Response.StatusCode; throw "Asset upload failed (HTTP $status); credential material suppressed." }
    [ordered]@{ name=$uploaded.name; size=$uploaded.size; digest=$uploaded.digest; url=$uploaded.browser_download_url; state=$uploaded.state } | ConvertTo-Json
  }
  'Verify' {
    $repo = Request-GitHub 'GET' $base
    $branch = Request-GitHub 'GET' ($base + '/branches/main')
    $release = Request-GitHub 'GET' ($base + '/releases/tags/v2.0.1')
    $tree = Request-GitHub 'GET' ($base + '/git/trees/' + $branch.commit.commit.tree.sha + '?recursive=1')
    if ($tree.truncated) { throw 'Remote tree listing is truncated; verification incomplete.' }
    [ordered]@{ repo=$repo.html_url; visibility=$repo.visibility; head=$branch.commit.sha; release=$release.html_url; tag=$release.tag_name; assets=@($release.assets | ForEach-Object { [ordered]@{ name=$_.name; size=$_.size; state=$_.state; digest=$_.digest; url=$_.browser_download_url } }); sourceTree=@($tree.tree | Where-Object { $_.type -eq 'blob' } | ForEach-Object { [ordered]@{ path=$_.path; sha=$_.sha; size=$_.size } }) } | ConvertTo-Json -Depth 6
  }
}
$headers = $null
