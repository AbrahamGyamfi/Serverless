variable "project_name" {
  description = "Project name for naming resources"
  type        = string
}

variable "ses_source_email" {
  description = "Email address to send SES notifications from (must be verified)"
  type        = string
}

variable "tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default     = {}
}
