# Serverless Task Management System - Complete Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Authentication Flow](#authentication-flow)
4. [Task Management Flow](#task-management-flow)
5. [Database Structure](#database-structure)
6. [Lambda Functions](#lambda-functions)
7. [Security Features](#security-features)
8. [Email Notifications](#email-notifications)
9. [Frontend Components](#frontend-components)
10. [Infrastructure](#infrastructure)
11. [API Endpoints](#api-endpoints)
12. [Complete User Journey](#complete-user-journey)

---

## Project Overview

### What This Project Does

A serverless task management system where:
- **Admins** (@amalitech.com) create and assign tasks to members
- **Members** (@amalitechtraining.org) complete tasks and update status
- Everyone receives email notifications for important events
- Urgent tasks get special priority email formatting with visual indicators

### Current Live Deployment

| Resource | Value |
|----------|-------|
| **Frontend URL** | https://main.d1imuhf02uvucy.amplifyapp.com |
| **API URL** | https://hlpjm7pf97.execute-api.eu-west-1.amazonaws.com/prod |
| **Region** | eu-west-1 (Ireland) |
| **Cognito User Pool** | eu-west-1_NJpDdZ8tp |
| **Cognito Client ID** | 1flmifmtgo2p3bgrfm1g0sv450 |
| **SES Sender** | abraham.gyamfi@amalitech.com |

---

## Architecture

### High-Level Architecture Diagram

```
┌─────────────────┐
│   User Browser  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   AWS Amplify   │ ← Frontend Hosting (React)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  AWS Cognito    │ ← User Authentication & Authorization
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  API Gateway    │ ← JWT Token Validation, CORS, Routes
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│         Lambda Functions                │
│  ┌──────────┐  ┌──────────┐  ┌───────┐ │
│  │ Pre-     │  │ Post-    │  │Create │ │
│  │ Signup   │  │ Confirm  │  │Task   │ │
│  └──────────┘  └──────────┘  └───────┘ │
│  ┌──────────┐  ┌──────────┐  ┌───────┐ │
│  │ Update   │  │ Delete   │  │ Get   │ │
│  │ Task     │  │ Task     │  │Tasks  │ │
│  └──────────┘  └──────────┘  └───────┘ │
│  ┌──────────┐                           │
│  │ User Mgmt│                           │
│  └──────────┘                           │
└────────┬────────────────────┬───────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────────┐
│   DynamoDB      │  │   Amazon SES    │
│  - tasks table  │  │  Email Sending  │
│  - users table  │  │                 │
└─────────────────┘  └─────────────────┘
```

### Technology Stack

- **Frontend**: React.js with AWS Amplify UI components
- **Authentication**: AWS Cognito with email-only login
- **API**: AWS API Gateway with Cognito Authorizer
- **Backend**: AWS Lambda (Node.js 18)
- **Database**: Amazon DynamoDB (Pay-per-Request)
- **Email**: Amazon SES
- **Infrastructure**: Terraform (Infrastructure as Code)
- **Hosting**: AWS Amplify (connected to GitHub)
- **Monitoring**: CloudWatch Logs and Metrics

---

## Authentication Flow

### Signup Process

```
1. User enters email + password in frontend
   ↓
2. AWS Cognito receives signup request
   ↓
3. Cognito triggers pre-signup.js Lambda
   ↓
4. pre-signup.js validates:
   - Email domain is @amalitech.com OR @amalitechtraining.org
   - If invalid → throws error: "Email address is not authorized for registration."
   ↓
5. ✅ Domain valid → User created (status: UNCONFIRMED)
   ↓
6. Cognito sends verification email
   ↓
7. User clicks verification link in email
   ↓
8. Cognito triggers post-confirmation.js Lambda
   ↓
9. post-confirmation.js:
   - Creates user record in DynamoDB users table
   - Determines role based on email domain:
     * @amalitech.com → 'admin'
     * @amalitechtraining.org → 'member'
   - Adds user to appropriate Cognito group
   ↓
10. ✅ User status: CONFIRMED (can now login)
```

### Login Process

```
1. User enters email + password
   ↓
2. Cognito validates credentials
   ↓
3. Returns JWT token containing:
   - User ID (sub)
   - Email
   - Cognito groups: ['admin'] or ['member']
   - Expiration time (1 hour default)
   ↓
4. Frontend stores token
   ↓
5. Frontend checks token groups to determine role
   ↓
6. Token included in Authorization header for all API calls:
   Authorization: Bearer <JWT_TOKEN>
```

### Role Detection Logic

**Priority Order:**
1. Check JWT token `cognito:groups` claim (most reliable)
2. Fallback: Check email domain (@amalitech.com → admin)

---

## Task Management Flow

### Admin Creates Task

```
Step 1: Admin fills task form
  - Title: "Build authentication API"
  - Description: "Implement OAuth 2.0"
  - Priority: "urgent"
  - Due Date: "2026-12-31"
  - Assigned Members: [member1@amalitechtraining.org, member2@amalitechtraining.org]
  - Tags: ["backend", "security"]

Step 2: Frontend sends POST /tasks
  Headers:
    Authorization: Bearer <admin-jwt-token>
    Content-Type: application/json
  Body:
    {
      "title": "Build authentication API",
      "description": "Implement OAuth 2.0",
      "priority": "urgent",
      "dueDate": "2026-12-31",
      "assignedTo": ["member1@...", "member2@..."],
      "tags": ["backend", "security"]
    }

Step 3: API Gateway validates JWT with Cognito
  - Checks token signature
  - Checks token not expired
  - ✅ Valid → forwards to Lambda

Step 4: create-task.js Lambda executes
  4a. Extract user info from JWT token
  4b. Check user is admin (cognito:groups includes 'admin')
      ❌ Not admin → 403 Forbidden
      ✅ Is admin → continue
  
  4c. Validate assigned members:
      - Call shared-utils.js → validateAssignedMembers()
      - Check each email exists in DynamoDB users table
      - Check each user status is 'active'
      - Check no admins in assignment list
      - Remove duplicates
      ❌ Any validation fails → 400 Bad Request with details
      ✅ All valid → continue
  
  4d. Create task object:
      {
        taskId: uuid(),
        title, description, priority, dueDate, tags,
        assignedTo: assignedMembers[0],
        assignedMembers: [...],
        status: 'pending',
        createdBy: admin-email,
        createdAt: timestamp,
        updatedAt: timestamp
      }
  
  4e. Save to DynamoDB tasks table
  
  4f. Send email notifications:
      - Check if priority === 'urgent'
      - For each assigned member:
        * If urgent:
          Subject: "🚨 URGENT: New Task Assigned"
          Body: Includes warning banner and urgent styling
        * If normal:
          Subject: "New Task Assigned"
          Body: Standard format
      - Use Amazon SES via shared-utils.js → sendNotificationEmail()
  
  4g. Return response:
      {
        message: "Task created successfully",
        taskId: "...",
        task: {...}
      }

Step 5: Frontend receives response
  - Shows success message
  - Refreshes task list
  - Clears form
```

### Member Updates Task Status

```
Step 1: Member changes status from "pending" to "in-progress"

Step 2: Frontend sends PUT /tasks
  Headers:
    Authorization: Bearer <member-jwt-token>
  Body:
    {
      "taskId": "abc-123-def",
      "status": "in-progress"
    }

Step 3: API Gateway validates JWT ✅

Step 4: update-task.js Lambda executes
  4a. Extract user info and role from JWT
  
  4b. Get existing task from DynamoDB
      ❌ Task not found → 404 Not Found
  
  4c. Check permissions:
      - If user is member:
        * Must be in task.assignedMembers array
        * Can only update: status, add comments
        ❌ Not assigned → 403 Forbidden
        ❌ Trying to update other fields → 403 Forbidden
      - If user is admin:
        * Can update all fields
  
  4d. Validate status value:
      - Must be: 'pending', 'in-progress', 'completed', or 'cancelled'
      ❌ Invalid → 400 Bad Request
  
  4e. Build update expression for DynamoDB
  
  4f. Update task in DynamoDB
      - Sets updatedAt = current timestamp
      - Sets updatedBy = user email
  
  4g. Send notifications:
      - Status changed → notify admin and all assigned members (except user who made change)
      - Member reassignment → notify new/removed members
      - Priority changed to urgent → send urgent notifications
  
  4h. Return response:
      {
        message: "Task updated successfully",
        taskId: "...",
        updates: {...}
      }

Step 5: Frontend receives response
  - Shows success notification
  - Updates task card status badge
  - Refreshes task list
```

### Admin Deletes Task

```
Step 1: Admin clicks delete button on task

Step 2: Frontend confirms deletion (modal/alert)

Step 3: Frontend sends DELETE /tasks/{taskId}
  Headers:
    Authorization: Bearer <admin-jwt-token>

Step 4: API Gateway validates JWT ✅

Step 5: delete-task.js Lambda executes
  5a. Extract user role from JWT
  5b. Check user is admin
      ❌ Not admin → 403 Forbidden
  5c. Delete task from DynamoDB
      ❌ Task not found → 404 Not Found
  5d. Return 200 OK

Step 6: Frontend removes task card from UI
```

---

## Database Structure

### DynamoDB: tasks Table

**Primary Key:**
- Partition Key: `taskId` (String, UUID)

**Attributes:**
```javascript
{
  taskId: "550e8400-e29b-41d4-a716-446655440000",
  title: "Build authentication API",
  description: "Implement OAuth 2.0 with JWT tokens",
  status: "in-progress",           // enum: pending, in-progress, completed, cancelled
  priority: "urgent",               // enum: low, medium, high, urgent
  assignedTo: "member@domain.org",  // Primary assignee (for compatibility)
  assignedMembers: [                // Array of all assigned member emails
    "member1@amalitechtraining.org",
    "member2@amalitechtraining.org"
  ],
  createdBy: "admin@amalitech.com",
  createdAt: "2026-02-07T10:30:00.000Z",
  updatedAt: "2026-02-07T14:22:15.000Z",
  updatedBy: "member1@amalitechtraining.org",
  dueDate: "2026-12-31",            // Optional, can be null
  tags: ["backend", "security"],     // Optional array
  comments: [                        // Optional array of comment objects
    {
      author: "member1@amalitechtraining.org",
      text: "Started working on this",
      timestamp: "2026-02-07T14:22:00.000Z"
    }
  ]
}
```

**Indexes:**
- None currently (small dataset, full table scans acceptable)
- Future: Add GSI on `createdBy` for admin filtering
- Future: Add GSI on `assignedMembers` for member filtering

---

### DynamoDB: users Table

**Primary Key:**
- Partition Key: `userId` (String, UUID)

**Global Secondary Index (GSI):**
- EmailIndex: Partition Key = `email`

**Attributes:**
```javascript
{
  userId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  email: "member@amalitechtraining.org",
  role: "member",                   // enum: admin, member
  status: "active",                 // enum: active, inactive
  createdAt: "2026-02-05T08:15:30.000Z",
  lastLogin: "2026-02-07T09:45:12.000Z"  // Optional, updated on each login
}
```

**Query Patterns:**
1. Get user by userId: Direct get on Primary Key
2. Get user by email: Query EmailIndex GSI
3. List all active members: Scan with filter status='active' AND role='member'

---

## Lambda Functions

### 1. pre-signup.js

**Trigger:** Cognito Pre-signup event

**Purpose:** Validates email domain before user creation

**Logic:**
```javascript
const ALLOWED_DOMAINS = ['@amalitech.com', '@amalitechtraining.org'];

1. Extract email from event.request.userAttributes.email
2. Check if email ends with allowed domain
   ✅ Valid → return event (user creation continues)
   ❌ Invalid → throw Error("Email address is not authorized for registration.")
3. Set response.autoConfirmUser = false (force email verification)
```

**Security Note:** Error message is generic to avoid revealing allowed domains to attackers. Detailed logging in CloudWatch for debugging.

---

### 2. post-confirmation.js

**Trigger:** Cognito Post-confirmation event

**Purpose:** Creates user in DynamoDB and assigns Cognito group

**Logic:**
```javascript
1. Extract email, sub (user ID) from event
2. Determine role:
   - email.includes('@amalitech.com') → 'admin'
   - else → 'member'
3. Add user to Cognito group:
   - Call cognito.adminAddUserToGroup()
   - Group name: 'admin' or 'member'
4. Check if user already exists in DynamoDB (query EmailIndex)
   - If exists → skip creation (idempotency)
5. Create user record in DynamoDB users table:
   {
     userId: uuid(),
     email,
     role,
     status: 'active',
     createdAt: timestamp
   }
6. Return event
```

---

### 3. create-task.js

**Trigger:** POST /tasks API endpoint

**Purpose:** Admin creates new task and assigns to members

**Permissions Required:** User must be in 'admin' Cognito group

**Logic:**
```javascript
1. Validate authentication (shared-utils.validateAuth)
   - Extract and verify JWT token from Authorization header
   - Get user email and role
   
2. Check admin role:
   ❌ role !== 'admin' → 403 Forbidden
   
3. Validate request body:
   - Required: title, description, assignedTo (array)
   - Optional: priority, dueDate, tags
   
4. Validate assigned members (shared-utils.validateAssignedMembers):
   - Each email must exist in users table
   - Each user must have status = 'active'
   - No admin users allowed in assignment
   - Remove duplicates
   
5. Create task object with generated UUID
   
6. Save to DynamoDB tasks table
   
7. Send email notifications:
   - Check if priority === 'urgent'
   - For each member in assignedMembers:
     * Build email (urgent format if applicable)
     * Call shared-utils.sendNotificationEmail()
     * Use Promise.allSettled() for parallel sending
   
8. Return 201 Created with task details
```

**Urgent Email Format:**
- Subject: `🚨 URGENT: New Task Assigned`
- Body includes warning banner: `⚠️ THIS IS AN URGENT TASK - IMMEDIATE ATTENTION REQUIRED ⚠️`
- Priority shown as uppercase: `URGENT`
- Additional message: "Please prioritize this task immediately."

---

### 4. update-task.js

**Trigger:** PUT /tasks API endpoint

**Purpose:** Updates existing task (role-based permissions)

**Logic:**
```javascript
1. Validate authentication (shared-utils.validateAuth)
   
2. Extract taskId and updates from request body
   
3. Get existing task from DynamoDB
   ❌ Not found → 404 Not Found
   
4. Check permissions based on role:
   
   If role === 'admin':
     - Can update all fields:
       * title, description, priority, dueDate, tags
       * status, assignedTo, assignedMembers
   
   If role === 'member':
     - Can only update:
       * status (to: pending, in-progress, completed)
       * Add comments (append to comments array)
     - Cannot modify: title, description, priority, assignedTo
     - Must be in task.assignedMembers array
       ❌ Not assigned → 403 Forbidden
   
5. Validate updated values:
   - status: must be valid enum
   - priority: must be valid enum
   - dueDate: must be valid date format
   - assignedTo: must pass validateAssignedMembers check
   
6. Build DynamoDB update expression
   
7. Update task in DynamoDB
   - Set updatedAt = current timestamp
   - Set updatedBy = user email
   
8. Send notifications based on what changed:
   
   a. Status changed:
      - Notify task creator (if not the one who changed it)
      - Notify all assigned members (except the one who changed it)
   
   b. Priority changed to 'urgent':
      - Send urgent notifications to all assigned members
   
   c. Members reassigned:
      - Notify new members (welcome message with task details)
      - Notify removed members (removal notice)
   
9. Return 200 OK with updated fields
```

---

### 5. delete-task.js

**Trigger:** DELETE /tasks/{taskId} API endpoint

**Purpose:** Admin-only task deletion

**Permissions Required:** User must be admin

**Logic:**
```javascript
1. Validate authentication (shared-utils.validateAuth)
   
2. Check admin role:
   ❌ role !== 'admin' → 403 Forbidden
   
3. Extract taskId from path parameters
   
4. Delete from DynamoDB:
   - Delete item with Key = { taskId }
   - ❌ Item not found → 404 Not Found
   
5. Return 200 OK with deletion confirmation
```

**Note:** Deletion is permanent. No soft-delete or archive implemented.

---

### 6. get-tasks.js

**Trigger:** GET /tasks API endpoint

**Purpose:** Retrieves tasks (filtered by role)

**Logic:**
```javascript
1. Validate authentication (shared-utils.validateAuth)
   
2. Scan DynamoDB tasks table (get all tasks)
   
3. Filter based on role:
   
   If role === 'admin':
     - Return all tasks
   
   If role === 'member':
     - Filter tasks where task.assignedMembers includes user email
     - Return only assigned tasks
   
4. Sort tasks by createdAt (newest first)
   
5. Return 200 OK with:
   {
     tasks: [...],
     count: number
   }
```

**Performance Note:** Uses full table scan. For production scale, implement GSI on assignedMembers for efficient member queries.

---

### 7. user-management.js

**Trigger:** GET /users API endpoint

**Purpose:** Returns list of active members for task assignment

**Permissions Required:** Admin only

**Logic:**
```javascript
1. Validate authentication (shared-utils.validateAuth)
   
2. Check admin role:
   ❌ role !== 'admin' → 403 Forbidden
   
3. Scan DynamoDB users table
   
4. Filter users:
   - status === 'active'
   - role === 'member' (exclude admins)
   
5. Return 200 OK with:
   {
     users: [
       { userId, email, role, status },
       ...
     ],
     count: number
   }
```

**Used by:** Frontend TaskForm component to populate member dropdown

---

### 8. shared-utils.js

**Type:** Utility library (imported by other Lambdas)

**Purpose:** Common functions for auth, validation, email sending

**Key Functions:**

#### validateAuth(event)
```javascript
Purpose: Extract and validate JWT token from API Gateway event
Input: API Gateway event object
Output: { email, role, userId } or throws 401 error
Logic:
  1. Check event.requestContext.authorizer exists (from Cognito)
  2. Extract claims (email, sub, cognito:groups)
  3. Determine role from cognito:groups or email domain
  4. Return user info object
```

#### validateAssignedMembers(emails)
```javascript
Purpose: Validate member emails before task assignment
Input: Array of email strings
Output: Validation result object
Logic:
  1. For each email, query users table by EmailIndex GSI
  2. Check user exists
  3. Check status === 'active'
  4. Check role !== 'admin'
  5. Return:
     {
       validMembers: [...],
       nonExistentUsers: [...],
       inactiveUsers: [...],
       adminUsers: [...]
     }
```

#### validateEmails(emails)
```javascript
Purpose: Remove duplicates and validate email format
Input: Array of email strings
Output: { valid: boolean, emails: [...], invalid: [...] }
Logic:
  1. Use Set to remove duplicates
  2. Validate each email format with regex
  3. Return validated unique emails
```

#### sendNotificationEmail(to, subject, message)
```javascript
Purpose: Send email via Amazon SES
Input: recipient email, subject, message body
Output: Promise (resolves when email sent)
Logic:
  1. Build SES send email parameters
  2. Format message as HTML:
     - Add styling
     - Convert \n to <br>
     - Add task management branding
  3. Call ses.sendEmail()
  4. Handle errors (log but don't throw)
```

#### checkUserActive(email)
```javascript
Purpose: Check if user exists and is active
Input: User email
Output: Boolean
Logic:
  1. Query users table by EmailIndex
  2. Return user.status === 'active'
```

#### getUserRole(email)
```javascript
Purpose: Get user role from database
Input: User email
Output: String ('admin' or 'member')
Logic:
  1. Query users table by EmailIndex
  2. Return user.role
  3. Fallback: check email domain
```

---

## Security Features

### 1. Email Domain Validation
- **Implementation:** pre-signup.js Lambda
- **Enforcement Point:** Before user creation in Cognito
- **Allowed Domains:**
  - `@amalitech.com` → Admin role
  - `@amalitechtraining.org` → Member role
- **Error Message:** Generic ("Email address is not authorized") to prevent domain enumeration attacks
- **Logging:** Detailed rejection reasons logged to CloudWatch for debugging

### 2. Mandatory Email Verification
- **Implementation:** Cognito configuration + pre-signup.js
- **Process:**
  1. User signs up → status UNCONFIRMED
  2. Cognito sends verification email
  3. User clicks link → status CONFIRMED
  4. post-confirmation.js creates DynamoDB user record
- **Enforcement:** Unverified users cannot login
- **Token Setting:** `autoConfirmUser = false`, `autoVerifyEmail = false`

### 3. JWT Token Authentication
- **Implementation:** API Gateway Cognito Authorizer
- **Enforcement:** All API endpoints require valid JWT token
- **Token Content:**
  - `sub`: User ID
  - `email`: User email
  - `cognito:groups`: Array of group names
  - `exp`: Expiration timestamp
- **Validation:** API Gateway validates signature, expiration, and issuer before forwarding to Lambda
- **Header Format:** `Authorization: Bearer <token>`

### 4. Role-Based Authorization
- **Implementation:** Lambda functions + Cognito groups
- **Levels:**
  - **API Gateway:** Validates JWT token exists and is valid
  - **Lambda:** Checks user role from `cognito:groups` claim
- **Role Checks:**
  - Admin-only endpoints: POST /tasks, DELETE /tasks, GET /users
  - Member endpoints: PUT /tasks (limited fields), GET /tasks (filtered)
- **403 Response:** Returned when user lacks required role

### 5. Active User Validation
- **Implementation:** shared-utils.js `validateAssignedMembers()`
- **Enforcement Point:** Task creation and updates
- **Check:** Users must have `status = 'active'` in DynamoDB
- **Purpose:** Prevent task assignment to deactivated/deleted users
- **Error:** 400 Bad Request with list of inactive users

### 6. Duplicate Prevention
- **Implementation:** shared-utils.js `validateEmails()`
- **Method:** JavaScript Set to remove duplicates
- **Applied To:**
  - Task member assignments
  - Email recipient lists
- **Purpose:** Avoid duplicate notifications and data inconsistency

### 7. Admin Exclusion from Assignments
- **Implementation:** shared-utils.js `validateAssignedMembers()`
- **Rule:** Users with role='admin' cannot be assigned to tasks
- **Rationale:** Separation of duties (admins manage, members execute)
- **Error:** 400 Bad Request with list of admin emails attempted

### 8. CORS Configuration
- **Implementation:** API Gateway module in Terraform
- **Allowed Origin:** Amplify frontend URL
- **Allowed Methods:** GET, POST, PUT, DELETE, OPTIONS
- **Allowed Headers:** Authorization, Content-Type
- **Purpose:** Prevent unauthorized cross-origin requests

### 9. IAM Least Privilege
- **Implementation:** Terraform IAM roles and policies
- **Lambda Execution Role Permissions:**
  - DynamoDB: Get, Put, Update, Delete, Query, Scan on tasks and users tables only
  - SES: SendEmail with verified sender only
  - CloudWatch: CreateLogGroup, CreateLogStream, PutLogEvents
  - Cognito: AdminAddUserToGroup (post-confirmation only)
- **No Wildcards:** All resource ARNs explicitly specified

### 10. Sensitive Data Protection
- **What's Protected:**
  - Terraform state files (contain resource IDs, ARNs)
  - terraform.tfvars (may contain secrets)
  - .env files
  - AWS credentials
- **Method:** .gitignore excludes sensitive files from git
- **Logging:** Passwords never logged; only email addresses for debugging

---

## Email Notifications

### Notification Triggers

| Event | Recipients | Priority Handling |
|-------|-----------|-------------------|
| Task Created | All assigned members | Check if urgent |
| Task Status Changed | Admin (task creator) + all assigned members except changer | Normal |
| Member Added to Task | New member | Check if task is urgent |
| Member Removed from Task | Removed member | Normal |
| Priority Changed to Urgent | All assigned members | Special urgent format |

### Standard Email Format

**Subject:** `New Task Assigned` or `Task Status Updated`

**Body:**
```
Hello,

You have been assigned to task: "Build authentication API"

Description: Implement OAuth 2.0 with JWT tokens

Status: pending
Priority: medium

You can view and update this task in the Task Management System.

Best regards,
Task Management System
```

### Urgent Email Format

**Subject:** `🚨 URGENT: New Task Assigned`

**Body:**
```
Hello,

⚠️ THIS IS AN URGENT TASK - IMMEDIATE ATTENTION REQUIRED ⚠️

You have been assigned to task: "Fix production security vulnerability"

Description: Critical security patch needed for authentication module

Status: pending
Priority: URGENT

Please prioritize this task immediately.

You can view and update this task in the Task Management System.

Best regards,
Task Management System
```

**Visual Indicators:**
- 🚨 emoji in subject
- ⚠️ warning banner at top of body
- Priority shown in uppercase
- Additional urgency message
- Red/orange color coding (if HTML email)

### Email Sending Logic

```javascript
// In create-task.js and update-task.js

const isUrgent = task.priority === 'urgent';

const emailSubject = isUrgent 
  ? '🚨 URGENT: New Task Assigned' 
  : 'New Task Assigned';

const urgentWarning = isUrgent 
  ? '\n⚠️ THIS IS AN URGENT TASK - IMMEDIATE ATTENTION REQUIRED ⚠️\n' 
  : '';

const urgentMessage = isUrgent 
  ? '\n\nPlease prioritize this task immediately.' 
  : '';

const messageBody = `${urgentWarning}
You have been assigned to task: "${task.title}"

Description: ${task.description}

Status: ${task.status}
Priority: ${task.priority.toUpperCase()}${urgentMessage}`;

// Send to all assigned members
const notifications = task.assignedMembers.map(email =>
  sendNotificationEmail(email, emailSubject, messageBody)
);

await Promise.allSettled(notifications);
```

### SES Configuration

- **Verified Sender:** abraham.gyamfi@amalitech.com
- **Region:** eu-west-1
- **Sandbox Mode:** May be active (only verified emails can receive)
- **Production:** Verify domain or request production access to send to any email

---

## Frontend Components

### App.js

**Purpose:** Main application wrapper with authentication

**Key Features:**
```javascript
- AWS Amplify Authenticator wrapper
- Email-only login (no username field)
- Custom formFields configuration:
  * signUp: email, password only
  * signIn: email (labeled "Email"), password
- Hub listener for auth state changes
- Role detection via useAuth hook
- Conditional rendering based on role:
  * Admin: TaskForm + TaskList (all tasks)
  * Member: TaskList (assigned tasks only)
```

**Authentication Configuration:**
```javascript
<Authenticator
  loginMechanisms={['email']}
  signUpAttributes={['email']}
  formFields={{
    signUp: {
      email: { label: 'Email', placeholder: 'Enter your email' },
      password: { label: 'Password', placeholder: 'Enter password' }
    },
    signIn: {
      username: { label: 'Email', placeholder: 'Enter your email' }
    }
  }}
>
```

---

### useAuth.js Hook

**Purpose:** Manages authentication state and role detection

**Exports:**
```javascript
{
  user: CognitoUser object,
  userEmail: string,
  role: 'admin' | 'member',
  loading: boolean,
  signOut: function
}
```

**Logic:**
```javascript
1. On mount and auth changes:
   - Get current authenticated user from Amplify
   - Extract email
   - Check role:
     a. Primary: Get from Cognito groups in JWT token
        - User is in 'admin' group → role = 'admin'
        - User is in 'member' group → role = 'member'
     b. Fallback: Check email domain
        - email.includes('@amalitech.com') → 'admin'
        - else → 'member'
   - Set state

2. Hub.listen('auth', ...) for auth events:
   - 'signIn' → refresh user and role
   - 'signOut' → clear state
```

**Usage in Components:**
```javascript
const { userEmail, role, loading } = useAuth();

if (role === 'admin') {
  return <TaskForm />; // Show create form
}
```

---

### TaskForm.js Component

**Purpose:** Admin-only form for creating tasks

**Features:**
1. **Member Dropdown:**
   - Fetches from GET /users API
   - Searchable input field
   - Visual dropdown arrow indicator (▼)
   - Filters list as user types
   - Click arrow or focus to show all members
   - Excludes admins (only shows active members)
   - Click outside to close (useRef for click detection)

2. **Selected Members Display:**
   - Shows as tags/chips with member email
   - Remove button (×) on each tag
   - Supports multiple member assignment

3. **Form Fields:**
   - Title (required)
   - Description (required)
   - Priority dropdown (low, medium, high, urgent)
   - Due date picker
   - Tags input (comma-separated)
   - Assigned members (searchable dropdown)

**State Management:**
```javascript
const [newTask, setNewTask] = useState({
  title: '',
  description: '',
  priority: 'medium',
  dueDate: '',
  assignedTo: [],  // Array of selected emails
  tags: []
});

const [members, setMembers] = useState([]); // Available members
const [searchTerm, setSearchTerm] = useState('');
const [showDropdown, setShowDropdown] = useState(false);
```

**Member Fetch Logic:**
```javascript
useEffect(() => {
  fetchMembers();
}, []);

const fetchMembers = async () => {
  const session = await Auth.currentSession();
  const token = session.getIdToken().getJwtToken();
  
  const response = await fetch(`${API_URL}/users`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const data = await response.json();
  
  // Filter to only active members (exclude admins)
  const activeMembers = data.users.filter(user => 
    user.status === 'active' && user.role === 'member'
  );
  
  setMembers(activeMembers);
};
```

**Member Selection:**
```javascript
const handleMemberSelection = (email) => {
  if (!newTask.assignedTo.includes(email)) {
    setNewTask({
      ...newTask,
      assignedTo: [...newTask.assignedTo, email]
    });
  }
  setSearchTerm('');
  setShowDropdown(false);
};

const removeMember = (email) => {
  setNewTask({
    ...newTask,
    assignedTo: newTask.assignedTo.filter(e => e !== email)
  });
};
```

**Form Submission:**
```javascript
const onSubmit = async (e) => {
  e.preventDefault();
  
  const session = await Auth.currentSession();
  const token = session.getIdToken().getJwtToken();
  
  const response = await fetch(`${API_URL}/tasks`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(newTask)
  });
  
  if (response.ok) {
    // Success - clear form and refresh tasks
  }
};
```

---

### TaskCard.js Component

**Purpose:** Displays individual task as a card

**Props:**
```javascript
{
  task: Task object,
  userRole: 'admin' | 'member',
  userEmail: string,
  onUpdate: function,
  onDelete: function
}
```

**Display Elements:**
1. **Status Badge** (colored):
   - pending → yellow/orange
   - in-progress → blue
   - completed → green
   - cancelled → gray

2. **Priority Indicator:**
   - urgent → 🚨 red badge
   - high → orange
   - medium → yellow
   - low → gray

3. **Task Info:**
   - Title (bold)
   - Description
   - Due date (if set)
   - Tags (as chips)
   - Assigned members list

4. **Actions:**
   - Member: Status dropdown, Add comment
   - Admin: Edit all fields, Delete button

**Status Update (Member):**
```javascript
const handleStatusChange = async (newStatus) => {
  const session = await Auth.currentSession();
  const token = session.getIdToken().getJwtToken();
  
  const response = await fetch(`${API_URL}/tasks`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      taskId: task.taskId,
      status: newStatus
    })
  });
  
  if (response.ok) {
    onUpdate(); // Refresh parent task list
  }
};
```

---

### App.css Styles

**Key Styles for Member Dropdown:**

```css
.search-dropdown-container {
  position: relative;
  width: 100%;
}

.search-input {
  width: 100%;
  padding: 0.75rem;
  padding-right: 2.5rem; /* Space for dropdown arrow */
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 0.95rem;
}

.dropdown-arrow {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: #666;
  cursor: pointer;
  font-size: 0.75rem;
  user-select: none;
}

.dropdown-arrow:hover {
  color: #1967d2; /* Blue on hover */
}

.dropdown-list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 300px;
  overflow-y: auto;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  margin-top: 0.25rem;
  z-index: 1000;
}

.dropdown-item {
  padding: 0.75rem 1rem;
  cursor: pointer;
  transition: background 0.2s;
}

.dropdown-item:hover {
  background: #e8f0fe; /* Light blue */
}

.member-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #e8f0fe;
  color: #1967d2;
  border-radius: 20px;
  font-size: 0.9rem;
}

.remove-tag-btn {
  background: none;
  border: none;
  color: #1967d2;
  font-size: 1.25rem;
  cursor: pointer;
  border-radius: 50%;
}

.remove-tag-btn:hover {
  background: #1967d2;
  color: white;
}
```

---

## Infrastructure

### Terraform Module Structure

```
terraform/
├── main.tf                      # Root module - connects all modules
├── variables.tf                 # Input variables
├── outputs.tf                   # Output values (URLs, IDs)
├── terraform.tfvars.example     # Example configuration
├── terraform.tfvars             # Actual config (gitignored)
└── modules/
    ├── auth/                    # Cognito module
    │   ├── main.tf
    │   ├── outputs.tf
    │   └── variables.tf
    ├── compute/                 # Lambda functions module
    │   ├── main.tf
    │   ├── outputs.tf
    │   └── variables.tf
    ├── api/                     # API Gateway module
    │   ├── main.tf
    │   ├── outputs.tf
    │   └── variables.tf
    ├── database/                # DynamoDB module
    │   ├── main.tf
    │   ├── outputs.tf
    │   └── variables.tf
    ├── frontend/                # Amplify module
    │   ├── main.tf
    │   ├── outputs.tf
    │   └── variables.tf
    └── notifications/           # SES & SNS module
        ├── main.tf
        ├── outputs.tf
        └── variables.tf
```

### Module: auth/

**Resources Created:**
1. **aws_cognito_user_pool.main**
   - Email as username
   - Password policy (min 8 chars, uppercase, lowercase, numbers, symbols)
   - Email verification required
   - Auto-verified attributes: email
   - Lambda triggers:
     * Pre-signup: pre-signup Lambda ARN
     * Post-confirmation: post-confirmation Lambda ARN

2. **aws_cognito_user_pool_client.main**
   - Auth flows: USER_PASSWORD_AUTH
   - Read/write attributes: email
   - Token validity: 60 minutes
   - No client secret (public client)

3. **aws_cognito_user_group.admin**
   - Group name: "admin"
   - Description: "Administrator users"

4. **aws_cognito_user_group.member**
   - Group name: "member"
   - Description: "Regular member users"

5. **aws_lambda_permission** (x2)
   - Allow Cognito to invoke pre-signup and post-confirmation Lambdas

**Outputs:**
- user_pool_id
- user_pool_arn
- user_pool_client_id
- user_pool_endpoint

---

### Module: compute/

**Resources Created:**

1. **aws_iam_role.lambda_execution**
   - Assume role policy: Lambda service
   - Managed policies attached:
     * AWSLambdaBasicExecutionRole (CloudWatch Logs)

2. **aws_iam_role_policy.lambda_policy**
   - DynamoDB: Get, Put, Update, Delete, Query, Scan on tasks and users tables
   - SES: SendEmail with verified sender
   - Cognito: AdminAddUserToGroup (post-confirmation only)

3. **aws_lambda_function** (x8):
   - pre_signup
   - post_confirmation
   - create_task
   - update_task
   - delete_task
   - get_tasks
   - user_management
   - task_management (if exists)
   
   **Configuration for each:**
   - Runtime: nodejs18.x
   - Handler: filename.handler
   - Role: lambda_execution_role ARN
   - Timeout: 30 seconds (60 for complex operations)
   - Memory: 256 MB (adjustable)
   - Environment variables:
     * TASKS_TABLE: tasks table name
     * USERS_TABLE: users table name
     * SES_SENDER_EMAIL: verified sender email
   - Source code: ZIP archive from lambda/ directory

4. **aws_cloudwatch_log_group** (x8)
   - Log group for each Lambda
   - Retention: 7 days (configurable)
   - Name: /aws/lambda/{function-name}

5. **data.archive_file** (x8)
   - Creates ZIP of Lambda function + shared-utils.js
   - Includes node_modules (package dependencies)
   - Triggers redeployment on code changes

**Outputs:**
- Lambda function ARNs (x8)
- Lambda invoke ARNs (x8)
- Lambda function names (x8)

---

### Module: api/

**Resources Created:**

1. **aws_api_gateway_rest_api.main**
   - Name: task-management-api
   - Description: Task Management System API
   - Endpoint: REGIONAL

2. **aws_api_gateway_authorizer.cognito**
   - Type: COGNITO_USER_POOLS
   - Provider ARN: Cognito User Pool ARN
   - Identity source: method.request.header.Authorization

3. **aws_cloudwatch_log_group.api_gateway**
   - For API Gateway access logs
   - Retention: 7 days

4. **aws_iam_role.api_gateway_cloudwatch**
   - Allows API Gateway to write logs to CloudWatch

5. **API Resources:**
   ```
   /tasks
     GET     → get_tasks Lambda
     POST    → create_task Lambda
     PUT     → update_task Lambda
     OPTIONS → CORS preflight
     
     /{taskId}
       DELETE → delete_task Lambda
       OPTIONS → CORS preflight
   
   /users
     GET     → user_management Lambda
     OPTIONS → CORS preflight
   ```

6. **aws_api_gateway_method** (x6 + OPTIONS)**
   - Authorization: COGNITO_USER_POOLS (except OPTIONS)
   - Authorizer: cognito authorizer ID
   - Request validator: Validate body, parameters

7. **aws_api_gateway_integration** (x6 + OPTIONS)
   - Type: AWS_PROXY (Lambda proxy integration)
   - Integration HTTP method: POST (Lambda invocation)
   - URI: Lambda invoke ARN

8. **aws_lambda_permission** (x6)
   - Allow API Gateway to invoke each Lambda
   - Source ARN: API Gateway execution ARN

9. **CORS Configuration:**
   - Allowed Origins: Amplify frontend URL
   - Allowed Methods: GET, POST, PUT, DELETE, OPTIONS
   - Allowed Headers: Content-Type, Authorization
   - Max Age: 300 seconds

10. **aws_api_gateway_deployment.main**
    - Triggers on any API changes
    - Stage name: prod

11. **aws_api_gateway_stage.prod**
    - Stage name: prod
    - Logging: Full access logs to CloudWatch
    - Metrics: Detailed CloudWatch metrics enabled
    - Throttling: Rate limit 1000/sec, burst 500

**Outputs:**
- api_gateway_id
- api_gateway_url (invoke URL)
- api_gateway_stage

---

### Module: database/

**Resources Created:**

1. **aws_dynamodb_table.tasks**
   - Table name: tasks
   - Partition key: taskId (String)
   - Billing mode: PAY_PER_REQUEST (on-demand)
   - Point-in-time recovery: Enabled
   - Deletion protection: Disabled (for dev)
   - Tags: Environment, Project

2. **aws_dynamodb_table.users**
   - Table name: users
   - Partition key: userId (String)
   - Billing mode: PAY_PER_REQUEST
   - Global Secondary Index:
     * Name: EmailIndex
     * Partition key: email (String)
     * Projection: ALL (include all attributes)
   - Point-in-time recovery: Enabled
   - Deletion protection: Disabled

**Outputs:**
- tasks_table_name
- tasks_table_arn
- users_table_name
- users_table_arn
- email_index_name

---

### Module: frontend/

**Resources Created:**

1. **aws_iam_role.amplify**
   - Assume role policy: Amplify service
   - Managed policies:
     * AdministratorAccess-Amplify (full Amplify permissions)

2. **aws_amplify_app.main**
   - Name: task-management-frontend
   - Repository: GitHub repo URL
   - OAuth token: from variable (for private repos)
   - Build spec (amplify.yml):
     ```yaml
     version: 1
     frontend:
       phases:
         preBuild:
           commands:
             - cd frontend
             - npm install
         build:
           commands:
             - npm run build
       artifacts:
         baseDirectory: frontend/build
         files:
           - '**/*'
       cache:
         paths:
           - frontend/node_modules/**/*
     ```
   - Environment variables:
     * REACT_APP_API_URL: API Gateway URL
     * REACT_APP_USER_POOL_ID: Cognito User Pool ID
     * REACT_APP_USER_POOL_CLIENT_ID: Cognito Client ID
     * REACT_APP_REGION: AWS region
   - IAM service role: amplify role ARN
   - Custom rules:
     * SPA redirect: All requests → /index.html (200)

3. **aws_amplify_branch.main**
   - Branch name: main
   - Enable auto build: true
   - Framework: React
   - Stage: PRODUCTION

**Outputs:**
- amplify_app_id
- amplify_app_url
- amplify_default_domain

---

### Module: notifications/

**Resources Created:**

1. **aws_ses_email_identity.notification_sender**
   - Email: abraham.gyamfi@amalitech.com (from variable)
   - Verification required (check inbox for confirmation link)

2. **aws_ses_configuration_set.main**
   - Name: task-management-emails
   - Purpose: Track email sending metrics

3. **aws_sns_topic.task_notifications**
   - Name: task-management-notifications
   - Purpose: Future use for SMS or other notification types

4. **aws_sns_topic_policy**
   - Allow SES to publish to SNS topic

**Outputs:**
- ses_sender_email
- sns_topic_arn
- ses_configuration_set_name

---

## API Endpoints

### Base URL
```
https://hlpjm7pf97.execute-api.eu-west-1.amazonaws.com/prod
```

---

### POST /tasks

**Description:** Create new task (Admin only)

**Authorization:** Bearer {JWT_TOKEN}

**Request Body:**
```json
{
  "title": "Build authentication API",
  "description": "Implement OAuth 2.0 with JWT tokens",
  "priority": "urgent",
  "dueDate": "2026-12-31",
  "assignedTo": [
    "member1@amalitechtraining.org",
    "member2@amalitechtraining.org"
  ],
  "tags": ["backend", "security"]
}
```

**Success Response (201 Created):**
```json
{
  "message": "Task created successfully",
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "task": {
    "taskId": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Build authentication API",
    "description": "Implement OAuth 2.0 with JWT tokens",
    "status": "pending",
    "priority": "urgent",
    "assignedTo": "member1@amalitechtraining.org",
    "assignedMembers": [
      "member1@amalitechtraining.org",
      "member2@amalitechtraining.org"
    ],
    "createdBy": "admin@amalitech.com",
    "createdAt": "2026-02-07T10:30:00.000Z",
    "updatedAt": "2026-02-07T10:30:00.000Z",
    "dueDate": "2026-12-31",
    "tags": ["backend", "security"]
  }
}
```

**Error Responses:**

*401 Unauthorized:*
```json
{
  "error": "Unauthorized",
  "message": "Missing or invalid authorization token"
}
```

*403 Forbidden (non-admin):*
```json
{
  "error": "Forbidden",
  "message": "Only admins can create tasks"
}
```

*400 Bad Request (invalid members):*
```json
{
  "error": "Invalid assigned members",
  "nonExistentUsers": ["fake@example.com"],
  "inactiveUsers": ["deactivated@amalitechtraining.org"],
  "adminUsers": ["admin2@amalitech.com"]
}
```

---

### PUT /tasks

**Description:** Update existing task

**Authorization:** Bearer {JWT_TOKEN}

**Permissions:**
- Admin: Can update all fields
- Member: Can only update status and add comments

**Request Body (Admin):**
```json
{
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Updated title",
  "description": "Updated description",
  "status": "in-progress",
  "priority": "high",
  "dueDate": "2026-11-30",
  "assignedTo": ["member3@amalitechtraining.org"],
  "tags": ["backend", "urgent"]
}
```

**Request Body (Member):**
```json
{
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "in-progress",
  "comment": "Started working on this task"
}
```

**Success Response (200 OK):**
```json
{
  "message": "Task updated successfully",
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "updates": {
    "status": "in-progress",
    "priority": "high",
    "updatedAt": "2026-02-07T14:22:00.000Z",
    "updatedBy": "member1@amalitechtraining.org"
  }
}
```

**Error Responses:**

*404 Not Found:*
```json
{
  "error": "Task not found",
  "taskId": "invalid-uuid"
}
```

*403 Forbidden (member not assigned):*
```json
{
  "error": "Forbidden",
  "message": "You are not assigned to this task"
}
```

*400 Bad Request (invalid status):*
```json
{
  "error": "Invalid status. Must be one of: pending, in-progress, completed, cancelled"
}
```

---

### GET /tasks

**Description:** Get tasks (filtered by role)

**Authorization:** Bearer {JWT_TOKEN}

**Filtering:**
- Admin: Returns all tasks
- Member: Returns only tasks where user is in assignedMembers array

**Success Response (200 OK):**
```json
{
  "tasks": [
    {
      "taskId": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Build authentication API",
      "description": "Implement OAuth 2.0",
      "status": "in-progress",
      "priority": "urgent",
      "assignedTo": "member1@amalitechtraining.org",
      "assignedMembers": [
        "member1@amalitechtraining.org",
        "member2@amalitechtraining.org"
      ],
      "createdBy": "admin@amalitech.com",
      "createdAt": "2026-02-07T10:30:00.000Z",
      "updatedAt": "2026-02-07T14:22:00.000Z",
      "updatedBy": "member1@amalitechtraining.org",
      "dueDate": "2026-12-31",
      "tags": ["backend", "security"],
      "comments": [
        {
          "author": "member1@amalitechtraining.org",
          "text": "Started working on this",
          "timestamp": "2026-02-07T14:22:00.000Z"
        }
      ]
    }
  ],
  "count": 1
}
```

**Error Response:**

*401 Unauthorized:*
```json
{
  "error": "Unauthorized",
  "message": "Missing or invalid authorization token"
}
```

---

### DELETE /tasks/{taskId}

**Description:** Delete task (Admin only)

**Authorization:** Bearer {JWT_TOKEN}

**Path Parameters:**
- `taskId` (required): UUID of task to delete

**Example:** `DELETE /tasks/550e8400-e29b-41d4-a716-446655440000`

**Success Response (200 OK):**
```json
{
  "message": "Task deleted successfully",
  "taskId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error Responses:**

*403 Forbidden (non-admin):*
```json
{
  "error": "Forbidden",
  "message": "Only admins can delete tasks"
}
```

*404 Not Found:*
```json
{
  "error": "Task not found",
  "taskId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### GET /users

**Description:** Get list of active members (Admin only)

**Authorization:** Bearer {JWT_TOKEN}

**Purpose:** Used by frontend TaskForm to populate member dropdown

**Success Response (200 OK):**
```json
{
  "users": [
    {
      "userId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "email": "member1@amalitechtraining.org",
      "role": "member",
      "status": "active"
    },
    {
      "userId": "8d9e7780-8536-51ef-945c-f18gd2g01bf8",
      "email": "member2@amalitechtraining.org",
      "role": "member",
      "status": "active"
    }
  ],
  "count": 2
}
```

**Filtering Applied:**
- Only returns users with `status === 'active'`
- Only returns users with `role === 'member'` (admins excluded)

**Error Response:**

*403 Forbidden (non-admin):*
```json
{
  "error": "Forbidden",
  "message": "Only admins can access user list"
}
```

---

## Complete User Journey

### Scenario: Admin Creates Urgent Task and Member Completes It

#### Phase 1: Admin Signup & Login

```
1. Admin visits: https://main.d1imuhf02uvucy.amplifyapp.com

2. Clicks "Create Account"
   - Enters: admin@amalitech.com
   - Password: SecurePass123!
   
3. Frontend calls Cognito SignUp API
   
4. Cognito triggers pre-signup.js:
   - Checks email domain
   - @amalitech.com ✅ allowed
   - Returns event (signup continues)
   
5. Cognito creates user with status: UNCONFIRMED
   
6. Cognito sends verification email to admin@amalitech.com
   
7. Admin checks email inbox
   - Subject: "Verify your email for Task Management System"
   - Clicks verification link
   
8. Cognito confirms user, triggers post-confirmation.js:
   - Determines role: admin (@amalitech.com)
   - Adds user to Cognito group 'admin'
   - Creates DynamoDB user record:
     {
       userId: "uuid-1",
       email: "admin@amalitech.com",
       role: "admin",
       status: "active",
       createdAt: "2026-02-07T09:00:00Z"
     }
   
9. User status: CONFIRMED ✅

10. Admin returns to app, clicks "Sign In"
    - Enters: admin@amalitech.com
    - Password: SecurePass123!
    
11. Cognito validates credentials ✅
    
12. Returns JWT token containing:
    {
      sub: "uuid-1",
      email: "admin@amalitech.com",
      cognito:groups: ["admin"],
      exp: 1707304800
    }
    
13. Frontend stores token in memory (Amplify handles)
    
14. useAuth hook checks token:
    - Sees 'admin' in cognito:groups
    - Sets role = 'admin'
    
15. Frontend shows admin view:
    - ✅ Create Task form visible
    - ✅ All tasks visible
```

---

#### Phase 2: Member Signup & Login

```
1. Member visits app, creates account
   - Email: member1@amalitechtraining.org
   - Password: MemberPass456!
   
2. pre-signup.js validates:
   - @amalitechtraining.org ✅ allowed
   
3. Verification email sent, member clicks link
   
4. post-confirmation.js:
   - Determines role: member
   - Adds to Cognito group 'member'
   - Creates DynamoDB record with role='member'
   
5. Member logs in, gets JWT with cognito:groups: ["member"]
   
6. Frontend shows member view:
   - ❌ Create Task form hidden
   - ✅ Only assigned tasks visible
```

---

#### Phase 3: Admin Creates Urgent Task

```
1. Admin fills task form:
   Title: "Fix production security vulnerability"
   Description: "Critical auth bypass discovered in API"
   Priority: urgent ⚠️
   Due Date: 2026-02-08 (tomorrow)
   
2. Admin clicks member dropdown (see arrow ▼)
   
3. Frontend calls: GET /users
   Headers: { Authorization: Bearer <admin-jwt> }
   
4. API Gateway validates admin JWT ✅
   
5. user-management.js Lambda:
   - Checks user is admin ✅
   - Scans users table
   - Filters: status='active' AND role='member'
   - Returns: [member1@amalitechtraining.org]
   
6. Frontend displays member1 in dropdown
   
7. Admin selects member1 (click)
   - Tag appears: "member1@amalitechtraining.org ×"
   
8. Admin clicks "Create Task" button
   
9. Frontend sends: POST /tasks
   Headers: { Authorization: Bearer <admin-jwt> }
   Body: {
     "title": "Fix production security vulnerability",
     "description": "Critical auth bypass discovered in API",
     "priority": "urgent",
     "dueDate": "2026-02-08",
     "assignedTo": ["member1@amalitechtraining.org"]
   }
   
10. API Gateway validates JWT ✅
    
11. create-task.js Lambda executes:
    
    Step 1: Validate auth
      - Extract email: admin@amalitech.com
      - Extract role: admin (from cognito:groups)
      ✅ User authenticated
    
    Step 2: Check admin role
      - role === 'admin' ✅
    
    Step 3: Validate request
      - title ✅ present
      - description ✅ present
      - assignedTo ✅ array with 1 email
    
    Step 4: Validate assigned members
      - Query users table by EmailIndex
      - member1@amalitechtraining.org:
        * Exists ✅
        * status = 'active' ✅
        * role = 'member' ✅
      - No duplicates ✅
      ✅ All members valid
    
    Step 5: Create task object
      {
        taskId: "uuid-task-1",
        title: "Fix production security vulnerability",
        description: "Critical auth bypass discovered in API",
        status: "pending",
        priority: "urgent",
        assignedTo: "member1@amalitechtraining.org",
        assignedMembers: ["member1@amalitechtraining.org"],
        createdBy: "admin@amalitech.com",
        createdAt: "2026-02-07T15:30:00Z",
        updatedAt: "2026-02-07T15:30:00Z",
        dueDate: "2026-02-08",
        tags: []
      }
    
    Step 6: Save to DynamoDB tasks table ✅
    
    Step 7: Send email notification
      - Check: priority === 'urgent' ✅ YES
      - Build urgent email:
        
        To: member1@amalitechtraining.org
        From: abraham.gyamfi@amalitech.com
        Subject: 🚨 URGENT: New Task Assigned
        
        Body:
        ⚠️ THIS IS AN URGENT TASK - IMMEDIATE ATTENTION REQUIRED ⚠️
        
        You have been assigned to task: "Fix production security vulnerability"
        
        Description: Critical auth bypass discovered in API
        
        Status: pending
        Priority: URGENT
        
        Please prioritize this task immediately.
        
        You can view and update this task in the Task Management System.
        
      - Call SES sendEmail() ✅
      - Email queued for delivery
    
    Step 8: Return response
      {
        "message": "Task created successfully",
        "taskId": "uuid-task-1",
        "task": {...}
      }
      
12. Frontend receives 201 Created
    
13. Shows success message: "Task created! ✅"
    
14. Refreshes task list (calls GET /tasks)
    
15. Admin sees new task card:
    - Red border (urgent)
    - 🚨 URGENT badge
    - Status: pending
    - Due: Tomorrow
    
16. Member1 receives email (within seconds)
    - Opens inbox
    - Sees: 🚨 URGENT: New Task Assigned
    - Reads urgent warning banner
```

---

#### Phase 4: Member Updates Task

```
1. Member1 opens email, clicks task link (if implemented)
   OR navigates to app manually
   
2. Member1 logs in (if not already)
   - JWT contains cognito:groups: ["member"]
   
3. Frontend calls: GET /tasks
   Headers: { Authorization: Bearer <member-jwt> }
   
4. API Gateway validates JWT ✅
   
5. get-tasks.js Lambda:
   - Extracts email: member1@amalitechtraining.org
   - Extracts role: member
   - Scans tasks table
   - Filters: task.assignedMembers includes member1 email
   - Returns: [task-with-uuid-task-1]
   
6. Frontend displays task card:
   - Red border (urgent)
   - 🚨 badge
   - Status: pending
   - Member sees only this task (no other tasks visible)
   
7. Member1 clicks status dropdown
   - Options: pending, in-progress, completed, cancelled
   - Selects: "in-progress"
   
8. Frontend sends: PUT /tasks
   Headers: { Authorization: Bearer <member-jwt> }
   Body: {
     "taskId": "uuid-task-1",
     "status": "in-progress"
   }
   
9. API Gateway validates JWT ✅
   
10. update-task.js Lambda executes:
    
    Step 1: Validate auth
      - Email: member1@amalitechtraining.org
      - Role: member
    
    Step 2: Get task from DynamoDB
      - taskId: uuid-task-1 ✅ found
    
    Step 3: Check permissions
      - Role is member
      - Check: member1 in task.assignedMembers ✅ YES
      - Update type: status only ✅ allowed
    
    Step 4: Validate status
      - "in-progress" is valid ✅
    
    Step 5: Update DynamoDB
      - Set status = "in-progress"
      - Set updatedAt = "2026-02-07T15:45:00Z"
      - Set updatedBy = "member1@amalitechtraining.org"
      ✅ Updated
    
    Step 6: Send notifications
      - Status changed from "pending" to "in-progress"
      - Recipients:
        * task.createdBy = admin@amalitech.com ✅ notify
        * task.assignedMembers = [member1] - exclude changer ❌
      
      - Send email to admin:
        To: admin@amalitech.com
        Subject: Task Status Updated
        Body:
        Task "Fix production security vulnerability" status changed to "in-progress" by member1@amalitechtraining.org
      
      - Call SES sendEmail() ✅
    
    Step 7: Return response
      {
        "message": "Task updated successfully",
        "taskId": "uuid-task-1",
        "updates": {...}
      }
      
11. Frontend receives 200 OK
    
12. Task card updates immediately:
    - Status badge changes: pending (yellow) → in-progress (blue)
    
13. Admin receives email notification
    - "Task Status Updated"
    - Sees member1 is now working on it
```

---

#### Phase 5: Member Completes Task

```
1. Member1 works on task, fixes the vulnerability
   
2. Changes status: "in-progress" → "completed"
   
3. Adds comment: "Fixed auth bypass, deployed patch v1.2.3"
   
4. Frontend sends: PUT /tasks
   Body: {
     "taskId": "uuid-task-1",
     "status": "completed",
     "comment": "Fixed auth bypass, deployed patch v1.2.3"
   }
   
5. update-task.js Lambda:
   - Updates status ✅
   - Appends comment to task.comments array
   - Sends notification to admin
   
6. Admin receives: "Task Status Updated to completed"
   
7. Admin views task:
   - Status: completed (green badge)
   - Comment visible: "Fixed auth bypass, deployed patch v1.2.3"
   
8. Admin marks verification complete
   
✅ Task lifecycle complete
```

---

## Summary Statistics

**Resources Created:**
- 1 Cognito User Pool
- 2 Cognito User Groups
- 1 Cognito User Pool Client
- 8 Lambda Functions
- 8 CloudWatch Log Groups
- 1 API Gateway REST API
- 6 API Endpoints (+ OPTIONS)
- 2 DynamoDB Tables
- 1 DynamoDB GSI
- 1 SES Email Identity
- 1 SNS Topic
- 1 Amplify App
- Various IAM Roles & Policies

**Lines of Code:**
- Lambda Functions: ~2000 lines (JavaScript)
- Frontend: ~1500 lines (React + CSS)
- Terraform: ~1200 lines (HCL)

**Total Infrastructure Cost (Estimated):**
- Lambda: $0-$2/month (pay per invoke)
- DynamoDB: $0-$5/month (pay per request)
- API Gateway: $0-$3/month (first 1M requests free)
- Cognito: Free (first 50k MAUs)
- SES: $0.10 per 1000 emails
- Amplify: $0.01 per build minute + $0.15/GB served

**Approximate Monthly Cost: $5-15** (low usage)

---

## Conclusion

This serverless task management system demonstrates modern cloud-native architecture with:
- ✅ Zero server management
- ✅ Automatic scaling
- ✅ Pay-per-use pricing
- ✅ High availability (multi-AZ by default)
- ✅ Security best practices
- ✅ Infrastructure as Code
- ✅ CI/CD via Amplify

Perfect for small to medium teams with variable workload patterns.

---

*Last Updated: February 7, 2026*
*Version: 1.0*
*Maintainer: Task Management Team*
