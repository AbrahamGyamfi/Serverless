output "aws_region" {
  description = "AWS deployment region"
  value       = var.aws_region
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = module.auth.user_pool_id
}

output "cognito_client_id" {
  description = "Cognito User Pool Client ID"
  value       = module.auth.user_pool_client_id
}

output "api_gateway_url" {
  description = "API Gateway invoke URL"
  value       = module.api.api_endpoint
}

output "api_gateway_id" {
  description = "API Gateway REST API ID"
  value       = module.api.api_id
}

output "amplify_app_id" {
  description = "AWS Amplify App ID"
  value       = module.frontend.amplify_app_id
}

output "amplify_app_url" {
  description = "AWS Amplify App URL"
  value       = module.frontend.amplify_app_url
}

output "tasks_table_name" {
  description = "DynamoDB Tasks table name"
  value       = module.database.tasks_table_name
}

output "users_table_name" {
  description = "DynamoDB Users table name"
  value       = module.database.users_table_name
}

output "pre_signup_lambda_name" {
  description = "Pre-signup Lambda function name"
  value       = module.compute.pre_signup_lambda_name
}

output "task_management_lambda_name" {
  description = "Task management Lambda function name"
  value       = module.compute.task_management_lambda_name
}

output "sns_topic_arn" {
  description = "SNS Topic ARN for notifications"
  value       = module.notifications.sns_topic_arn
}