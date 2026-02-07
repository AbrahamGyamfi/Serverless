output "tasks_table_name" {
  description = "Name of the tasks table"
  value       = aws_dynamodb_table.tasks.name
}

output "tasks_table_arn" {
  description = "ARN of the tasks table"
  value       = aws_dynamodb_table.tasks.arn
}

output "users_table_name" {
  description = "Name of the users table"
  value       = aws_dynamodb_table.users.name
}

output "users_table_arn" {
  description = "ARN of the users table"
  value       = aws_dynamodb_table.users.arn
}

output "tasks_table_stream_arn" {
  description = "Stream ARN of the tasks table"
  value       = aws_dynamodb_table.tasks.stream_arn
}
