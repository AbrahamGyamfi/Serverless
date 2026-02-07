variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "cognito_user_pool_arn" {
  description = "Cognito User Pool ARN"
  type        = string
}

# Task microservices Lambda variables
variable "get_tasks_lambda_invoke_arn" {
  description = "Get Tasks Lambda function invoke ARN"
  type        = string
}

variable "get_tasks_lambda_name" {
  description = "Get Tasks Lambda function name"
  type        = string
}

variable "create_task_lambda_invoke_arn" {
  description = "Create Task Lambda function invoke ARN"
  type        = string
}

variable "create_task_lambda_name" {
  description = "Create Task Lambda function name"
  type        = string
}

variable "update_task_lambda_invoke_arn" {
  description = "Update Task Lambda function invoke ARN"
  type        = string
}

variable "update_task_lambda_name" {
  description = "Update Task Lambda function name"
  type        = string
}

variable "delete_task_lambda_invoke_arn" {
  description = "Delete Task Lambda function invoke ARN"
  type        = string
}

variable "delete_task_lambda_name" {
  description = "Delete Task Lambda function name"
  type        = string
}

variable "user_management_lambda_invoke_arn" {
  description = "User Management Lambda function invoke ARN"
  type        = string
}

variable "user_management_lambda_name" {
  description = "User Management Lambda function name"
  type        = string
}

# Legacy variable - kept for backward compatibility
variable "lambda_invoke_arn" {
  description = "Lambda function invoke ARN (legacy)"
  type        = string
  default     = ""
}

variable "lambda_function_name" {
  description = "Lambda function name (legacy)"
  type        = string
  default     = ""
}

variable "stage_name" {
  description = "API Gateway stage name"
  type        = string
  default     = "prod"
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 14
}
