output "app_url" {
  description = "Public URL of the platform (allow ~5 minutes on first boot for the Docker build)."
  value       = "http://${aws_eip.app.public_ip}"
}

output "public_ip" {
  description = "Elastic IP of the instance."
  value       = aws_eip.app.public_ip
}

output "instance_id" {
  description = "EC2 instance ID."
  value       = aws_instance.app.id
}

output "ssh_command" {
  description = "SSH command (when a key pair was configured)."
  value = var.ssh_public_key != "" ? (
    "ssh -i <your-private-key> ubuntu@${aws_eip.app.public_ip}"
  ) : "No SSH key configured — use: aws ssm start-session --target ${aws_instance.app.id} --region ${var.aws_region}"
}

output "bootstrap_log_hint" {
  description = "Where to watch the first-boot provisioning."
  value       = "sudo tail -f /var/log/taap-bootstrap.log"
}

output "github_actions_secrets" {
  description = "Values for the repository's GitHub Actions secrets (see DEPLOYMENT.md §3)."
  value = {
    EC2_HOST    = aws_eip.app.public_ip
    EC2_USER    = "ubuntu"
    EC2_APP_DIR = "/home/ubuntu/travel-assistance-os"
    EC2_SSH_KEY = "<contents of the private key matching var.ssh_public_key>"
  }
}
