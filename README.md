# Serverless Task Management System

A production-grade serverless task management application built on AWS with role-based access control, email notifications, and secure authentication.

## Current Deployment

- **Region**: eu-west-1 (Ireland)
- **Cognito User Pool**: eu-west-1_NJpDdZ8tp
- **API Gateway**: hlpjm7pf97
- **API URL**: https://hlpjm7pf97.execute-api.eu-west-1.amazonaws.com/prod
- **Amplify App**: d1imuhf02uvucy
- **Frontend URL**: https://main.d1imuhf02uvucy.amplifyapp.com
- **DynamoDB Tables**: `tasks`, `users` (with EmailIndex GSI)

## Architecture

- **Frontend**: React.js hosted on AWS Amplify
- **Backend**: AWS Lambda functions with API Gateway
- **Database**: Amazon DynamoDB
- **Authentication**: AWS Cognito with email domain restrictions
- **Notifications**: Amazon SES for email alerts
- **Infrastructure**: Terraform for IaC

## Recent Updates

- ✅ Email-only authentication (removed username requirement)
- ✅ Added `/users` endpoint for member selection
- ✅ Searchable member dropdown in frontend with visual arrow indicator
- ✅ Urgent task email notifications with special formatting (🚨)
- ✅ Priority change notifications when tasks become urgent
- ✅ Admin exclusion from member assignment list
- ✅ Multi-member task assignment support
- ✅ Duplicate email prevention in assignments
- ✅ Active user validation before task assignment

## Features

### Authentication & Authorization
- AWS Cognito authentication with mandatory email verification
- Email-only login (no username required)
- Restricted signup to approved domains:
  - `@amalitech.com` → Admin role
  - `@amalitechtraining.org` → Member role
- Role-based access control enforced at API Gateway and Lambda levels

### Task Management
- **Admins**: Create, assign (to multiple members), update, and delete tasks
- **Members**: View assigned tasks, update status and add comments
- **Urgent Tasks**: Special email notifications with priority indicators (🚨)
- Real-time email notifications for:
  - Task assignments
  - Status changes
  - Priority changes to urgent
  - Member reassignments

### Security
- API Gateway protected by Cognito authorizers
- IAM roles with least privilege access
- CORS enabled for secure frontend communication

## Project Structure

```
Serverless/
├── terraform/                  # Infrastructure as Code
│   ├── main.tf                 # Root Terraform config
│   ├── variables.tf            # Terraform variables
│   ├── outputs.tf              # Resource outputs
│   ├── terraform.tfvars.example # Example configuration
│   └── modules/                # Terraform modules
│       ├── api/                # API Gateway module
│       ├── auth/               # Cognito module
│       ├── compute/            # Lambda functions module
│       ├── database/           # DynamoDB module
│       ├── frontend/           # Amplify module
│       └── notifications/      # SES & SNS module
├── lambda/                     # Backend Lambda functions
│   ├── pre-signup.js           # Email domain validation
│   ├── post-confirmation.js    # User creation & group assignment
│   ├── create-task.js          # Create tasks (admin only)
│   ├── update-task.js          # Update tasks (role-based)
│   ├── delete-task.js          # Delete tasks (admin only)
│   ├── get-tasks.js            # Get tasks (filtered by role)
│   ├── user-management.js      # Get active members list
│   ├── shared-utils.js         # Shared utilities & validation
│   └── package.json            # Lambda dependencies
├── .gitignore                  # Git ignore rules
└── README.md                   # This file
```

**Note**: Frontend code is maintained in a separate repository and deployed via AWS Amplify.

## Prerequisites

1. **AWS CLI** configured with appropriate permissions
2. **Terraform** >= 1.0
3. **Node.js** >= 18
4. **AWS Account** with sandbox access

## Deployment

### 1. Clone and Setup
```bash
git clone <repository>
cd Serverless
```

### 2. Install Lambda Dependencies
```bash
cd lambda
npm install --production
cd ..
```

### 3. Configure Terraform
```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your settings
```

### 4. Deploy Infrastructure
```bash
terraform init
terraform plan
terraform apply
```

This will:
- Create all AWS resources
- Deploy Lambda functions
- Configure API Gateway
- Setup Cognito authentication

### 5. Configure SES (Email Notifications)

Verify your sender email address:
```bash
aws ses verify-email-identity --email-address your-sender@amalitech.com --region eu-west-1
```

Update `terraform.tfvars` with your verified email:
```hcl
ses_sender_email = "your-sender@amalitech.com"
```

### 6. Deploy Frontend (Separate Repository)

Frontend is maintained in a separate repository and automatically deployed via AWS Amplify. Terraform creates the Amplify app and connects it to your repository.

### 7. Test with Admin User

Sign up with an `@amalitech.com` email address through the Amplify-hosted frontend. The user will be automatically assigned to the `admin` group.

## API Endpoints

### Authentication
All endpoints require valid Cognito JWT token in `Authorization: Bearer <token>` header.

### GET /tasks
Retrieve tasks (filtered by role)
- **Admin**: Returns all tasks
- **Member**: Returns only tasks where user is assigned

### POST /tasks (Admin Only)
Create new task with optional multiple member assignment:
```json
{
  "title": "Task Title",
  "description": "Task Description",
  "priority": "urgent",
  "dueDate": "2026-12-31",
  "assignedTo": ["member1@amalitechtraining.org", "member2@amalitechtraining.org"],
  "tags": ["backend", "api"]
}
```

