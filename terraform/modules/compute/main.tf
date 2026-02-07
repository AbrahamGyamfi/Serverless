# IAM Role for Lambda Execution
resource "aws_iam_role" "lambda_execution" {
  name = "${var.project_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# IAM Policy for Lambda
resource "aws_iam_role_policy" "lambda_policy" {
  name = "${var.project_name}-lambda-policy"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          var.tasks_table_arn,
          var.users_table_arn,
          "${var.tasks_table_arn}/index/*",
          "${var.users_table_arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = var.sns_topic_arn
      },
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminAddUserToGroup",
          "cognito-idp:AdminRemoveUserFromGroup",
          "cognito-idp:AdminListGroupsForUser",
          "cognito-idp:ListUsers",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminDisableUser"
        ]
        Resource = "arn:aws:cognito-idp:*:*:userpool/${var.user_pool_id}"
      }
    ]
  })
}

##############################################
# Cognito Trigger Lambda Functions
##############################################

# Pre-Signup Lambda Function
data "archive_file" "pre_signup_zip" {
  type        = "zip"
  source_file = "${path.module}/../../../lambda/pre-signup.js"
  output_path = "${path.module}/../../../lambda/build/pre-signup.zip"
}

resource "aws_lambda_function" "pre_signup" {
  filename         = data.archive_file.pre_signup_zip.output_path
  function_name    = "${var.project_name}-pre-signup"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "pre-signup.handler"
  runtime         = "nodejs18.x"
  source_code_hash = data.archive_file.pre_signup_zip.output_base64sha256
  timeout         = 10
  memory_size     = 128

  environment {
    variables = {
      ENVIRONMENT = var.environment
    }
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# Post-Confirmation Lambda Function
data "archive_file" "post_confirmation_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda"
  output_path = "${path.module}/../../../lambda/build/post-confirmation.zip"
  excludes    = [
    "*.zip",
    "build/*",
    "pre-signup.js",
    "get-tasks.js",
    "create-task.js",
    "update-task.js",
    "delete-task.js",
    "user-management.js",
    "task-management.js",
    "*.md",
    "*.sh"
  ]
}

resource "aws_lambda_function" "post_confirmation" {
  filename         = data.archive_file.post_confirmation_zip.output_path
  function_name    = "${var.project_name}-post-confirmation"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "post-confirmation.handler"
  runtime         = "nodejs18.x"
  source_code_hash = data.archive_file.post_confirmation_zip.output_base64sha256
  timeout         = 10
  memory_size     = 128

  environment {
    variables = {
      ENVIRONMENT   = var.environment
      USERS_TABLE   = var.users_table_name
    }
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

##############################################
# Task Management Microservices
##############################################

# Get Tasks Lambda Function
data "archive_file" "get_tasks_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda"
  output_path = "${path.module}/../../../lambda/build/get-tasks.zip"
  excludes    = [
    "*.zip",
    "build/*",
    "pre-signup.js",
    "post-confirmation.js",
    "create-task.js",
    "update-task.js",
    "delete-task.js",
    "user-management.js",
    "task-management.js",
    "*.md",
    "*.sh"
  ]
}

resource "aws_lambda_function" "get_tasks" {
  filename         = data.archive_file.get_tasks_zip.output_path
  function_name    = "${var.project_name}-get-tasks"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "get-tasks.handler"
  runtime         = "nodejs18.x"
  source_code_hash = data.archive_file.get_tasks_zip.output_base64sha256
  timeout         = 30
  memory_size     = 256

  environment {
    variables = {
      TASKS_TABLE      = var.tasks_table_name
      USERS_TABLE      = var.users_table_name
      ENVIRONMENT      = var.environment
      SES_SOURCE_EMAIL = var.ses_source_email
      SNS_TOPIC_ARN    = var.sns_topic_arn
    }
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# Create Task Lambda Function
data "archive_file" "create_task_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda"
  output_path = "${path.module}/../../../lambda/build/create-task.zip"
  excludes    = [
    "*.zip",
    "build/*",
    "pre-signup.js",
    "post-confirmation.js",
    "get-tasks.js",
    "update-task.js",
    "delete-task.js",
    "user-management.js",
    "task-management.js",
    "*.md",
    "*.sh"
  ]
}

resource "aws_lambda_function" "create_task" {
  filename         = data.archive_file.create_task_zip.output_path
  function_name    = "${var.project_name}-create-task"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "create-task.handler"
  runtime         = "nodejs18.x"
  source_code_hash = data.archive_file.create_task_zip.output_base64sha256
  timeout         = 30
  memory_size     = 256

  environment {
    variables = {
      TASKS_TABLE      = var.tasks_table_name
      USERS_TABLE      = var.users_table_name
      ENVIRONMENT      = var.environment
      SES_SOURCE_EMAIL = var.ses_source_email
      SNS_TOPIC_ARN    = var.sns_topic_arn
    }
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# Update Task Lambda Function
data "archive_file" "update_task_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda"
  output_path = "${path.module}/../../../lambda/build/update-task.zip"
  excludes    = [
    "*.zip",
    "build/*",
    "pre-signup.js",
    "post-confirmation.js",
    "get-tasks.js",
    "create-task.js",
    "delete-task.js",
    "user-management.js",
    "task-management.js",
    "*.md",
    "*.sh"
  ]
}

resource "aws_lambda_function" "update_task" {
  filename         = data.archive_file.update_task_zip.output_path
  function_name    = "${var.project_name}-update-task"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "update-task.handler"
  runtime         = "nodejs18.x"
  source_code_hash = data.archive_file.update_task_zip.output_base64sha256
  timeout         = 30
  memory_size     = 256

  environment {
    variables = {
      TASKS_TABLE      = var.tasks_table_name
      USERS_TABLE      = var.users_table_name
      ENVIRONMENT      = var.environment
      SES_SOURCE_EMAIL = var.ses_source_email
      SNS_TOPIC_ARN    = var.sns_topic_arn
    }
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# Delete Task Lambda Function
data "archive_file" "delete_task_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda"
  output_path = "${path.module}/../../../lambda/build/delete-task.zip"
  excludes    = [
    "*.zip",
    "build/*",
    "pre-signup.js",
    "post-confirmation.js",
    "get-tasks.js",
    "create-task.js",
    "update-task.js",
    "user-management.js",
    "task-management.js",
    "*.md",
    "*.sh"
  ]
}

resource "aws_lambda_function" "delete_task" {
  filename         = data.archive_file.delete_task_zip.output_path
  function_name    = "${var.project_name}-delete-task"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "delete-task.handler"
  runtime         = "nodejs18.x"
  source_code_hash = data.archive_file.delete_task_zip.output_base64sha256
  timeout         = 30
  memory_size     = 256

  environment {
    variables = {
      TASKS_TABLE      = var.tasks_table_name
      USERS_TABLE      = var.users_table_name
      ENVIRONMENT      = var.environment
      SES_SOURCE_EMAIL = var.ses_source_email
      SNS_TOPIC_ARN    = var.sns_topic_arn
    }
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

##############################################
# User Management Lambda Function
##############################################

data "archive_file" "user_management_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda"
  output_path = "${path.module}/../../../lambda/build/user-management.zip"
  excludes    = [
    "*.zip",
    "build/*",
    "pre-signup.js",
    "post-confirmation.js",
    "get-tasks.js",
    "create-task.js",
    "update-task.js",
    "delete-task.js",
    "task-management.js",
    "*.md",
    "*.sh"
  ]
}

resource "aws_lambda_function" "user_management" {
  filename         = data.archive_file.user_management_zip.output_path
  function_name    = "${var.project_name}-user-management"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "user-management.handler"
  runtime         = "nodejs18.x"
  source_code_hash = data.archive_file.user_management_zip.output_base64sha256
  timeout         = 30
  memory_size     = 256

  environment {
    variables = {
      TASKS_TABLE      = var.tasks_table_name
      USERS_TABLE      = var.users_table_name
      ENVIRONMENT      = var.environment
      USER_POOL_ID     = var.user_pool_id
    }
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

##############################################
# CloudWatch Log Groups
##############################################

resource "aws_cloudwatch_log_group" "pre_signup" {
  name              = "/aws/lambda/${aws_lambda_function.pre_signup.function_name}"
  retention_in_days = var.log_retention_days

  lifecycle {
    ignore_changes = [name]
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_cloudwatch_log_group" "post_confirmation" {
  name              = "/aws/lambda/${aws_lambda_function.post_confirmation.function_name}"
  retention_in_days = var.log_retention_days

  lifecycle {
    ignore_changes = [name]
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_cloudwatch_log_group" "get_tasks" {
  name              = "/aws/lambda/${aws_lambda_function.get_tasks.function_name}"
  retention_in_days = var.log_retention_days

  lifecycle {
    ignore_changes = [name]
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_cloudwatch_log_group" "create_task" {
  name              = "/aws/lambda/${aws_lambda_function.create_task.function_name}"
  retention_in_days = var.log_retention_days

  lifecycle {
    ignore_changes = [name]
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_cloudwatch_log_group" "update_task" {
  name              = "/aws/lambda/${aws_lambda_function.update_task.function_name}"
  retention_in_days = var.log_retention_days

  lifecycle {
    ignore_changes = [name]
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_cloudwatch_log_group" "delete_task" {
  name              = "/aws/lambda/${aws_lambda_function.delete_task.function_name}"
  retention_in_days = var.log_retention_days

  lifecycle {
    ignore_changes = [name]
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_cloudwatch_log_group" "user_management" {
  name              = "/aws/lambda/${aws_lambda_function.user_management.function_name}"
  retention_in_days = var.log_retention_days

  lifecycle {
    ignore_changes = [name]
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}
