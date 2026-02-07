# Cognito User Pool
resource "aws_cognito_user_pool" "main" {
  name = var.user_pool_name

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  auto_verified_attributes = ["email"]
  
  username_attributes = ["email"]

  verification_message_template {
    default_email_option  = "CONFIRM_WITH_CODE"
    email_subject         = "Your verification code"
    email_message         = "Your verification code is {####}"
    email_subject_by_link = "Your verification link"
    email_message_by_link = "Please click the link below to verify your email address. {##Verify Email##}"
  }

  schema {
    attribute_data_type = "String"
    name               = "email"
    required           = true
    mutable            = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  schema {
    attribute_data_type = "String"
    name               = "role"
    required           = false
    mutable            = true

    string_attribute_constraints {
      min_length = 1
      max_length = 20
    }
  }

  lambda_config {
    pre_sign_up       = var.pre_signup_lambda_arn
    post_confirmation = var.post_confirmation_lambda_arn
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  user_pool_add_ons {
    advanced_security_mode = "ENFORCED"
  }

  tags = var.common_tags
}

# Cognito User Groups
resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Admin users with full system access"
  precedence   = 1
}

resource "aws_cognito_user_group" "member" {
  name         = "member"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Regular members with limited access"
  precedence   = 2
}

# Cognito User Pool Client
resource "aws_cognito_user_pool_client" "main" {
  name         = "${var.user_pool_name}-client"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false
  
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_PASSWORD_AUTH"
  ]

  refresh_token_validity = 30
  access_token_validity  = 60
  id_token_validity      = 60

  token_validity_units {
    refresh_token = "days"
    access_token  = "minutes"
    id_token      = "minutes"
  }

  supported_identity_providers = ["COGNITO"]

  prevent_user_existence_errors = "ENABLED"

  read_attributes = [
    "email",
    "email_verified",
    "custom:role"
  ]

  write_attributes = [
    "email"
  ]
}

# Lambda Permission for Cognito - Pre-signup
resource "aws_lambda_permission" "cognito_invoke_pre_signup" {
  statement_id  = "AllowCognitoInvokePreSignup"
  action        = "lambda:InvokeFunction"
  function_name = var.pre_signup_lambda_function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}

# Lambda Permission for Cognito - Post-confirmation
resource "aws_lambda_permission" "cognito_invoke_post_confirmation" {
  statement_id  = "AllowCognitoInvokePostConfirmation"
  action        = "lambda:InvokeFunction"
  function_name = var.post_confirmation_lambda_function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}
