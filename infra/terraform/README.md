# Terraform — EC2 hosting for the Travel Assistance AI Platform

Provisions the exact architecture from [DEPLOYMENT.md](../../DEPLOYMENT.md)
as code, replacing the manual EC2 steps (§1.1–1.5):

```text
Internet → Elastic IP → EC2 (Ubuntu 24.04, Docker)
                          └─ compose stack: nginx → app → postgres
```

What you get:

- Small dedicated VPC with one public subnet (no dependency on a default VPC)
- Security group: 80 open, 22 restricted to your CIDR (only if you use SSH),
  optional 443
- Ubuntu 24.04 EC2 instance (gp3, encrypted root, IMDSv2 enforced) with an
  Elastic IP
- SSM Session Manager access (shell from the AWS console — SSH optional)
- Cloud-init bootstrap that installs Docker, clones the repo, **generates the
  database password on the instance** (it never touches Terraform state),
  builds and starts the stack, and gates on `/api/health`

## Usage

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # set repo_url (+ ssh key if wanted)
terraform init
terraform plan
terraform apply
```

First boot takes ~5 minutes (apt + Docker build). Watch it:

```bash
# with SSH configured:
ssh -i ~/.ssh/taap-demo ubuntu@$(terraform output -raw public_ip) \
  sudo tail -f /var/log/taap-bootstrap.log

# or via SSM (no SSH key needed):
aws ssm start-session --target $(terraform output -raw instance_id)
```

Then open `terraform output -raw app_url`.

## Wiring up GitHub Actions CD

`terraform output github_actions_secrets` prints the values for the
repository secrets used by `.github/workflows/deploy.yml`. Add them under
GitHub → Settings → Secrets and every push to `main` deploys itself via
`scripts/deploy.sh`.

## Notes & limits

- **State**: kept local by default. For a team, configure an S3 backend
  (`terraform { backend "s3" { … } }`) before the first apply.
- **Secrets**: Terraform never sees the DB password. To enable live AI, SSH
  in and set `AI_API_KEY` in `~/travel-assistance-os/.env`, then
  `docker compose up -d`.
- **Private repos**: the instance clones `repo_url` anonymously. For a
  private repo, use a URL with a read-only fine-grained token, or clone
  manually after boot.
- **Data**: the demo database lives in Docker named volumes on the instance's
  root EBS volume. `terraform destroy` deletes everything, including data.
- **HTTPS**: set `enable_https_port = true` and follow DEPLOYMENT.md §2
  (certbot) once you point a DNS name at the Elastic IP.
- **Costs** (eu-central-1, on-demand): ~$15/mo for t3.small + EBS + EIP.
