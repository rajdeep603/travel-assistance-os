variable "project_name" {
  description = "Name prefix for all resources."
  type        = string
  default     = "taap"
}

variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "eu-central-1"
}

variable "instance_type" {
  description = "EC2 instance type. t3.small (2 GB) is the minimum for the Docker build; t3.medium builds faster."
  type        = string
  default     = "t3.small"
}

variable "root_volume_gb" {
  description = "Root EBS volume size in GB."
  type        = number
  default     = 20
}

variable "ssh_public_key" {
  description = "SSH public key material for the EC2 key pair (contents of e.g. ~/.ssh/taap-demo.pub). Leave empty to create no key pair and use SSM Session Manager only."
  type        = string
  default     = ""
}

variable "allowed_ssh_cidr" {
  description = "CIDR allowed to SSH (port 22). Use your own IP, e.g. 203.0.113.7/32. Ignored when ssh_public_key is empty."
  type        = string
  default     = ""

  validation {
    condition     = var.ssh_public_key == "" || can(cidrhost(var.allowed_ssh_cidr, 0))
    error_message = "Set allowed_ssh_cidr to a valid CIDR (e.g. 203.0.113.7/32) when ssh_public_key is provided."
  }
}

variable "repo_url" {
  description = "Git URL of this repository, cloned by the instance on first boot. Must be reachable from the instance (public repo, or a URL embedding a read-only token)."
  type        = string
}

variable "repo_branch" {
  description = "Branch to deploy."
  type        = string
  default     = "main"
}

variable "enable_https_port" {
  description = "Also open port 443 (for when you configure TLS in nginx)."
  type        = bool
  default     = false
}

variable "vpc_cidr" {
  description = "CIDR for the demo VPC."
  type        = string
  default     = "10.42.0.0/24"
}
