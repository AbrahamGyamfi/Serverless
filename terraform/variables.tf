variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "eu-west-1"
}

variable "environment" {
  description = "Environment name (e.g., production, staging, development)"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Project name for resource naming and tagging"
  type        = string
  default     = "task-management"
}

variable "ses_source_email" {
  description = "Email address to send SES notifications from (must be verified in SES)"
  type        = string
  default     = "noreply@yourdomain.com"
}

variable "github_repository" {
  description = "GitHub repository URL for Amplify deployment (e.g., https://github.com/username/repo)"
  type        = string
  default     = ""
}

variable "github_token" {
  description = "GitHub personal access token for Amplify (with repo access)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "github_branch" {
  description = "GitHub branch to deploy (e.g., main, master)"
  type        = string
  default     = "main"
}