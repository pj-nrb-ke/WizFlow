# New Agent Training — Handover from WizFlow Senior Developer

**Purpose:** Give a new Cursor agent (new project window) the same operational setup used successfully on **WizFlow**, so it can push to GitHub, send email via Brevo, deploy to VPS, and work efficiently with you as **Manager** while acting as **Senior Developer**.

**Important:** This file describes **patterns and paths on your PC**. It does **not** contain passwords or API keys. Secrets stay in gitignored files only.

---

## 1. Your role model (Manager + Senior Developer)

| Role | You (Manager) | Agent (Senior Developer) |
|------|----------------|---------------------------|
| Decisions | Product priorities, approve scope, UAT in browser | Propose options, implement, test, document |
| Commands | You do **not** need to run build/deploy/git/docker | Agent runs terminal, git, docker, SSH deploy |
| Verification | Open app in browser, click through flows, report “looks wrong” | Fix issues, re-deploy, update progress `.md` files |
| Git commits | Ask explicitly when you want a commit (“commit & push”) | Do not commit unless asked (unless your rules say otherwise) |
| Production | Say “deploy from git” — not SCP of local folders | `git push` then SSH + deploy script on server |

**Communication habits that work well**

- Reference screenshots by feature (“Snip 1 — purple box text”).
- Keep a living spec file (e.g. `Project-Features-Ver1.md`) with ✅ done / ⏸️ pending.
- Ask for chime when a milestone is done (`WizFlow-Male.mp3` on dev machine — optional).
- One clear task per message; agent batches tool calls without asking you to run scripts.

**Read first in any repo that has them**

- `AGENTS.md` — repo-specific agent rules  
- `docs/PARALLEL-AGENT-NOTE.md` — parallel agent / git / deploy conventions  
- `WizFlow-Features-Ver1.md` or equivalent — product backlog (WizFlow example)

---

## 2. GitHub — SSH access (how pushes work without browser login)

### Why SSH (not HTTPS)

On your machine there are **multiple GitHub accounts**. HTTPS triggers the wrong login. SSH uses a **dedicated key + host alias** per account/repo so `git push` works unattended from Cursor’s terminal.

### WizFlow reference (already configured)

| Item | Value |
|------|--------|
| GitHub account / org | `pj-nrb-ke` |
| WizFlow repo | `pj-nrb-ke/WizFlow` |
| Remote URL | `git@github.com-pj-nrb-ke:pj-nrb-ke/WizFlow.git` |
| Branch | `main` |
| SSH host alias | `github.com-pj-nrb-ke` |
| Private key file | `%USERPROFILE%\.ssh\github_pj_nrb_ke` |
| Public key file | `%USERPROFILE%\.ssh\github_pj_nrb_ke.pub` |

### One-time setup (new repo or repair)

From the **project root** in PowerShell:

```powershell
# WizFlow — repair or first-time
powershell -File scripts/setup-github-ssh.ps1
```

That script:

1. Creates ed25519 key `~/.ssh/github_pj_nrb_ke` if missing (empty passphrase for automation).
2. Appends to `~/.ssh/config`:

```sshconfig
Host github.com-pj-nrb-ke
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_pj_nrb_ke
  IdentitiesOnly yes
```

3. Sets `git remote` to `git@github.com-pj-nrb-ke:pj-nrb-ke/WizFlow.git`.
4. Starts `ssh-agent` and `ssh-add` the key.
5. Copies **public** key to clipboard → add at GitHub → **Settings → SSH and GPG keys → New SSH key** (account: `pj-nrb-ke`).

**Verify**

```powershell
ssh -T git@github.com-pj-nrb-ke
# Expect: "Hi pj-nrb-ke! You've successfully authenticated..."

cd C:\Users\pj\WizFlow
git fetch origin
git push origin main
```

### New project — replicate the pattern

For a **different repo** under the same GitHub account:

1. Copy `scripts/setup-github-ssh.ps1` or create a variant with:
   - New key path: e.g. `~/.ssh/github_pj_nrb_ke_myproject` (can reuse same key if same account — alias can differ).
   - New host alias: e.g. `Host github.com-pj-nrb-ke-myproject`
   - New remote: `git@github.com-pj-nrb-ke-myproject:ORG/REPO.git`
2. Register the **same** or new public key on GitHub (one key per machine is enough for one account).
3. In the new repo root: `git remote set-url origin git@github.com-pj-nrb-ke:ORG/REPO.git`

**Agent rules for git**

