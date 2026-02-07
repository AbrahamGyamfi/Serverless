output "sns_topic_arn" {
  description = "SNS Topic ARN for notifications"
  value       = aws_sns_topic.task_notifications.arn
}

output "sns_topic_name" {
  description = "SNS Topic name"
  value       = aws_sns_topic.task_notifications.name
}

output "ses_identity" {
  description = "SES email identity"
  value       = aws_ses_email_identity.notification_sender.email
}
