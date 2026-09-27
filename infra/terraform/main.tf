# ---------------------------------------------------------------------------
# Travel Assistance AI Platform — single-EC2 demo infrastructure.
#
#   Internet → EIP → EC2 (Docker: nginx → app → postgres, named volumes)
#
# The instance bootstraps itself via cloud-init (user_data.sh.tftpl):
# installs Docker, clones the repo, generates a random DB password locally
# (secrets never pass through Terraform state or instance metadata) and
# starts the compose stack. See infra/terraform/README.md.
# ---------------------------------------------------------------------------

# --- Networking: one small public VPC ---------------------------------------

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.project_name}-vpc" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = { Name = "${var.project_name}-igw" }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.vpc_cidr
  map_public_ip_on_launch = true

  tags = { Name = "${var.project_name}-public" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = { Name = "${var.project_name}-public-rt" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# --- Security group ----------------------------------------------------------

resource "aws_security_group" "app" {
  name        = "${var.project_name}-app"
  description = "Travel Assistance AI Platform demo host"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  dynamic "ingress" {
    for_each = var.enable_https_port ? [1] : []
    content {
      description = "HTTPS"
      from_port   = 443
      to_port     = 443
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
    }
  }

  dynamic "ingress" {
    for_each = var.ssh_public_key != "" ? [1] : []
    content {
      description = "SSH (restricted)"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = [var.allowed_ssh_cidr]
    }
  }

  egress {
    description = "All outbound (apt, Docker Hub, git)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-app-sg" }
}

# --- AMI: Ubuntu 24.04 LTS via Canonical's public SSM parameter --------------

data "aws_ssm_parameter" "ubuntu_ami" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
}

# --- SSH key pair (optional — SSM Session Manager works without it) ---------

resource "aws_key_pair" "this" {
  count      = var.ssh_public_key != "" ? 1 : 0
  key_name   = "${var.project_name}-key"
  public_key = var.ssh_public_key
}

# --- IAM: allow SSM Session Manager (console shell without SSH) -------------

resource "aws_iam_role" "instance" {
  name = "${var.project_name}-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "instance" {
  name = "${var.project_name}-instance-profile"
  role = aws_iam_role.instance.name
}

# --- EC2 instance ------------------------------------------------------------

resource "aws_instance" "app" {
  ami                         = nonsensitive(data.aws_ssm_parameter.ubuntu_ami.value)
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.app.id]
  key_name                    = var.ssh_public_key != "" ? aws_key_pair.this[0].key_name : null
  iam_instance_profile        = aws_iam_instance_profile.instance.name
  user_data_replace_on_change = true

  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    repo_url    = var.repo_url
    repo_branch = var.repo_branch
    app_dir     = "/home/ubuntu/travel-assistance-os"
  })

  root_block_device {
    volume_size           = var.root_volume_gb
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  metadata_options {
    http_tokens   = "required" # IMDSv2 only
    http_endpoint = "enabled"
  }

  tags = { Name = "${var.project_name}-app" }

  lifecycle {
    # The demo database lives on this instance's Docker volumes —
    # protect against accidental replacement wiping it.
    prevent_destroy = false
    ignore_changes  = [ami] # AMI updates should be a deliberate rebuild
  }
}

# --- Elastic IP: stable address across stop/start ---------------------------

resource "aws_eip" "app" {
  domain   = "vpc"
  instance = aws_instance.app.id

  tags = { Name = "${var.project_name}-eip" }

  depends_on = [aws_internet_gateway.this]
}
