/**
 * Create Task Lambda Function
 * Handles task creation (admin only)
 * Validates all inputs and sends notifications to assigned members
 */

const { v4: uuidv4 } = require('uuid');
const {
    getUserRole,
    checkUserActive,
    sendNotificationEmail,
    response,
    validateAuth,
    validateEmails,
    validateAssignedMembers,
    TASKS_TABLE,
    dynamodb
} = require('./shared-utils');

exports.handler = async (event) => {
    console.log('Create Task Event:', JSON.stringify(event, null, 2));
    
    try {
        const { body, requestContext } = event;
        
        // Validate authentication
        const authResult = validateAuth(requestContext);
        if (!authResult.valid) {
            return authResult.error;
        }
        
        const userEmail = authResult.userEmail;
        const userRole = await getUserRole(userEmail);
        
        // Verify user is active
        const isActiveUser = await checkUserActive(userEmail);
        if (!isActiveUser) {
            return response(403, { error: 'Account is deactivated' });
        }
        
        // Only admins can create tasks
        if (userRole !== 'admin') {
            return response(403, { error: 'Forbidden - Only admins can create tasks' });
        }
        
        const taskData = JSON.parse(body);
        return await createTask(taskData, userEmail);
    } catch (error) {
        console.error('Error:', error);
        return response(500, { 
            error: 'Internal server error', 
            message: error.message 
        });
    }
};

async function createTask(taskData, userEmail) {
    // Validate required fields
    if (!taskData.title || !taskData.description) {
        return response(400, { error: 'Missing required fields: title and description' });
    }
    
    // Validate and deduplicate assigned members
    const emailValidation = validateEmails(taskData.assignedTo || []);
    
    if (!emailValidation.valid) {
        if (emailValidation.emails.length === 0) {
            return response(400, { error: 'At least one member must be assigned' });
        }
        return response(400, { 
            error: 'Invalid email addresses', 
            invalidEmails: emailValidation.invalid 
        });
    }
    
    const assignedMembers = emailValidation.emails;
    
    // Verify all assigned users are active members (not admins)
    const { inactiveUsers, nonExistentUsers, adminUsers } = await validateAssignedMembers(assignedMembers);
    
    if (nonExistentUsers.length > 0) {
        return response(400, { 
            error: 'Some users do not exist in the system', 
            nonExistentUsers 
        });
    }
    
    if (inactiveUsers.length > 0) {
        return response(400, { 
            error: 'Cannot assign to deactivated users', 
            inactiveUsers 
        });
    }
    
    if (adminUsers.length > 0) {
        return response(400, { 
            error: 'Cannot assign tasks to admins. Admins manage tasks, only members can be assigned tasks.', 
            adminUsers 
        });
    }
    
    // Validate status
    const validStatuses = ['pending', 'in-progress', 'completed', 'blocked', 'cancelled'];
    const status = taskData.status || 'pending';
    if (!validStatuses.includes(status)) {
        return response(400, { 
            error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
        });
    }
    
    // Validate priority
    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    const priority = taskData.priority || 'medium';
    if (!validPriorities.includes(priority)) {
        return response(400, { 
            error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}` 
        });
    }
    
    // Validate due date if provided
    if (taskData.dueDate) {
        const dueDate = new Date(taskData.dueDate);
        if (isNaN(dueDate.getTime())) {
            return response(400, { error: 'Invalid due date format' });
        }
    }
    
    const taskId = uuidv4();
    const task = {
        taskId,
        title: taskData.title.trim(),
        description: taskData.description.trim(),
        status,
        assignedMembers,
        assignedTo: assignedMembers[0], // For GSI compatibility
        createdBy: userEmail,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        priority,
        dueDate: taskData.dueDate || null,
        tags: taskData.tags || [],
        comments: []
    };
    
    try {
        // Create the task
        await dynamodb.put({
            TableName: TASKS_TABLE,
            Item: task
        }).promise();
        
        // Send notification emails to all assigned members
        console.log(`Sending task creation notifications to ${assignedMembers.length} members:`, assignedMembers);
        
        const isUrgent = task.priority === 'urgent';
        const emailSubject = isUrgent 
            ? '🚨 URGENT: New Task Assigned to You' 
            : 'New Task Assigned to You';
        
        const urgentWarning = isUrgent 
            ? '\n⚠️ THIS IS AN URGENT TASK - IMMEDIATE ATTENTION REQUIRED ⚠️\n' 
            : '';
        
        const notifications = assignedMembers.map(memberEmail => 
            sendNotificationEmail(
                memberEmail,
                emailSubject,
                `${urgentWarning}\nYou have been assigned a new task:\n\nTitle: ${task.title}\n\nDescription: ${task.description}\n\nPriority: ${task.priority.toUpperCase()}\n\nDue Date: ${task.dueDate || 'Not set'}\n\nAssigned by: ${userEmail}\n\nStatus: ${task.status}${urgentWarning ? '\n\nPlease prioritize this task immediately.' : ''}`
            )
        );
        
        await Promise.allSettled(notifications);
        console.log(`Task creation notifications sent successfully`);
        
        return response(201, { 
            message: 'Task created successfully', 
            task 
        });
    } catch (error) {
        console.error('Error creating task:', error);
        return response(500, { 
            error: 'Failed to create task', 
            message: error.message 
        });
    }
}
