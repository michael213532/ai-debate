# Dated zip backup of the beecision-live repo. Keeps the 20 most recent zips.
# Usage (from repo root):  powershell -ExecutionPolicy Bypass -File backup.ps1
$ErrorActionPreference = 'Stop'

$SourceDir = 'C:\Users\micha\beecision-live'
$BackupDir = 'C:\Users\micha\beecision-backups'
$KeepCount = 20

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$Stamp    = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$ZipPath  = Join-Path $BackupDir "beecision-$Stamp.zip"
$StageDir = Join-Path $env:TEMP "beecision-backup-$Stamp"

if (Test-Path $StageDir) { Remove-Item -Recurse -Force $StageDir }
New-Item -ItemType Directory -Path $StageDir -Force | Out-Null

# Mirror the repo into a staging dir, excluding caches/build artifacts.
# /MIR = mirror, /XD = exclude dirs, /XF = exclude files, /NFL /NDL /NJH /NJS = quiet.
$robocopyExcludeDirs  = @('__pycache__', 'node_modules', '.pytest_cache', '.venv', 'venv', '.mypy_cache', '.ruff_cache')
$robocopyExcludeFiles = @('*.db', '*.db-journal', '*.pyc')

$roboArgs = @($SourceDir, $StageDir, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
$roboArgs += @('/XD') + $robocopyExcludeDirs
$roboArgs += @('/XF') + $robocopyExcludeFiles

& robocopy @roboArgs | Out-Null
# robocopy exit codes 0-7 are success (8+ is failure)
if ($LASTEXITCODE -ge 8) {
    Remove-Item -Recurse -Force $StageDir -ErrorAction SilentlyContinue
    throw "robocopy failed with exit code $LASTEXITCODE"
}

Compress-Archive -Path (Join-Path $StageDir '*') -DestinationPath $ZipPath -Force

Remove-Item -Recurse -Force $StageDir -ErrorAction SilentlyContinue

# Keep only the 20 most recent zips.
$old = Get-ChildItem -Path $BackupDir -Filter 'beecision-*.zip' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip $KeepCount

foreach ($f in $old) {
    Remove-Item -Force $f.FullName
    Write-Host "Pruned old backup: $($f.Name)"
}

$size = (Get-Item $ZipPath).Length
Write-Host ("Backup created: {0} ({1:N1} MB)" -f $ZipPath, ($size / 1MB))
