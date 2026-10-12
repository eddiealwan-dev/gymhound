# GymHound phone check (R540). Brings this folder to the branch under test, installs packages only when package-lock.json changed,
# prints the build the phone should show, then starts Expo with a clean cache. From the GymHound folder:
#   .\scripts\phone-check.cmd
# Local changes are set aside with git stash, never deleted. When node_modules is a link (on the owner's PC it points
# into C:\Users\eddie\.gymhound, because npm 11 deletes a linked node_modules), packages are installed in the folder it
# points into, with package.json, package-lock.json and patches copied there first (spec section 4).
param([string]$Branch = 'claude/compassionate-curie-jod0l5')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step([string]$text) { Write-Host ''; Write-Host "== $text" -ForegroundColor Cyan }
function Run([string]$exe, [string[]]$argv) {
  & $exe @argv
  if ($LASTEXITCODE -ne 0) { throw "$exe $($argv -join ' ') failed (exit code $LASTEXITCODE). Nothing else was changed." }
}

Step 'Getting the latest code'
$dirty = git status --porcelain
if ($dirty) {
  $label = 'phone-check ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')
  Run 'git' @('stash', 'push', '--include-untracked', '-m', $label)
  Write-Host "Local changes were set aside with git stash ('$label'). Nothing was deleted."
}
Run 'git' @('fetch', 'origin', $Branch)
Run 'git' @('checkout', '-B', $Branch, "origin/$Branch")

Step 'Checking packages'
$lockHash = (Get-FileHash (Join-Path $root 'package-lock.json') -Algorithm SHA256).Hash
$modules = Join-Path $root 'node_modules'
$installDir = $root
if (Test-Path $modules) {
  $item = Get-Item $modules -Force
  if ($item.LinkType) { $installDir = Split-Path -Parent (@($item.Target)[0]) }
}
# The marker lives in node_modules (ignored by git, and the folder the link points into), so it never shows as a change.
$stampFile = Join-Path $modules '.phone-check-lock'
$installed = ''
if (Test-Path $stampFile) { $installed = (Get-Content $stampFile -Raw).Trim() }
if ($installed -ne $lockHash -or -not (Test-Path $modules)) {
  if ($installDir -ne $root) {
    Write-Host "Installing in $installDir (node_modules links there)."
    Copy-Item (Join-Path $root 'package.json'), (Join-Path $root 'package-lock.json') -Destination $installDir -Force
    $patches = Join-Path $installDir 'patches'
    New-Item -ItemType Directory -Path $patches -Force | Out-Null
    Copy-Item (Join-Path $root 'patches\*') -Destination $patches -Recurse -Force
  }
  Push-Location $installDir
  # npm ci installs exactly what package-lock.json says and never rewrites it.
  try { Run 'npm.cmd' @('ci', '--no-audit', '--no-fund') } finally { Pop-Location }
  Set-Content -Path $stampFile -Value $lockHash
  Write-Host 'Packages installed.'
} else {
  Write-Host 'Packages are up to date.'
}

Step 'The build to look for'
$build = git log -1 --format='%h' --abbrev=7
$subject = git log -1 --format='%s'
Write-Host "Build $build" -ForegroundColor Green
Write-Host "Latest change: $subject"
Write-Host "In GymHound, Settings > Developer must say Build $build. If it says anything else, or nothing, shake the phone and tap Reload."

Step 'Starting Expo (press Ctrl+C to stop)'
& npx.cmd expo start --offline --clear
