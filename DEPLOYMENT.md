# Deployment

Target architecture on a single EC2 host:

```text
Internet
   ↓ :443 (TLS, Let's Encrypt) · :80 redirects + ACME challenges
Nginx container (reverse proxy, security headers, rate limits)
   ↓
App container (Next.js standalone, runs migrations on start)
   ↓
PostgreSQL container (data on a named Docker volume)
   ↑
Backup container (nightly pg_dump → taap_backups volume → optional S3)
```

HTTPS is not optional any more: browsers only allow the microphone on secure
origins, and Twilio media streams require `wss://`.

---

## 0. Provision with Terraform (recommended)

Everything in §1.1–1.5 below is automated in
[`infra/terraform/`](infra/terraform/README.md):

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # set repo_url, domain_name, letsencrypt_email
terraform init && terraform apply
terraform output dns_record_hint                # create this A record unless route53_zone_id is set
terraform output app_url                        # live ~5 minutes after apply
```

The instance bootstraps itself: Docker install, repo clone, `.env` with a
locally generated database password and session secret, a first operator
login (`/home/ubuntu/taap-admin-login.txt`), `docker compose up -d --build`
with the `tls` profile when a domain is set, and a health gate.
`terraform output github_actions_secrets` prints the values for §3.
The manual path below remains for anyone provisioning by hand.

---

## 1. First-time EC2 deployment (manual)

### 1.1 Provision the instance

- AMI: **Ubuntu Server 24.04 LTS**
- Instance type: `t3.small` or larger (2 GB+ RAM for the Docker build)
- Storage: 20 GB gp3
- Security group inbound rules:
  - `22/tcp` — your IP only (SSH)
  - `80/tcp` — 0.0.0.0/0 (HTTP → HTTPS redirect, certificate challenges)
  - `443/tcp` — 0.0.0.0/0 (HTTPS)
- Create/download a key pair, e.g. `taap-demo.pem`.

### 1.2 SSH in

```bash
chmod 400 taap-demo.pem
ssh -i taap-demo.pem ubuntu@<EC2_PUBLIC_IP>
```

### 1.3 Install Docker + Compose plugin

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker ubuntu
newgrp docker            # or log out and back in
docker --version && docker compose version
```

### 1.4 Install Git & clone the repository

```bash
sudo apt-get install -y git
git clone <YOUR_REPOSITORY_URL> ~/travel-assistance-os
cd ~/travel-assistance-os
```

### 1.5 Configure the production environment

```bash
cp .env.example .env
nano .env
```

Set at minimum:

```text
POSTGRES_PASSWORD=<a strong generated password>
DOMAIN=demo.example.com            # DNS A record → this instance's IP
LETSENCRYPT_EMAIL=ops@example.com
NEXT_PUBLIC_APP_URL=https://demo.example.com
PUBLIC_BASE_URL=https://demo.example.com
AI_API_KEY=            # optional; empty = offline demo AI
AUTO_SEED=true
```

Then create the operator logins (prints each password once, stores only a
scrypt hash, and generates `SESSION_SECRET` on first use):

```bash
./scripts/add-operator.sh admin
./scripts/add-operator.sh elif
```

Never commit `.env`. Never reuse passwords.

### 1.6 – 1.11 Start database, migrate, seed, start app

One command does all of it (the app entrypoint applies migrations and, with
`AUTO_SEED=true`, the idempotent demo seed):

```bash
COMPOSE_PROFILES=tls docker compose up -d --build   # omit the profile when DOMAIN is empty
docker compose logs -f app     # watch: migrations → seed → "starting application"
docker compose logs -f certbot # watch: certificate issued (needs DNS in place)
```

### 1.12 Health-check verification

```bash
curl -s http://localhost/api/health
# → {"status":"ok","database":"ok",...}
```

Open `http://<EC2_PUBLIC_IP>` in a browser and click through the dashboard.
The deployment is only considered successful when the health check returns
`"status":"ok"`.

---

## 2. HTTPS (automatic with `DOMAIN`)

