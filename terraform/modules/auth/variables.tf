variable "user_pool_name" {
  description = "Name of the Cognito User Pool"
  type        = string
  default     = "task-management-pool"
}

variable "pre_signup_lambda_arn" {
  description = "ARN of the pre-signup Lambda function"
  type        = string
}

variable "pre_signup_lambda_function_name" {
  description = "Function name of the pre-signup Lambda"
  type        = string
}

variable "post_confirmation_lambda_arn" {
  description = "ARN of the post-confirmation Lambda function"
  type        = string
}

variable "post_confirmation_lambda_function_name" {
  description = "Function name of the post-confirmation Lambda"
  type        = string
}

variable "common_tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default     = {}
}
