# QA-006 anti-stuck runner: one Playwright batch at a time, hard wall-clock cap per batch.
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
$E2e = Join-Path $Root "tests\e2e"
$Out = Join-Path $Root "docs\qa-reports\wiz-qa-006"
New-Item -ItemType Directory -Force -Path $Out, (Join-Path $Out "failures"), (Join-Path $Out "logs") | Out-Null

$env:CI = "1"
$env:PLAYWRIGHT_BASE_URL = if ($env:PLAYWRIGHT_BASE_URL) { $env:PLAYWRIGHT_BASE_URL } else { "https://app.wizflow.biz" }
$env:PLAYWRIGHT_API_URL = if ($env:PLAYWRIGHT_API_URL) { $env:PLAYWRIGHT_API_URL } else { "https://api.wizflow.biz" }

$batches = @(
  @{ Name = "Batch 1"; Pattern = "Batch 1" },
  @{ Name = "Batch 2"; Pattern = "Batch 2" },
  @{ Name = "Batch 3"; Pattern = "Batch 3" },
  @{ Name = "Batch 4"; Pattern = "Batch 4" },
  @{ Name = "Batch 5"; Pattern = "Batch 5" }
)

$maxSec = 150
Push-Location $E2e
foreach ($b in $batches) {
  Write-Host "`n=== QA-006 $($b.Name) (max ${maxSec}s) ===" -ForegroundColor Cyan
  $proc = Start-Process -FilePath "npx" -ArgumentList @(
    "playwright", "test", "qa006.batches.spec.ts",
    "--config=qa006.playwright.config.ts",
    "--project=chromium",
    "--retries=0",
    "-g", $b.Pattern,
    "--reporter=line"
  ) -PassThru -NoNewWindow -WorkingDirectory $E2e
  $done = $proc.WaitForExit($maxSec * 1000)
  if (-not $done) {
    Write-Host "TIMEOUT - killing $($b.Name)" -ForegroundColor Red
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Get-Process chromium, chrome, node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  } else {
    Write-Host "Exit code: $($proc.ExitCode)" -ForegroundColor $(if ($proc.ExitCode -eq 0) { "Green" } else { "Yellow" })
  }
  Start-Sleep -Seconds 2
}
Pop-Location

python (Join-Path $Root "scripts\qa006_generate_report.py")
$chime = Join-Path $Root "WizFlow-Male.mp3"
if (Test-Path $chime) {
  Add-Type -AssemblyName presentationCore
  $p = New-Object System.Windows.Media.MediaPlayer
  $p.Open([uri]$chime)
  $p.Play()
  Start-Sleep -Seconds 3
}
