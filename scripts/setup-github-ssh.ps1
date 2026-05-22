# One-time GitHub SSH setup for WizFlow (re-run safe if key already exists on GitHub).
$ErrorActionPreference = 'Stop'
$Key = Join-Path $env:USERPROFILE '.ssh\github_pj_nrb_ke'
$Pub = "$Key.pub"
$Config = Join-Path $env:USERPROFILE '.ssh\config'
$RepoRoot = Split-Path $PSScriptRoot -Parent

if (-not (Test-Path $Key)) {
  ssh-keygen -t ed25519 -f $Key -N '""' -C 'wizflow-git-pj-nrb-ke'
}

$hostBlock = @'

Host github.com-pj-nrb-ke
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_pj_nrb_ke
  IdentitiesOnly yes
'@

if (-not (Test-Path $Config) -or -not (Select-String -Path $Config -Pattern 'github.com-pj-nrb-ke' -Quiet)) {
  Add-Content -Path $Config -Value $hostBlock
}

$pubKey = Get-Content $Pub -Raw
Set-Clipboard -Value $pubKey.Trim()
Write-Host 'Public key copied to clipboard.' -ForegroundColor Green
Write-Host $pubKey.Trim()

Set-Location $RepoRoot
git remote set-url origin git@github.com-pj-nrb-ke:pj-nrb-ke/WizFlow.git
Write-Host "Remote: $(git remote get-url origin)" -ForegroundColor Cyan

try {
  Get-Service ssh-agent | Set-Service -StartupType Manual -ErrorAction SilentlyContinue
  Start-Service ssh-agent -ErrorAction SilentlyContinue
  ssh-add $Key 2>$null
} catch { }

Write-Host ''
$tokenFile = Join-Path $RepoRoot 'apps\api\.github-token.local'
if (Test-Path $tokenFile) {
  & (Join-Path $PSScriptRoot 'register-github-ssh-key.ps1')
} else {
  Write-Host 'Optional: put a GitHub PAT in apps\api\.github-token.local and run register-github-ssh-key.ps1 (no browser).' -ForegroundColor DarkGray
  Write-Host 'Or paste the key from clipboard at GitHub -> SSH keys -> New.' -ForegroundColor Yellow
  Start-Process 'https://github.com/settings/ssh/new?title=WizFlow-pj-nrb-ke'
}

Write-Host 'Test: ssh -T git@github.com-pj-nrb-ke' -ForegroundColor Cyan
Write-Host 'Test: git fetch origin' -ForegroundColor Cyan
