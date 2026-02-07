# IAM Role for Amplify
resource "aws_iam_role" "amplify" {
  name = "${var.project_name}-amplify-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "amplify.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-amplify-role"
    }
  )
}

resource "aws_iam_role_policy_attachment" "amplify_backend_deployment" {
  role       = aws_iam_role.amplify.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess-Amplify"
}

# AWS Amplify App
resource "aws_amplify_app" "main" {
  name       = "${var.project_name}-frontend"
  repository = var.github_repository != "" ? var.github_repository : null

  # Build settings for monorepo with frontend subdirectory
  build_spec = <<-EOT
    version: 1
    applications:
      - appRoot: frontend
        frontend:
          phases:
            preBuild:
              commands:
                - npm ci
            build:
              commands:
                - npm run build
          artifacts:
            baseDirectory: build
            files:
              - '**/*'
          cache:
            paths:
              - node_modules/**/*
  EOT

  # Environment variables
  environment_variables = {
    REACT_APP_REGION       = var.aws_region
    REACT_APP_USER_POOL_ID = var.cognito_user_pool_id
    REACT_APP_CLIENT_ID    = var.cognito_client_id
    REACT_APP_API_URL      = var.api_url
  }

  # Enable auto branch creation
  enable_auto_branch_creation = false
  enable_branch_auto_build    = true
  enable_branch_auto_deletion = false

  # OAuth token for GitHub (if using GitHub)
  access_token = var.github_token != "" ? var.github_token : null

  # IAM role
  iam_service_role_arn = aws_iam_role.amplify.arn

  # Custom rules for SPA routing
  custom_rule {
    source = "/<*>"
    status = "404"
    target = "/index.html"
  }

  custom_rule {
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>"
    status = "200"
    target = "/index.html"
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-amplify-app"
    }
  )
}

# Amplify Branch (main/master)
resource "aws_amplify_branch" "main" {
  count = var.github_repository != "" ? 1 : 0

  app_id      = aws_amplify_app.main.id
  branch_name = var.github_branch

  enable_auto_build = true
  stage             = "PRODUCTION"

  environment_variables = {
    REACT_APP_REGION       = var.aws_region
    REACT_APP_USER_POOL_ID = var.cognito_user_pool_id
    REACT_APP_CLIENT_ID    = var.cognito_client_id
    REACT_APP_API_URL      = var.api_url
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-amplify-branch"
    }
  )
}
