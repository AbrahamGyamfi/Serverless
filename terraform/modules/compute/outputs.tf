# Cognito Trigger Lambda Outputs
output "pre_signup_lambda_arn" {
  description = "Pre-signup Lambda function ARN"
  value       = aws_lambda_function.pre_signup.arn
}

output "pre_signup_lambda_name" {
  description = "Pre-signup Lambda function name"
  value       = aws_lambda_function.pre_signup.function_name
}

output "post_confirmation_lambda_arn" {
  description = "Post-confirmation Lambda function ARN"
  value       = aws_lambda_function.post_confirmation.arn
}

output "post_confirmation_lambda_name" {
  description = "Post-confirmation Lambda function name"
  value       = aws_lambda_function.post_confirmation.function_name
}

# Task Management Microservices Outputs
output "get_tasks_lambda_arn" {
  description = "Get Tasks Lambda function ARN"
  value       = aws_lambda_function.get_tasks.arn
}

output "get_tasks_lambda_invoke_arn" {
  description = "Get Tasks Lambda function invoke ARN"
  value       = aws_lambda_function.get_tasks.invoke_arn
}

output "get_tasks_lambda_name" {
  description = "Get Tasks Lambda function name"
  value       = aws_lambda_function.get_tasks.function_name
}

output "create_task_lambda_arn" {
  description = "Create Task Lambda function ARN"
  value       = aws_lambda_function.create_task.arn
}

output "create_task_lambda_invoke_arn" {
  description = "Create Task Lambda function invoke ARN"
  value       = aws_lambda_function.create_task.invoke_arn
}

output "create_task_lambda_name" {
  description = "Create Task Lambda function name"
  value       = aws_lambda_function.create_task.function_name
}

output "update_task_lambda_arn" {
  description = "Update Task Lambda function ARN"
  value       = aws_lambda_function.update_task.arn
}

output "update_task_lambda_invoke_arn" {
  description = "Update Task Lambda function invoke ARN"
  value       = aws_lambda_function.update_task.invoke_arn
}

output "update_task_lambda_name" {
  description = "Update Task Lambda function name"
  value       = aws_lambda_function.update_task.function_name
}

output "delete_task_lambda_arn" {
  description = "Delete Task Lambda function ARN"
  value       = aws_lambda_function.delete_task.arn
}

output "delete_task_lambda_invoke_arn" {
  description = "Delete Task Lambda function invoke ARN"
  value       = aws_lambda_function.delete_task.invoke_arn
}

output "delete_task_lambda_name" {
  description = "Delete Task Lambda function name"
  value       = aws_lambda_function.delete_task.function_name
}

# User Management Lambda Outputs
output "user_management_lambda_arn" {
  description = "User Management Lambda function ARN"
  value       = aws_lambda_function.user_management.arn
}

output "user_management_lambda_invoke_arn" {
  description = "User Management Lambda function invoke ARN"
  value       = aws_lambda_function.user_management.invoke_arn
}

output "user_management_lambda_name" {
  description = "User Management Lambda function name"
  value       = aws_lambda_function.user_management.function_name
}

# Legacy output for backwards compatibility (can be removed later)
output "task_management_lambda_arn" {
  description = "[DEPRECATED] Use get_tasks_lambda_arn instead"
  value       = aws_lambda_function.get_tasks.arn
}

output "task_management_lambda_invoke_arn" {
  description = "[DEPRECATED] Use get_tasks_lambda_invoke_arn instead"
  value       = aws_lambda_function.get_tasks.invoke_arn
}

output "task_management_lambda_name" {
  description = "[DEPRECATED] Use get_tasks_lambda_name instead"
  value       = aws_lambda_function.get_tasks.function_name
}
