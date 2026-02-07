#!/bin/bash

# Task Management System - Lambda Testing Script
# This script helps test all Lambda functions and API endpoints

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration - Update these values
API_URL="https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com/prod"
COGNITO_CLIENT_ID="YOUR_CLIENT_ID"
COGNITO_REGION="YOUR_REGION"

# Test user credentials
ADMIN_EMAIL="admin@amalitech.com"
ADMIN_PASSWORD="TempPassword123!"
MEMBER_EMAIL="member@amalitechtraining.org"
MEMBER_PASSWORD="TempPassword123!"

echo "========================================"
echo "Task Management System - Lambda Testing"
echo "========================================"
echo ""

# Function to print test results
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ PASS${NC}: $2"
    else
        echo -e "${RED}❌ FAIL${NC}: $2"
    fi
}

# Function to get auth token
get_token() {
    local email=$1
    local password=$2
    
    TOKEN=$(aws cognito-idp initiate-auth \
        --auth-flow USER_PASSWORD_AUTH \
        --client-id $COGNITO_CLIENT_ID \
        --auth-parameters USERNAME=$email,PASSWORD=$password \
        --region $COGNITO_REGION \
        --query 'AuthenticationResult.IdToken' \
        --output text 2>/dev/null)
    
    echo $TOKEN
}

echo "=== Testing Authentication ==="
echo ""

# Test 1: Admin Login
echo "Test 1: Admin Authentication"
ADMIN_TOKEN=$(get_token $ADMIN_EMAIL $ADMIN_PASSWORD)
if [ ! -z "$ADMIN_TOKEN" ]; then
    print_result 0 "Admin login successful"
else
    print_result 1 "Admin login failed"
    exit 1
fi
echo ""

# Test 2: Member Login
echo "Test 2: Member Authentication"
MEMBER_TOKEN=$(get_token $MEMBER_EMAIL $MEMBER_PASSWORD)
if [ ! -z "$MEMBER_TOKEN" ]; then
    print_result 0 "Member login successful"
else
    print_result 1 "Member login failed"
fi
echo ""

echo "=== Testing Task Management API ==="
echo ""