With `DOMAIN` and `LETSENCRYPT_EMAIL` set and the DNS A record pointing at the
instance, the `tls` compose profile handles everything:

1. nginx starts in HTTP mode and serves `/.well-known/acme-challenge/`.
2. The `certbot` container obtains a certificate (retrying every 10 minutes
   until DNS resolves) and renews it twice a day.
3. nginx notices the certificate within 5 minutes and switches to HTTPS
   (HTTP then only redirects); it reloads every 12 hours to pick up renewals.

`scripts/deploy.sh` enables the profile whenever `DOMAIN` is set. Check with
`curl -I https://$DOMAIN` — the response carries HSTS and the security
headers from `nginx/snippets/app.conf`.

---

## 2b. Voice, telephony, e-mail and fax

### Voice (xAI)
Set `XAI_API_KEY` in `.env` and `docker compose up -d`. The `voice-gateway`
service (same image) carries all live audio; nginx routes `/ws/` to it.
`docker compose logs -f voice-gateway` shows sessions as they start and end.

### Phone (Twilio)
1. Buy a voice-capable number (a US/UK local number is quickest; Turkish
   numbers need a regulatory bundle). Put it in `TWILIO_PHONE_NUMBER`, with
   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `PUBLIC_BASE_URL=https://<domain>`.
2. On the number: **A call comes in → Webhook → POST
   `https://<domain>/api/twilio/voice/inbound`**; **Call status changes →
   `https://<domain>/api/twilio/voice/status`**.
3. Voice → Settings → **Geo permissions**: enable the countries you'll call
   (e.g. Türkiye +90). Trial accounts can only call verified numbers.
4. Set `ON_CALL_DOCTOR_NUMBER`, `CASE_MANAGER_NUMBER` and
   `OUTBOUND_ALLOWED_NUMBERS` (only these can be dialled by AI agents).
5. SMS upload links: US recipients need A2P 10DLC registration (days to
   weeks); until then the agent offers an e-mailed link instead.

Webhooks are rejected unless their `X-Twilio-Signature` matches — so
`PUBLIC_BASE_URL` must be exactly the URL configured in Twilio.

### Inbound e-mail (Twilio SendGrid Inbound Parse)
1. DNS: `MX inbound.<domain> → mx.sendgrid.net` (priority 10).
2. SendGrid → Settings → Inbound Parse → host `inbound.<domain>`, URL
   `https://<domain>/api/inbound/email/<INBOUND_EMAIL_SECRET>`; tick
   "POST the raw, full MIME message" **off** (the parsed form is used).
3. Outbound replies: `SENDGRID_API_KEY`, and a verified sender for `EMAIL_FROM`.

### Fax
Fax runs on the mock provider (`FAX_PROVIDER=mock`): inbound faxes arrive via
the Inbox's *Receive it* samples or `POST /api/inbound/fax/<INBOUND_FAX_SECRET>`
(multipart: `from`, `to`, `id`, the PDF), and outgoing letters are recorded in
the outbox. A real provider (Documo mFax, Fax.Plus, …) is one adapter class.

---

## 3. GitHub Actions CI/CD (automated deployment)

Workflow: `.github/workflows/deploy.yml`.

Pipeline: push to `main` → install deps → lint → typecheck → migrate+seed a
CI database → unit+integration tests → build → production Docker image build
→ **only if everything passed** → SSH into EC2 → check out the exact commit CI
tested → run `scripts/deploy.sh <sha>` → health check gates success, with an
automatic rollback to the previous release if the new one never turns healthy.

### Required GitHub secrets

| Secret | Value |
|---|---|
| `EC2_HOST` | EC2 public IP or DNS name |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Contents of the private key (PEM) for that host |
| `EC2_APP_DIR` | Optional; defaults to `~/travel-assistance-os` |
| `EC2_HOST_FINGERPRINT` | SHA256 host key fingerprint: `ssh-keyscan <host> 2>/dev/null \| ssh-keygen -lf -` (prevents man-in-the-middle) |

