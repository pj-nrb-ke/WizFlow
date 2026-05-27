# Build WizFlow Android release APK locally (Expo prebuild + Gradle).
# Usage:
#   .\scripts\build-apk.ps1
#   .\scripts\build-apk.ps1 -ApiUrl "https://api.wizflow.biz" -WebUrl "https://app.wizflow.biz"
param(
  [string]$ApiUrl = "https://api.wizflow.biz",
  [string]$WebUrl = "https://app.wizflow.biz"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Mobile = Join-Path $Root "apps\mobile"
$ApkOut = Join-Path $Mobile "android\app\build\outputs\apk\release\app-release.apk"

Write-Host "==> WizFlow Android APK build" -ForegroundColor Cyan
Write-Host "    API: $ApiUrl"
Write-Host "    Web: $WebUrl"

Push-Location $Mobile

# .env for Expo public vars (baked in at build time)
@"
EXPO_PUBLIC_API_URL=$ApiUrl
EXPO_PUBLIC_WEB_URL=$WebUrl
"@ | Set-Content -Path ".env" -Encoding utf8

if (-not (Test-Path "node_modules")) {
  Write-Host "==> npm install"
  npm install
}

Write-Host "==> expo prebuild (android)"
npx expo prebuild --platform android --clean

$gradlew = Join-Path $Mobile "android\gradlew.bat"
if (-not (Test-Path $gradlew)) {
  throw "Gradle wrapper not found at $gradlew"
}

Write-Host "==> Gradle assembleRelease (first run may take 30-45 min)"
Push-Location (Join-Path $Mobile "android")
& .\gradlew.bat assembleRelease --no-daemon
Pop-Location

Pop-Location

if (-not (Test-Path $ApkOut)) {
  throw "APK not found at $ApkOut"
}

$size = [math]::Round((Get-Item $ApkOut).Length / 1MB, 1)
Write-Host ""
Write-Host "SUCCESS: $ApkOut ($size MB)" -ForegroundColor Green
