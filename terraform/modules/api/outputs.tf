output "api_id" {
  description = "API Gateway REST API ID"
  value       = aws_api_gateway_rest_api.main.id
}

output "api_arn" {
  description = "API Gateway REST API ARN"
  value       = aws_api_gateway_rest_api.main.arn
}

output "api_endpoint" {
  description = "API Gateway endpoint URL"
  value       = "https://${aws_api_gateway_rest_api.main.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_api_gateway_stage.prod.stage_name}"
}

output "stage_name" {
  description = "API Gateway stage name"
  value       = aws_api_gateway_stage.prod.stage_name
}

output "execution_arn" {
  description = "API Gateway execution ARN"
  value       = aws_api_gateway_rest_api.main.execution_arn
}