- Never run `git config --global` (user.name/email) unless the manager asks.
- Never `git push --force` to `main`/`master` without explicit approval.
- Commit only when asked; use clear commit messages (why, not only what).
- Before commit: `git status`, `git diff`, recent `git log` for message style.
- On Windows, prefer HEREDOC-style messages or simple `-m` with full sentences.

### Optional: register SSH key via API (no browser)

If `apps/api/.github-token.local` exists (gitignored PAT with `admin:repo` or `write:public_key`), run:

```powershell
powershell -File scripts/register-github-ssh-key.ps1
```

Do **not** commit the PAT file.

---

## 3. Brevo email — not SSH; secrets file + Docker mount

**Clarification:** Brevo is **not** accessed via SSH. Email uses:

- A **gitignored secrets file** on disk (`config/secrets/brevo.local.txt`)
- Loaded by the API at runtime (Docker mounts `config/` → `/config`)

SSH is only used for **VPS deploy** and sometimes copying secrets to the server separately.

### File locations (WizFlow)

| Path | Committed? | Purpose |
|------|------------|---------|
| `config/secrets/brevo.local.example.txt` | Yes | Template |
| `config/secrets/brevo.local.txt` | **No (gitignored)** | Real keys |
| `docs/email-integration.md` | Yes | Full agent/human guide |

### Create / update secrets (Manager one-time)

1. Copy example → real file:

```powershell
Copy-Item config\secrets\brevo.local.example.txt config\secrets\brevo.local.txt
```

