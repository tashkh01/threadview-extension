# build-zip.ps1
#
# Builds the Chrome Web Store submission ZIP from the extension repo.
# Output: ./dist/threadview-v<version>.zip
#
# Excludes:
#   - docs/ (handoffs, planning, listing copy, screenshots — all dev artifacts)
#   - .git/ (version control)
#   - node_modules/ (defensive — none currently)
#   - build-zip.ps1 (this script itself)
#   - dist/ (output directory)
#   - LICENSE (kept — it's referenced from the repo, but not strictly required
#     in the ZIP. Including it is harmless and good practice.)
#   - README.md (kept — visible to reviewers if they extract the ZIP, helps
#     them understand the extension. Harmless to ship.)
#
# Run:
#   powershell -ExecutionPolicy Bypass -File .\build-zip.ps1

$ErrorActionPreference = "Stop"

$repoRoot = $PSScriptRoot
$manifestPath = Join-Path $repoRoot "manifest.json"
$distDir = Join-Path $repoRoot "dist"
$stageDir = Join-Path $distDir "_stage"

# 1. Read version from manifest.
$manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json
$version = $manifest.version
Write-Host "Building ZIP for ThreadView v$version" -ForegroundColor Cyan

# 2. Prepare clean stage directory.
if (Test-Path $stageDir) { Remove-Item -Recurse -Force $stageDir }
New-Item -ItemType Directory -Path $stageDir | Out-Null
if (-not (Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir | Out-Null }

# 3. Files and directories to include in the ZIP. Each is copied to $stageDir.
$includePaths = @(
  "manifest.json",
  "LICENSE",
  "README.md",
  "icons",
  "src"
)

foreach ($p in $includePaths) {
  $src = Join-Path $repoRoot $p
  if (-not (Test-Path $src)) {
    Write-Warning "Skipping $p (not found)"
    continue
  }
  $dst = Join-Path $stageDir $p
  if (Test-Path -PathType Container $src) {
    Copy-Item -Path $src -Destination $dst -Recurse
  } else {
    Copy-Item -Path $src -Destination $dst
  }
}

# 4. Defensive: prune any temp/render files inside src/viewer that may have
# leaked. The build-zip script should never include _render*.html or
# _fakethread*.html.
$junk = Get-ChildItem -Recurse -Path $stageDir -File | Where-Object {
  $_.Name -like "_*"
}
if ($junk) {
  Write-Host "Pruning dev-only files from stage:" -ForegroundColor Yellow
  foreach ($f in $junk) {
    Write-Host "  - $($f.FullName.Substring($stageDir.Length))"
    Remove-Item -Force $f.FullName
  }
}

# 5. Verify manifest is at root of stage.
$stageManifest = Join-Path $stageDir "manifest.json"
if (-not (Test-Path $stageManifest)) {
  throw "manifest.json missing from stage; aborting."
}

# 6. Print stage tree for the human to verify.
Write-Host "`nStage contents:" -ForegroundColor Cyan
Get-ChildItem -Recurse $stageDir | ForEach-Object {
  $rel = $_.FullName.Substring($stageDir.Length).TrimStart('\','/')
  if ($_.PSIsContainer) {
    Write-Host "  [dir]  $rel"
  } else {
    Write-Host "  [file] $rel  ($($_.Length) bytes)"
  }
}

# 7. Create the ZIP.
$zipPath = Join-Path $distDir "threadview-v$version.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path "$stageDir\*" -DestinationPath $zipPath -CompressionLevel Optimal

# 8. Verify ZIP.
$zipSize = (Get-Item $zipPath).Length
Write-Host "`nBuilt: $zipPath" -ForegroundColor Green
Write-Host "Size : $zipSize bytes" -ForegroundColor Green

# 9. Clean up the stage directory.
Remove-Item -Recurse -Force $stageDir

Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  1. Extract this ZIP to a temp directory."
Write-Host "  2. Load unpacked from there in a fresh Chrome profile."
Write-Host "  3. Smoke-test: open Gmail, click ThreadView on a thread, verify viewer renders."
Write-Host "  4. If clean, upload threadview-v$version.zip to the Web Store dev console."