### PUT /tasks
Update existing task:
- **Admin**: Can update all fields
- **Member**: Can only update status and add comments

```json
{
  "taskId": "uuid",
  "status": "in-progress",
  "comment": "Working on this now"
}
```

### DELETE /tasks/{taskId} (Admin Only)
Delete a task by ID

### GET /users (Admin Only)
Get list of active members for task assignment

## User Roles

### Admin (`@amalitech.com` emails)
- Create, assign, update, and delete tasks
- Assign tasks to multiple members
- View all tasks in the system
- Update all task fields (title, description, priority, due date, status, assignees)
- Access member list via `/users` endpoint
- Cannot be assigned to tasks (admins manage, members execute)

### Member (`@amalitechtraining.org` emails)
- View only tasks where they are assigned
- Update task status
- Add comments to tasks
- Receive email notifications for:
  - New task assignments
  - Task status changes
  - Urgent task assignments (with special formatting)
  - Being removed from tasks

## Security Features

1. **Email Domain Validation**: Pre-signup Lambda blocks non-approved domains
2. **Email Verification**: Mandatory email verification before access
3. **JWT Authentication**: All API endpoints protected by Cognito authorizer
4. **Role-Based Authorization**: Function-level permission checks in every Lambda
5. **Active User Validation**: Cannot assign tasks to inactive/deactivated users
6. **Duplicate Prevention**: Email deduplication in task assignments
7. **Admin Exclusion**: Admins cannot be assigned to tasks (separation of duties)
8. **CORS Protection**: Configured for secure frontend access
9. **IAM Least Privilege**: Scoped permissions per service

## Monitoring & Logging

- CloudWatch Logs for Lambda functions
- API Gateway access logs
- DynamoDB metrics
- Cognito authentication events

## Cost Optimization

- DynamoDB Pay-per-Request billing
- Lambda cold start optimization
- API Gateway caching (configurable)
- Amplify hosting with CDN

## Troubleshooting

### Common Issues

1. **Email Domain Rejected During Signup**:
   - Ensure email ends with `@amalitech.com`, or `@amalitechtraining.org`
   - Check pre-signup Lambda logs: `/aws/lambda/task-management-pre-signup`

2. **API Returns 401 Unauthorized**:
   - Verify email is verified in Cognito (check inbox for verification link)
   - Check API Gateway authorizer is pointing to correct User Pool
   - Ensure `Authorization: Bearer <token>` header is present
   - Token may have expired (15-60 min default) - sign out and back in

3. **API Returns 403 Forbidden**:
   - Admin-only endpoint accessed by member (e.g., POST /tasks, DELETE /tasks)
   - Check CloudWatch logs for specific permission error

4. **Email Notifications Not Sent**:
   - Verify SES sender email is verified (check AWS SES console)
   - SES may be in sandbox mode (only verified emails can receive)
   - Check Lambda execution logs for SES errors
   - Ensure Lambda has `ses:SendEmail` permission

5. **"Cannot assign tasks to admins" Error**:
   - This is expected - admins manage tasks, only members can be assigned
   - Use `/users` endpoint to get valid member list

6. **Member Dropdown Shows No Users**:
   - Ensure at least one non-admin user has verified their email
   - Check `/users` endpoint returns active members
   - Verify `user-management` Lambda has DynamoDB read permissions

### Logs Location
```bash
# Lambda logs (check specific function)
aws logs tail /aws/lambda/task-management-create-task --follow --region eu-west-1
aws logs tail /aws/lambda/task-management-update-task --follow --region eu-west-1
aws logs tail /aws/lambda/task-management-get-tasks --follow --region eu-west-1

# API Gateway logs
aws logs tail /aws/apigateway/task-management --follow --region eu-west-1
```

## Cleanup

To destroy all resources:
```bash
cd terraform
terraform destroy -auto-approve
```

## Lambda Functions Reference

| Function | Trigger | Purpose | Access Level |
|----------|---------|---------|--------------|
| `pre-signup.js` | Cognito Pre-signup | Validates email domain before user creation | Public |
| `post-confirmation.js` | Cognito Post-confirmation | Creates DynamoDB user record & assigns Cognito group | Public |
| `create-task.js` | POST /tasks | Creates new task with member assignment | Admin only |
| `update-task.js` | PUT /tasks | Updates task (all fields for admin, status/comments for members) | Role-based |
| `delete-task.js` | DELETE /tasks/{taskId} | Deletes task by ID | Admin only |
| `get-tasks.js` | GET /tasks | Retrieves tasks (all for admin, assigned only for members) | Authenticated |
| `user-management.js` | GET /users | Returns list of active members | Admin only |
| `shared-utils.js` | N/A (imported) | Shared validation, auth checks, email sending utilities | N/A |

## Contributing

1. Update Lambda code in `lambda/` directory
2. For infrastructure changes, update Terraform modules in `terraform/modules/`
3. Run `terraform plan` before `terraform apply` to review changes
4. Test with both admin and member roles before deploying
5. Check CloudWatch logs after deployment
6. Frontend changes should be made in the separate frontend repository

## Development Workflow

1. Make Lambda changes locally in `lambda/`
2. Deploy with Terraform:
   ```bash
   cd terraform
   terraform apply -auto-approve
   ```
3. Test via API Gateway URL or frontend
4. Monitor CloudWatch logs for errors
5. Commit and push changes

## License

This project is for educational purposes.