variable "tasks_table_name" {
  description = "Name of the tasks DynamoDB table"
  type        = string
  default     = "tasks"
}

variable "users_table_name" {
  description = "Name of the users DynamoDB table"
  type        = string
  default     = "users"
}

variable "enable_point_in_time_recovery" {
  description = "Enable point-in-time recovery for DynamoDB tables"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default     = {}
}
