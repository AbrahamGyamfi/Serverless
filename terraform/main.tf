terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
  required_version = ">= 1.0"
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = var.project_name
      ManagedBy   = "Terraform"
    }
  }
}

# Local variables
locals {
  common_tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# Database Module - DynamoDB Tables
module "database" {
  source = "./modules/database"

  tasks_table_name               = "tasks"
  users_table_name               = "users"
  enable_point_in_time_recovery  = true

  tags = merge(local.common_tags, {
    Module = "database"
  })
}

# Notifications Module - SES and SNS
module "notifications" {
  source = "./modules/notifications"

  project_name       = var.project_name
  ses_source_email   = var.ses_source_email
  
  tags = local.common_tags
}

# Compute Module - Lambda Functions
module "compute" {
  source = "./modules/compute"

  project_name       = var.project_name
  environment        = var.environment
  tasks_table_name   = module.database.tasks_table_name
  users_table_name   = module.database.users_table_name
  tasks_table_arn    = module.database.tasks_table_arn
  users_table_arn    = module.database.users_table_arn
  sns_topic_arn      = module.notifications.sns_topic_arn
  ses_source_email   = var.ses_source_email
  log_retention_days = 14
}

# Auth Module - Cognito User Pool
module "auth" {
  source = "./modules/auth"

  user_pool_name                          = "${var.project_name}-user-pool"
  pre_signup_lambda_arn                   = module.compute.pre_signup_lambda_arn
  pre_signup_lambda_function_name         = module.compute.pre_signup_lambda_name
  post_confirmation_lambda_arn            = module.compute.post_confirmation_lambda_arn
  post_confirmation_lambda_function_name  = module.compute.post_confirmation_lambda_name
  common_tags                             = local.common_tags
}

# API Gateway Module
module "api" {
  source = "./modules/api"

  project_name               = var.project_name
  environment                = var.environment
  cognito_user_pool_arn      = module.auth.user_pool_arn
  
  # Task microservices Lambda functions
  get_tasks_lambda_invoke_arn    = module.compute.get_tasks_lambda_invoke_arn
  get_tasks_lambda_name          = module.compute.get_tasks_lambda_name
  create_task_lambda_invoke_arn  = module.compute.create_task_lambda_invoke_arn
  create_task_lambda_name        = module.compute.create_task_lambda_name
  update_task_lambda_invoke_arn  = module.compute.update_task_lambda_invoke_arn
  update_task_lambda_name        = module.compute.update_task_lambda_name
  delete_task_lambda_invoke_arn  = module.compute.delete_task_lambda_invoke_arn
  delete_task_lambda_name        = module.compute.delete_task_lambda_name
  user_management_lambda_invoke_arn = module.compute.user_management_lambda_invoke_arn
  user_management_lambda_name       = module.compute.user_management_lambda_name
  
  stage_name                 = "prod"
  log_retention_days         = 14
  aws_region                 = var.aws_region
}

# Frontend Module - AWS Amplify
module "frontend" {
  source = "./modules/frontend"

  project_name            = var.project_name
  environment             = var.environment
  aws_region              = var.aws_region
  cognito_user_pool_id    = module.auth.user_pool_id
  cognito_client_id       = module.auth.user_pool_client_id
  api_url                 = module.api.api_endpoint
  github_repository       = var.github_repository
  github_token            = var.github_token
  github_branch           = var.github_branch
  
  tags = local.common_tags
}