2. In [Brevo](https://app.brevo.com) → **Transactional** → **SMTP & API**:
   - `BREVO_API_KEY` = API key (`xkeysib-…`) — preferred send path
   - `SMTP_PASS` = SMTP key (`xsmtpsib-…`) — **not** account password
   - `SMTP_USER` = SMTP login email from Brevo
   - `MAIL_FROM` = verified sender (e.g. `noreply@yourdomain.com`)
   - `MAIL_FROM_NAME` = display name

3. Set `APP_URL` in `infra/docker/.env` (or `.env.prod` on server) so links in emails point to the real web app.

### Test from WizFlow Docker

```powershell
cd C:\Users\pj\WizFlow\infra\docker
docker compose -p wizflow exec -T api python -m scripts.validate_brevo_config
docker compose -p wizflow exec -T api python -m scripts.test_brevo_smtp
```

### Production server (VPS)

On server, secrets are **not** in git. Typical layout:

- `/opt/wizflow/config/secrets/brevo.local.txt` — copy manually or secure channel, `chmod 600`
- Same format as local file  
- WizFlow deploy script expects this path under the repo’s `config/secrets/`

**Agent rules**

- Never commit `brevo.local.txt`, `.env` with real keys, or PATs.
- Same Brevo account can serve WizCRM + WizFlow with different `MAIL_FROM` / verified senders per domain.

### New project

Reuse the same pattern:

1. Add `config/secrets/brevo.local.example.txt` + gitignore `brevo.local.txt`.
2. Copy loader logic from `apps/api/app/services/brevo_config.py` and `brevo_mail.py` (or read `docs/email-integration.md`).
3. Mount `config/` in Docker Compose for the API service.

---

## 4. VPS / production deploy (SSH to server, code from Git)

WizFlow production uses **Contabo VPS** alongside WizCRM.

| Item | WizFlow value |
|------|----------------|
| Server IP | `161.97.141.220` |
| SSH user | `root` |
| SSH key | `%USERPROFILE%\.ssh\contabo_wizcrm` |
| SSH config alias | `contabo-wizcrm` (optional in `~/.ssh/config`) |
| App on server | `/opt/wizflow` |
| Deploy script | `bash /opt/wizflow/scripts/deploy-vps-wizflow.sh` |
| Web | https://app.wizflow.biz |
| API | https://api.wizflow.biz |
| Docker project name | `wizflow` (always `-p wizflow` — avoids clash with WizCRM) |

**Deploy from your PC (after `git push`)**

```powershell
ssh -i $env:USERPROFILE\.ssh\contabo_wizcrm root@161.97.141.220 "bash /opt/wizflow/scripts/deploy-vps-wizflow.sh"
```

If server repo is behind `origin/main`:

```powershell
ssh -i $env:USERPROFILE\.ssh\contabo_wizcrm root@161.97.141.220 "cd /opt/wizflow && git fetch origin && git reset --hard origin/main && bash scripts/deploy-vps-wizflow.sh"
```

**Agent owns:** pull, `docker compose build`, migrations, seed, `npm ci` + web build, Caddy reload — not the manager.

**New project on same VPS:** use a **different** `/opt/<app>` path, ports, and Docker project name; add Caddy blocks without breaking WizCRM.

---

## 5. Local development (WizFlow reference)

```powershell
cd C:\Users\pj\WizFlow\infra\docker
docker compose -p wizflow up -d
# Web: http://localhost:5200
# API: http://localhost:8010
# Demo login: admin@demo.wizflow.biz / changeme
```

After API schema changes:

```powershell
docker compose -p wizflow exec -T api alembic upgrade head
docker compose -p wizflow exec -e SEED_FORCE=1 -T api python -m scripts.seed_ample_volume
```

Web tests:

```powershell
cd C:\Users\pj\WizFlow\apps\web
npm run test
npm run build
```

---

## 6. Suggestions for efficient Manager ↔ Senior Developer work

### Documentation the agent should maintain

| File | Use |
|------|-----|
| `AGENTS.md` | Short rules for this repo |
| `*-Features-Ver1.md` | Backlog with ✅ / ⏸️ / 🔶 and changelog |
| `docs/PARALLEL-AGENT-NOTE.md` | Git, deploy, secrets conventions |
| `New-Agent-Training.md` | This handover (update when tooling changes) |

### Cursor / agent behavior

1. **Run commands yourself** — do not tell the manager to run docker/git unless they prefer to.
2. **Sub-agents** — split large work: backend API, UI/UX, integration tests, deploy (as on Phase 1 WizFlow).
3. **Minimal diffs** — match existing code style; no drive-by refactors.
4. **Progress updates** — update the features `.md` when completing or deferring work.
5. **Play chime** when the manager asks — `WizFlow-Male.mp3` via PowerShell MediaPlayer on Windows.

```powershell
Add-Type -AssemblyName presentationCore
$player = New-Object System.Windows.Media.MediaPlayer
$player.Open('C:\Users\pj\WizFlow\WizFlow-Male.mp3')
$player.Play()
Start-Sleep -Seconds 4
```

### Security checklist (every session)

- [ ] No secrets in commits  
- [ ] No `git config --global` changes  
- [ ] No force-push to main without approval  
- [ ] SSH keys and `brevo.local.txt` only on disk, chmod 600 on server  

### When starting a brand-new repo in Cursor

1. Clone or open folder; read `AGENTS.md` if present.  
2. Run or verify GitHub SSH (`ssh -T git@github.com-…`).  
3. Copy `brevo.local.example.txt` → `brevo.local.txt` if the app sends email.  
4. Ask manager for: repo URL, branch, VPS path (if any), domains, demo logins.  
5. Copy this file’s patterns into the new repo’s `AGENTS.md` (adapt names).  

### WizFlow-specific quick links (current project)

| Resource | Location |
|----------|----------|
| Feature backlog + pending | `WizFlow-Features-Ver1.md` |
| Brochure-style features | `WizFlow-Features.md` |
| Email | `docs/email-integration.md` |
| Hosting (sensitive — do not commit) | `config/secrets/website-hosting-notes.md` |
| Deploy | `scripts/deploy-vps-wizflow.sh` |
| Git SSH setup | `scripts/setup-github-ssh.ps1` |

---

## 7. First-hour checklist for the new agent

```text
[ ] Read AGENTS.md and WizFlow-Features-Ver1.md (or new project's equivalent)
[ ] ssh -T git@github.com-pj-nrb-ke
[ ] git fetch / git status in project root
[ ] Confirm config/secrets/brevo.local.txt exists (do not paste contents into chat)
[ ] docker compose -p wizflow ps  (if working on WizFlow)
[ ] Open http://localhost:5200 or staging URL for UAT
[ ] Ask manager: current priority (Phase 1 pending vs new project)?
```

---

## 8. What to tell the manager when blocked

| Blocker | What you need |
|---------|----------------|
| Git push denied | Public key added to correct GitHub account, or fix `remote` URL |
| Brevo fails | Verified `MAIL_FROM`, correct `xkeysib` / `xsmtpsib` keys in `brevo.local.txt` |
| Deploy wrong version | `git reset --hard origin/main` on server then re-run deploy script |
| Docker port conflict | Use `-p wizflow` project name; check `ss -tlnp` on VPS |

---

*Last updated: 2026-05-26 — derived from WizFlow operational setup (Git SSH `github.com-pj-nrb-ke`, Brevo `config/secrets/`, VPS `contabo_wizcrm`). Adapt section 2–4 for each new repository.*
