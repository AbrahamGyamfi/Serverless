variable "project_name" {
  description = "Project name"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "github_repository" {
  description = "GitHub repository URL"
  type        = string
  default     = ""
}

variable "github_token" {
  description = "GitHub personal access token"
  type        = string
  sensitive   = true
  default     = ""
}

variable "github_branch" {
  description = "GitHub branch to deploy"
  type        = string
  default     = "main"
}

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  type        = string
}

variable "cognito_client_id" {
  description = "Cognito Client ID"
  type        = string
}

variable "api_url" {
  description = "API Gateway URL"
  type        = string
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}
