# WizFlow production setup — answers for hosting agent

Copy this document to the WizFlow hosting agent. Update any line marked **(confirm with owner)** before send if something changed.

**Prepared from:** WizCRM production context on the same Contabo VPS (`161.97.141.220`).

---

## 1. Domains & DNS (required)

| Role | Hostname | Notes |
|------|----------|--------|
| **API** | `api.wizflow.biz` | **(confirmed with owner)** — alternative discussed: `api.wizflow.app` |
| **Web** | `app.wizflow.biz` | **(confirmed with owner)** — alternative: `app.wizflow.app` |

**DNS:** Yes — owner can add **A records** for both hostnames → **`161.97.141.220`** (same VPS as WizCRM).

**Existing DNS on this server (do not overwrite):**

| Host | Points to |
|------|-----------|
| `api.wizcrm.app` | `161.97.141.220` |
| `app.wizcrm.app` | `161.97.141.220` |

After DNS propagates, verify:

```text
nslookup api.wizflow.biz
nslookup app.wizflow.biz
```

Both should return `161.97.141.220`.

---

## 2. Server access (required)

### SSH from owner’s PC

| Item | Value |
|------|--------|
| Works today? | **Yes** — key-based login as **root** |
| VPS IP | `161.97.141.220` |
| SSH user | **`root`** (preferred for first install; deploy user optional later) |
| SSH config alias | `contabo-wizcrm` in `%USERPROFILE%\.ssh\config` |
| Private key | `%USERPROFILE%\.ssh\contabo_wizcrm` |
| Quick test | `ssh contabo-wizcrm` or `ssh -i %USERPROFILE%\.ssh\contabo_wizcrm root@161.97.141.220` |

**For this agent on another machine:** owner will copy the private key + `config` snippet, or add a new public key to `/root/.ssh/authorized_keys` on the VPS.

**Not stored in git:** there is no `docs/hosting.local.txt` in WizCRM yet; access is the SSH key above. WizFlow should use its own `docs/hosting.local.txt` under the WizFlow repo (see WizCRM `docs/HOSTING-WEB-SERVER.md` pattern).

### One-time read-only server audit

**Yes — OK** to run a read-only audit before binding new ports, for example:

```bash
cat /etc/caddy/Caddyfile
docker ps
ss -tlnp
systemctl list-units --type=service --state=running
```

**Goal:** confirm nothing else is using WizFlow’s planned ports **`8010`** (API), **`5433`** (Postgres), **`6381`** (Redis).

**Known WizCRM usage on same box (avoid conflicts):**

| Service | Typical bind |
|---------|----------------|
| WizCRM API (systemd) | `127.0.0.1:3000` |
| WizCRM Postgres (Docker) | `127.0.0.1:5432` |
| Caddy | `:80`, `:443` |

WizFlow loopback ports **8010 / 5433 / 6381** should be fine if audit shows them free.

---

## 3. Git deploy (required)

| Item | Answer |
|------|--------|
| **Repo URL** | `git@github.com-pj-nrb-ke:pj-nrb-ke/WizFlow.git` **(confirm with owner)** |
| **Branch** | `main` **(confirm with owner)** — WizCRM uses `development`; WizFlow may differ |
| **Clone from server** | **SSH deploy key** — same pattern as WizCRM: GitHub host alias `github.com-pj-nrb-ke`, key on VPS or owner’s machine |

WizCRM reference remote: `git@github.com-pj-nrb-ke:pj-nrb-ke/WizCRM.git` branch `development`.

**Owner action if clone fails:** add VPS deploy key to GitHub repo **WizFlow** (read access), or make repo cloneable from the server.

---

## 4. Secrets & config (required — not in git)

Place on server under **`/opt/wizflow`**, **`chmod 600`** where noted.

| Item | Purpose | Owner provides |
|------|---------|----------------|
| `config/secrets/brevo.local.txt` | Approval / transactional email | **Yes** — copy from local dev file or create from `brevo.local.example.txt`; see `docs/email-integration.md` in WizFlow/WizCRM |
| `JWT_SECRET` | API auth | **Yes** — **new** long random string; **do not reuse WizCRM’s** |
| `DATABASE_URL` | Postgres | `postgresql://wizflow:<password>@127.0.0.1:5433/wizflow_prod` — password **generated on server** or sent via secure channel (**not chat**) |
| `APP_URL` | Email approval links | `https://app.wizflow.biz` **(match final web hostname)** |
| `CORS_ORIGINS` | Browser API access | `https://app.wizflow.biz` **(same as web hostname)** |
| `AI_API_KEY` + `AI_MODEL` | AI workflow features | **(confirm with owner)** — provide if prod AI is required; else disable AI in prod |

**Postgres password:** agent may **generate on server** during first install; share with owner only via secure channel.

**Brevo:** owner already uses Brevo for WizCRM (`docs/brevo.local.txt` locally). WizFlow can use the **same Brevo account** with appropriate `MAIL_FROM` / verified sender for the WizFlow domain, or separate keys — **(confirm with owner)**.

**Do not commit** any of the above to git.

---

## 5. Product choices (please confirm)

| Choice | Owner answer |
|--------|----------------|
| **Hosting style** | **Yes, OK** — Docker on VPS for API + Postgres + Redis; Caddy `reverse_proxy` to API on loopback (e.g. `127.0.0.1:8010`), same idea as WizCRM but WizCRM API is systemd on `:3000` not Docker |
| **Web** | **Yes, OK** — static Vite build → `/var/www/wizflow-web`; Caddy `file_server` + `try_files {path} /index.html` (same pattern as `/var/www/wizcrm-web`) |
| **Uploads path** | **`/opt/wizflow/uploads`** (or `/var/lib/wizflow/uploads` if agent prefers volume layout) — **(confirm with owner)** |
| **Demo seed on prod** | **(confirm with owner)** — suggested default: **empty company + real users only** (no rich demo on production unless explicitly wanted) |

---

## 6. Operational (helpful)

| Question | Answer |
|----------|--------|
| **Who runs deploys after setup?** | **Agent via SSH** (owner does not run deploy scripts); same as WizCRM — `git push` + deploy script over SSH |
| **Maintenance window for first install?** | **Yes, OK** — migrations, seed, Docker bring-up, Caddy reload |
| **Firewall / IP allowlist** | **Standard 80/443** only; no extra corporate IP allowlist known **(confirm with owner)** |

**WizCRM coexistence:** do not stop `wizcrm-api`, `wizcrm-postgres`, or existing Caddy blocks for `*.wizcrm.app` unless coordinated.

**Suggested WizFlow paths on server:**

| Path | Use |
|------|-----|
| `/opt/wizflow` | Git repo + Docker compose + secrets |
| `/var/www/wizflow-web` | Static web root |
| `/opt/wizflow/uploads` | Attachments **(if confirmed)** |

---

## Quick reference — WizCRM on same VPS (do not break)

| Item | WizCRM value |
|------|----------------|
| IP | `161.97.141.220` |
| API | `https://api.wizcrm.app` |
| Web | `https://app.wizcrm.app` |
| App root | `/opt/wizcrm` |
| Web root | `/var/www/wizcrm-web` |

---

## Items owner must confirm before go-live

- [ ] Final domains: `wizflow.biz` vs `wizflow.app` for API and web  
- [ ] WizFlow GitHub repo URL and branch (`main`?)  
- [ ] Demo seed on production: yes or no  
- [ ] AI in production: keys yes/no  
- [ ] Uploads directory path  
- [ ] Share generated `DATABASE_URL` password securely after install  

---

*File for handoff only — do not commit secrets into this file.*
