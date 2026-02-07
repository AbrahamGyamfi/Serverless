# DynamoDB Table: Tasks
resource "aws_dynamodb_table" "tasks" {
  name           = var.tasks_table_name
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "taskId"

  attribute {
    name = "taskId"
    type = "S"
  }

  attribute {
    name = "assignedTo"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  global_secondary_index {
    name            = "AssignedToIndex"
    hash_key        = "assignedTo"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "StatusIndex"
    hash_key        = "status"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(
    var.tags,
    {
      Name = var.tasks_table_name
    }
  )
}

# DynamoDB Table: Users
resource "aws_dynamodb_table" "users" {
  name           = var.users_table_name
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "email"
    type = "S"
  }

  global_secondary_index {
    name            = "EmailIndex"
    hash_key        = "email"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(
    var.tags,
    {
      Name = var.users_table_name
    }
  )
}
