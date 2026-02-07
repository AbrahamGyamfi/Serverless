variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "tasks_table_name" {
  description = "Tasks DynamoDB table name"
  type        = string
}

variable "tasks_table_arn" {
  description = "Tasks DynamoDB table ARN"
  type        = string
}

variable "users_table_name" {
  description = "Users DynamoDB table name"
  type        = string
}

variable "users_table_arn" {
  description = "Users DynamoDB table ARN"
  type        = string
}

variable "ses_source_email" {
  description = "Email address to send SES notifications from"
  type        = string
}

variable "sns_topic_arn" {
  description = "SNS topic ARN for notifications"
  type        = string
}

variable "user_pool_id" {
  description = "Cognito User Pool ID for IAM permissions and user management. Use '*' for wildcard access."
  type        = string
  default     = "*"
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 14
}
