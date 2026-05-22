# Registers ~/.ssh/github_pj_nrb_ke.pub on GitHub (pj-nrb-ke) using a one-time PAT.
# Create apps/api/.github-token.local (gitignored) with one line: ghp_xxxx or github_pat_xxxx
# Scopes: classic "admin:public_key" OR fine-grained account SSH key permission.
$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$TokenFile = Join-Path $Root 'apps\api\.github-token.local'
$Pub = Join-Path $env:USERPROFILE '.ssh\github_pj_nrb_ke.pub'

if (-not (Test-Path $Pub)) {
  & (Join-Path $PSScriptRoot 'setup-github-ssh.ps1')
}

if (-not (Test-Path $TokenFile)) {
  Write-Host 'Missing apps\api\.github-token.local — add a GitHub PAT (one line) to auto-register the SSH key.' -ForegroundColor Yellow
  exit 1
}

$token = (Get-Content $TokenFile -Raw).Trim()
$keyBody = Get-Content $Pub -Raw
$payload = @{
  title = 'WizFlow-agent-pj-nrb-ke'
  key   = $keyBody.Trim()
} | ConvertTo-Json

$headers = @{
  Authorization        = "Bearer $token"
  Accept               = 'application/vnd.github+json'
  'X-GitHub-Api-Version' = '2022-11-28'
}

try {
  Invoke-RestMethod -Uri 'https://api.github.com/user/keys' -Method Post -Headers $headers -Body $payload -ContentType 'application/json'
  Write-Host 'SSH key registered on GitHub.' -ForegroundColor Green
  ssh -o BatchMode=yes -T git@github.com-pj-nrb-ke 2>&1
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
  exit 1
}
