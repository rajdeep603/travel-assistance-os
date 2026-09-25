# Deployment

Target architecture on a single EC2 host:

```text
Internet
   ↓ :80 (add :443/TLS below)
Nginx container (reverse proxy)
   ↓
App container (Next.js standalone, runs migrations on start)
   ↓
PostgreSQL container (data on a named Docker volume)
```

---

## 1. First-time EC2 deployment (manual)

### 1.1 Provision the instance

- AMI: **Ubuntu Server 24.04 LTS**
- Instance type: `t3.small` or larger (2 GB+ RAM for the Docker build)
- Storage: 20 GB gp3
- Security group inbound rules:
  - `22/tcp` — your IP only (SSH)
  - `80/tcp` — 0.0.0.0/0 (HTTP)
  - `443/tcp` — 0.0.0.0/0 (only if enabling HTTPS)
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
NEXT_PUBLIC_APP_URL=http://<EC2_PUBLIC_IP>
AI_API_KEY=            # optional; empty = offline demo AI
AUTO_SEED=true
```

Never commit `.env`. Never reuse passwords.

### 1.6 – 1.11 Start database, migrate, seed, start app

One command does all of it (the app entrypoint applies migrations and, with
`AUTO_SEED=true`, the idempotent demo seed):

```bash
docker compose up -d --build
docker compose logs -f app     # watch: migrations → seed → "starting application"
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

## 2. HTTPS (optional but recommended for public demos)

With a DNS name pointing at the instance:

```bash
sudo apt-get install -y certbot
sudo certbot certonly --standalone -d demo.example.com   # stop nginx container first
```

Then mount the certificates into the nginx container and add a `listen 443
ssl;` server block to `nginx/default.conf` (certbot renew via cron with a
pre/post hook stopping/starting the nginx container). Document the exact
domain used in your run book.

---

## 3. GitHub Actions CI/CD (automated deployment)

Workflow: `.github/workflows/deploy.yml`.

Pipeline: push to `main` → install deps → lint → typecheck → migrate+seed a
CI database → unit+integration tests → build → **only if everything passed**
→ SSH into EC2 → run `scripts/deploy.sh` → health check gates success.

### Required GitHub secrets

| Secret | Value |
|---|---|
| `EC2_HOST` | EC2 public IP or DNS name |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Contents of the private key (PEM) for that host |
| `EC2_APP_DIR` | Optional; defaults to `~/travel-assistance-os` |

Create a **dedicated deploy key pair** for CI rather than reusing your
personal key: `ssh-keygen -t ed25519 -f deploy_key`, append `deploy_key.pub`
to `~/.ssh/authorized_keys` on EC2, and paste `deploy_key` into the
`EC2_SSH_KEY` secret. Never commit private keys, `.env`, AWS credentials, AI
API keys or database passwords.

---

## 4. Manual deployment fallback

Manual deployment must always remain possible (do not depend on GitHub
Actions in an emergency):

```bash
ssh -i taap-demo.pem ubuntu@<EC2_PUBLIC_IP>
cd ~/travel-assistance-os
git pull
docker compose build
docker compose up -d
# migrations run automatically in the app entrypoint; to run them explicitly:
docker compose exec app node /opt/prisma/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma
curl -s http://localhost/api/health
```

Or simply: `./scripts/deploy.sh ~/travel-assistance-os`

---

## 5. Rollback procedure

```bash
ssh ubuntu@<EC2_PUBLIC_IP>
cd ~/travel-assistance-os
git log --oneline -5                  # find the last good commit
git checkout <last-good-commit>
docker compose build && docker compose up -d
curl -s http://localhost/api/health
```

Notes:
- Database data lives on the `taap_pgdata` volume and survives rollbacks,
  rebuilds and container removal. Only `docker volume rm` deletes it.
- Migrations are additive in this project; if a bad migration must be undone,
  restore from a backup: `docker compose exec db pg_dump -U taap taap > backup.sql`
  (run regularly via cron for real deployments).
- Return to the tip afterwards with `git checkout main && git pull`.

## 6. Operations quick reference

```bash
docker compose ps                     # stack status (all should be healthy)
docker compose logs -f app            # application logs
docker compose logs -f nginx db       # proxy / database logs
docker compose restart app            # restart just the app
docker compose down                   # stop stack (volumes/data preserved)
docker compose exec db psql -U taap taap   # database console
```
