terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region              = var.aws_region
  profile             = var.aws_profile != "" ? var.aws_profile : null
  allowed_account_ids = var.allowed_account_id != "" ? [var.allowed_account_id] : null

  default_tags {
    tags = {
      Project   = var.project_name
      ManagedBy = "terraform"
      Purpose   = "itic-demo"
    }
  }
}
