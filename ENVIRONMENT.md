# Environment Configuration

Copy `.env.example` to `.env` and adjust. **Never commit `.env`** (it is
git-ignored) and never put secrets in source code or Docker images.

## Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes (dev) | dev compose URL | Prisma connection string. In the production compose stack it is assembled automatically from the `POSTGRES_*` values and points at the `db` service. |
| `AI_API_KEY` | no | empty | Anthropic API key. Empty → the deterministic demo AI provider runs everything offline. Set → live Claude API with automatic fallback to the demo provider on failure. |
| `AI_MODEL` | no | `claude-haiku-4-5` | Claude model used when `AI_API_KEY` is set. |
| `NEXT_PUBLIC_APP_URL` | no | `http://localhost:3000` | Public base URL (links, health reporting). |
| `UPLOAD_DIR` | no | `./uploads` | Where uploaded documents are stored. In Docker this is the `taap_uploads` volume at `/app/uploads`. |
| `MAX_UPLOAD_MB` | no | `10` | Upload size limit (nginx also caps request bodies at 15 MB). |
| `POSTGRES_USER` | prod compose | `taap` | Database user for the production container. |
| `POSTGRES_PASSWORD` | **prod compose** | — | Database password. The stack refuses to start with the placeholder value. |
| `POSTGRES_DB` | prod compose | `taap` | Database name. |
| `AUTO_SEED` | no | `true` | Production container runs the idempotent demo seed on start. Set `false` once demo data should stop being re-asserted. |
| `HTTP_PORT` | no | `80` | Host port nginx binds to. |
| `E2E_BASE_URL` | tests only | `http://localhost:3000` | Target for `npm run test:e2e`. |

## Environments

| | Development | Production (EC2) | CI (GitHub Actions) |
|---|---|---|---|
| Database | `docker-compose.dev.yml` (host port **5434**) | `db` container, named volume, no host port | service container |
| App | `npm run dev` on :3000 | Docker image behind nginx :80 | built, not served |
| AI | demo provider (or your key) | demo provider unless `AI_API_KEY` set | demo provider |
| Seed | `npm run db:seed` (idempotent) | automatic via `AUTO_SEED=true` | seeded before tests |

A staging environment is a second EC2 host (or compose project) with its own
`.env`; nothing in the code distinguishes staging from production.

## Secret hygiene checklist

- `.env`, `*.pem`, private SSH keys: git-ignored, never committed
- GitHub Actions credentials live only in repository **Secrets** (`EC2_HOST`,
  `EC2_USER`, `EC2_SSH_KEY`)
- The Docker image contains no secrets — everything arrives via environment
  at runtime (`.dockerignore` excludes `.env`)
- Rotate `POSTGRES_PASSWORD` and any AI key if a laptop or instance is
  compromised; both are changed in `.env` + `docker compose up -d`