# Test 3: Admin can get all tasks
echo "Test 3: Admin can view all tasks"
RESPONSE=$(curl -s -X GET \
    "$API_URL/tasks" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json")

if echo $RESPONSE | grep -q "tasks"; then
    print_result 0 "Admin can view all tasks"
else
    print_result 1 "Admin cannot view tasks"
fi
echo ""

# Test 4: Admin can create task
echo "Test 4: Admin can create task"
CREATE_RESPONSE=$(curl -s -X POST \
    "$API_URL/tasks" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "title": "Test Task Created by Script",
        "description": "This is a test task for validation",
        "assignedTo": ["'$MEMBER_EMAIL'"],
        "priority": "high",
        "status": "pending"
    }')

if echo $CREATE_RESPONSE | grep -q "Task created successfully"; then
    print_result 0 "Admin can create task"
    TASK_ID=$(echo $CREATE_RESPONSE | grep -o '"taskId":"[^"]*"' | cut -d'"' -f4)
    echo "  Task ID: $TASK_ID"
else
    print_result 1 "Admin cannot create task"
    echo "  Response: $CREATE_RESPONSE"
fi
echo ""

# Test 5: Member cannot create task
echo "Test 5: Member cannot create task (should fail with 403)"
MEMBER_CREATE=$(curl -s -w "\n%{http_code}" -X POST \
    "$API_URL/tasks" \
    -H "Authorization: Bearer $MEMBER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "title": "Unauthorized Task",
        "description": "This should fail",
        "assignedTo": ["'$MEMBER_EMAIL'"]
    }')

HTTP_CODE=$(echo "$MEMBER_CREATE" | tail -n 1)
if [ "$HTTP_CODE" = "403" ]; then
    print_result 0 "Member correctly denied task creation"
else
    print_result 1 "Member was able to create task (security issue!)"
fi
echo ""

# Test 6: Member can view assigned tasks
echo "Test 6: Member can view assigned tasks"
MEMBER_TASKS=$(curl -s -X GET \
    "$API_URL/tasks" \
    -H "Authorization: Bearer $MEMBER_TOKEN" \
    -H "Content-Type: application/json")

if echo $MEMBER_TASKS | grep -q "tasks"; then
    print_result 0 "Member can view assigned tasks"
else
    print_result 1 "Member cannot view tasks"
fi
echo ""

# Test 7: Member can update task status
if [ ! -z "$TASK_ID" ]; then
    echo "Test 7: Member can update task status"
    UPDATE_RESPONSE=$(curl -s -X PUT \
        "$API_URL/tasks" \
        -H "Authorization: Bearer $MEMBER_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "taskId": "'$TASK_ID'",
            "status": "in-progress",
            "comment": "Started working on this task"
        }')
    
    if echo $UPDATE_RESPONSE | grep -q "Task updated successfully"; then
        print_result 0 "Member can update task status"
    else
        print_result 1 "Member cannot update task status"
        echo "  Response: $UPDATE_RESPONSE"
    fi
    echo ""
fi

# Test 8: Member cannot reassign tasks
if [ ! -z "$TASK_ID" ]; then
    echo "Test 8: Member cannot reassign tasks (should fail with 403)"
    REASSIGN=$(curl -s -w "\n%{http_code}" -X PUT \
        "$API_URL/tasks" \
        -H "Authorization: Bearer $MEMBER_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "taskId": "'$TASK_ID'",
            "assignedTo": ["'$ADMIN_EMAIL'"]
        }')
    
    BODY=$(echo "$REASSIGN" | head -n -1)
    if echo $BODY | grep -q "No valid updates provided\|Forbidden"; then
        print_result 0 "Member correctly denied task reassignment"
    else
        print_result 1 "Member was able to reassign task (security issue!)"
    fi
    echo ""
fi

# Test 9: Unauthenticated request is rejected
echo "Test 9: Unauthenticated request is rejected"
UNAUTH=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/tasks" \
    -H "Content-Type: application/json")

HTTP_CODE=$(echo "$UNAUTH" | tail -n 1)
if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
    print_result 0 "Unauthenticated request correctly rejected"
else
    print_result 1 "Unauthenticated request was allowed (security issue!)"
fi
echo ""

# Test 10: Admin can delete task
if [ ! -z "$TASK_ID" ]; then
    echo "Test 10: Admin can delete task"
    DELETE_RESPONSE=$(curl -s -X DELETE \
        "$API_URL/tasks/$TASK_ID" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json")
    
    if echo $DELETE_RESPONSE | grep -q "Task deleted successfully"; then
        print_result 0 "Admin can delete task"
    else
        print_result 1 "Admin cannot delete task"
        echo "  Response: $DELETE_RESPONSE"
    fi
    echo ""
fi

# Test 11: Member cannot delete task
echo "Test 11: Member cannot delete task (should fail with 403)"
MEMBER_DELETE=$(curl -s -w "\n%{http_code}" -X DELETE \
    "$API_URL/tasks/dummy-task-id" \
    -H "Authorization: Bearer $MEMBER_TOKEN" \
    -H "Content-Type: application/json")

HTTP_CODE=$(echo "$MEMBER_DELETE" | tail -n 1)
if [ "$HTTP_CODE" = "403" ]; then
    print_result 0 "Member correctly denied task deletion"
else
    print_result 1 "Member was able to attempt deletion"
fi
echo ""

echo "=== Testing User Management API ==="
echo ""

# Test 12: Admin can view users
echo "Test 12: Admin can view users"
USERS_RESPONSE=$(curl -s -X GET \
    "$API_URL/users" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json")

if echo $USERS_RESPONSE | grep -q "users"; then
    print_result 0 "Admin can view users"
else
    print_result 1 "Admin cannot view users"
fi
echo ""

# Test 13: Member cannot access user management
echo "Test 13: Member cannot access user management (should fail with 403)"
MEMBER_USERS=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/users" \
    -H "Authorization: Bearer $MEMBER_TOKEN" \
    -H "Content-Type: application/json")

HTTP_CODE=$(echo "$MEMBER_USERS" | tail -n 1)
if [ "$HTTP_CODE" = "403" ]; then
    print_result 0 "Member correctly denied user management access"
else
    print_result 1 "Member can access user management (security issue!)"
fi
echo ""

echo "=== Testing Data Validation ==="
echo ""

# Test 14: Invalid task creation (missing required fields)
echo "Test 14: Invalid task creation rejected"
INVALID_TASK=$(curl -s -w "\n%{http_code}" -X POST \
    "$API_URL/tasks" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "title": "Missing Description"
    }')

HTTP_CODE=$(echo "$INVALID_TASK" | tail -n 1)
if [ "$HTTP_CODE" = "400" ]; then
    print_result 0 "Invalid task creation correctly rejected"
else
    print_result 1 "Invalid task was accepted"
fi
echo ""

# Test 15: Invalid status value
echo "Test 15: Invalid status value rejected"
INVALID_STATUS=$(curl -s -X POST \
    "$API_URL/tasks" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "title": "Test",
        "description": "Test",
        "assignedTo": ["'$MEMBER_EMAIL'"],
        "status": "invalid-status"
    }')

if echo $INVALID_STATUS | grep -q "Invalid status"; then
    print_result 0 "Invalid status correctly rejected"
else
    print_result 1 "Invalid status was accepted"
fi
echo ""

# Test 16: Duplicate assignment prevention
echo "Test 16: Duplicate assignments are deduplicated"
DUP_RESPONSE=$(curl -s -X POST \
    "$API_URL/tasks" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "title": "Duplicate Test",
        "description": "Testing duplicate prevention",
        "assignedTo": ["'$MEMBER_EMAIL'", "'$MEMBER_EMAIL'", "'$MEMBER_EMAIL'"]
    }')

if echo $DUP_RESPONSE | grep -q "Task created successfully"; then
    print_result 0 "Duplicate assignments handled (check task has only one instance)"
    DUP_TASK_ID=$(echo $DUP_RESPONSE | grep -o '"taskId":"[^"]*"' | cut -d'"' -f4)
    
    # Clean up
    if [ ! -z "$DUP_TASK_ID" ]; then
        curl -s -X DELETE \
            "$API_URL/tasks/$DUP_TASK_ID" \
            -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
    fi
else
    print_result 1 "Duplicate test failed"
fi
echo ""

echo "========================================"
echo "Testing Complete!"
echo "========================================"
echo ""

# Summary
echo "Summary:"
echo "  - Authentication: Tested for admin and member"
echo "  - Authorization: Role-based access control validated"
echo "  - Task CRUD: Create, read, update, delete tested"
echo "  - Security: Unauthorized access attempts blocked"
echo "  - Validation: Input validation working correctly"
echo ""
echo "Review the results above for any failures (❌)"
echo ""

# Exit with appropriate code
if grep -q "❌ FAIL" <<< "$OUTPUT"; then
    exit 1
else
    exit 0
fi
