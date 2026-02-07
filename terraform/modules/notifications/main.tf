# SES Email Identity
resource "aws_ses_email_identity" "notification_sender" {
  email = var.ses_source_email
}

# SES Configuration Set
resource "aws_ses_configuration_set" "main" {
  name = "${var.project_name}-emails"
}

# SNS Topic for Task Notifications
resource "aws_sns_topic" "task_notifications" {
  name = "${var.project_name}-notifications"

  tags = var.tags
}

# SNS Topic Policy
resource "aws_sns_topic_policy" "task_notifications" {
  arn = aws_sns_topic.task_notifications.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.task_notifications.arn
      }
    ]
  })
}
