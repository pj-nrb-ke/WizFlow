# Parallel agent operations note

Copy this into other agents (chat opener, `.cursor/rules/*.mdc`, or `AGENTS.md`). Adjust the **project-specific** section per repo.

---

## User role

- **User does not run** build, deploy, git push, `npm install`, Prisma, Docker, or server restart scripts.
- **User only verifies** that the app works (browser, API health, mobile build if relevant).
- After code changes, **you** commit (when appropriate), push, deploy, and refresh local dev assets without asking the user to run commands.

---

## Git / GitHub (no account popup)

- Prefer **SSH** per repo, not HTTPS, when multiple GitHub accounts exist on the machine.
- Pattern:
  - Key: `~/.ssh/github_<account-or-project>` (ed25519, empty passphrase for unattended push)
  - `~/.ssh/config` host alias, e.g. `Host github.com-myproject` → `HostName github.com`, `IdentityFile`, `IdentitiesOnly yes`
  - Remote: `git@github.com-myproject:ORG/REPO.git`
- Register the **public** key once on the correct GitHub account (`*.pub` only).
- Do **not** change global `git config` (user.name/email) unless asked.
- **Commit** only when the user asks or the task clearly includes delivery; never force-push `main`/`master`.

Helper scripts in this repo: `scripts/setup-github-ssh.ps1`, `scripts/register-github-ssh-key.ps1`.

---

## Deploy (adapt per project)

When this project has a VPS or staging server, **you** run the full pipeline after push:

1. `git pull` on server (stash local junk on server if pull fails)
2. `npm install` / `npm ci` as needed
3. Build order: **shared → api/backend → frontend** (project-specific)
4. DB migrations (`prisma db push` / migrate) if schema changed
5. Restart app service (`systemctl restart …` or equivalent)
6. Copy static frontend to web root + reload reverse proxy (Caddy/nginx)
7. Smoke-check health URL and report status to the user

Keep deploy in repo scripts, e.g. `scripts/deploy-vps.sh` + `scripts/refresh-local.ps1`, and run them over SSH from Windows with LF-normalized bash (avoid CRLF in piped scripts).

---

## Local refresh

After web/API edits: rebuild locally (`refresh-local` script or workspace builds). Restart `dev` server in the background if the user uses it; they only refresh the browser.

---

## Secrets

- Never commit `.env`, API keys, PATs, or private keys.
- Optional: gitignored `api/.github-token.local` for one-time SSH key registration via API only if SSH cannot be done in the browser.

---

## Communication

- Give short **“what to check”** URLs/credentials (test users from seed, not production secrets).
- Do not dump long implementation detail unless asked; user cares if it **works**.

---

## WizFlow-specific (this repo)

| Item | Value |
|------|--------|
| Repo | `git@github.com-pj-nrb-ke:pj-nrb-ke/WizFlow.git` branch `main` |
| SSH host | `github.com-pj-nrb-ke` |
| SSH key | `~/.ssh/github_pj_nrb_ke` (shared with other pj-nrb-ke repos) |
| Setup scripts | `scripts/setup-github-ssh.ps1`, `scripts/register-github-ssh-key.ps1` |
| Local web | http://localhost:5200 |
| Local API | http://localhost:8010 |
| Docker | `infra/docker/docker-compose.yml` |
| Test logins | `admin@demo.wizflow.biz` / `originator@demo.wizflow.biz` / `changeme` (seed) |

**Status:** Git remote uses SSH (no HTTPS popup). Push/pull via `git@github.com-pj-nrb-ke:…`.

---

## WizCRM-specific (other folder — do not mix)

| Item | Value |
|------|--------|
| Repo | `git@github.com-pj-nrb-ke:pj-nrb-ke/WizCRM.git` branch `development` |
| SSH host | `github.com-pj-nrb-ke` |
| VPS SSH | `ssh -i ~/.ssh/contabo_wizcrm root@161.97.141.220` or host `contabo-wizcrm` |
| API | `https://api.wizcrm.app` |
| Web | `https://app.wizcrm.app` |
| Deploy | `scripts/deploy-vps.sh` (pipe to SSH), `scripts/refresh-local.ps1` |
| Test logins | `admin@wizag.local` / `manager@wizag.local` / `wizcrm123` (seed) |

---

## Minimal one-liner (other projects)

> You own git push (SSH), builds, deploy, and local dev refresh. I only test the app. Do not ask me to run scripts. Commit when delivering work; never touch secrets or global git config.