Create a **dedicated deploy key pair** for CI rather than reusing your
personal key: `ssh-keygen -t ed25519 -f deploy_key`, append `deploy_key.pub`
to `~/.ssh/authorized_keys` on EC2, and paste `deploy_key` into the
`EC2_SSH_KEY` secret. Never commit private keys, `.env`, AWS credentials, AI
API keys or database passwords.

---

## 4. Manual deployment fallback

Manual deployment must always remain possible (do not depend on GitHub
Actions in an emergency):

The deploy script is the same one CI runs:

```bash
ssh -i taap-demo.pem ubuntu@<EC2_PUBLIC_IP>
cd ~/travel-assistance-os
./scripts/deploy.sh ~/travel-assistance-os            # tip of origin/main
./scripts/deploy.sh ~/travel-assistance-os <commit>   # or an exact commit
```

By hand, without the script:

```bash
git fetch origin && git checkout --detach origin/main
TAG=$(git rev-parse --short=12 HEAD)
IMAGE_TAG=$TAG COMPOSE_PROFILES=tls docker compose up -d --build
# migrations run automatically in the app entrypoint; to run them explicitly:
docker compose exec app node /opt/prisma/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma
docker compose ps    # app should be "healthy"
```

---

## 5. Rollback procedure

Every release is an image tagged with its commit (`taap-app:<sha12>`), and
`deploy.sh` keeps the current and previous release. A failed deploy rolls
back automatically; to roll back by hand:

```bash
ssh ubuntu@<EC2_PUBLIC_IP>
cd ~/travel-assistance-os
./scripts/rollback.sh                       # previous release (.deploy/previous)
./scripts/rollback.sh ~/travel-assistance-os <commit>   # any earlier commit
```

Notes:
- Database data lives on the `taap_pgdata` volume and survives rollbacks,
  rebuilds and container removal. Only `docker volume rm` deletes it.
- Migrations are additive (forward-only); an older release runs fine on a
  newer schema. If data itself must be restored, see §6.

## 6. Backups and restore

The `backup` service writes a `pg_dump` (custom format) to the `taap_backups`
volume at start-up and every 24 hours, keeping `BACKUP_RETENTION_DAYS` days.

Off-host copies: set `backup_bucket_name` in Terraform (new instances get a
cron job automatically), or on an existing host:

```bash
sudo snap install aws-cli --classic
echo "30 3 * * * root /home/ubuntu/travel-assistance-os/scripts/backup-to-s3.sh s3://<bucket>/taap >> /var/log/taap-backup.log 2>&1" \
  | sudo tee /etc/cron.d/taap-backup
```

Restore a dump:

```bash
docker compose exec backup ls -lh /backups
docker compose exec backup sh -c 'pg_restore --clean --if-exists -d "$PGDATABASE" /backups/<file>.dump'
```

## 7. Upgrading an existing deployment to HTTPS + sign-in

One-time steps for a host deployed before operator sign-in existed
(`deploy.sh` refuses to deploy until sign-in is configured):

```bash
cd ~/travel-assistance-os
git fetch origin && git checkout --detach origin/main
./scripts/add-operator.sh admin                 # note the printed password
nano .env    # add DOMAIN, LETSENCRYPT_EMAIL, PUBLIC_BASE_URL=https://<domain>, NEXT_PUBLIC_APP_URL=https://<domain>
./scripts/deploy.sh ~/travel-assistance-os
```

Then in `infra/terraform/terraform.tfvars` set `enable_https_port = true` and
run `terraform apply` (opens 443 and limits IMDS to the host; both in place —
the instance is not replaced or restarted).

## 8. Operations quick reference

With `DOMAIN` set, prefix commands that start services with
`COMPOSE_PROFILES=tls` (or export it in your shell).

```bash
docker compose ps                     # stack status (all should be healthy)
docker compose logs -f app            # application logs
docker compose logs -f nginx db       # proxy / database logs
docker compose restart app            # restart just the app
docker compose down                   # stop stack (volumes/data preserved)
docker compose exec db psql -U taap taap   # database console
cat .deploy/current .deploy/previous  # deployed / previous release commits
```
