const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const {
    getUserRole,
    checkUserActive,
    sendNotificationEmail,
    response,
    validateAuth,
    validateEmails,
    buildUpdateExpression,
    validateAssignedMembers,
    TASKS_TABLE,
    USERS_TABLE,
    dynamodb
} = require('./shared-utils');

exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    
    try {
        const { httpMethod, pathParameters, body, requestContext } = event;
        
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
        
        switch (httpMethod) {
            case 'GET':
                return await getTasks(userEmail, userRole, pathParameters);
            case 'POST':
                return await createTask(JSON.parse(body), userEmail, userRole);
            case 'PUT':
                return await updateTask(JSON.parse(body), userEmail, userRole);
            case 'DELETE':
                return await deleteTask(pathParameters, userEmail, userRole);
            default:
                return response(405, { error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('Error:', error);
        return response(500, { 
            error: 'Internal server error', 
            message: error.message 
        });
    }
};

async function getTasks(userEmail, userRole, pathParameters) {
    try {
        let tasks;
        
        // Check if requesting a specific task
        if (pathParameters && pathParameters.taskId) {
            const result = await dynamodb.get({
                TableName: TASKS_TABLE,
                Key: { taskId: pathParameters.taskId }
            }).promise();
            
            if (!result.Item) {
                return response(404, { error: 'Task not found' });
            }
            
            const task = result.Item;
            
            // Check permissions - members can only see tasks assigned to them
            if (userRole !== 'admin') {
                const isAssigned = task.assignedMembers && 
                                  task.assignedMembers.includes(userEmail);
                if (!isAssigned) {
                    return response(403, { 
                        error: 'Forbidden - You can only view tasks assigned to you' 
                    });
                }
            }
            
            return response(200, { task });
        }
        
        if (userRole === 'admin') {
            // Admins can see all tasks
            const result = await dynamodb.scan({
                TableName: TASKS_TABLE
            }).promise();
            tasks = result.Items || [];
        } else {
            // Members can only see tasks assigned to them
            // Since DynamoDB doesn't support 'contains' in KeyConditionExpression,
            // we'll scan and filter
            const result = await dynamodb.scan({
                TableName: TASKS_TABLE
            }).promise();
            
            // Filter to only tasks where user is in assignedMembers array
            tasks = (result.Items || []).filter(task => 
                task.assignedMembers && task.assignedMembers.includes(userEmail)
            );
        }
        
        // Sort by creation date (newest first)
        tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        return response(200, { 
            tasks, 
            count: tasks.length,
            userRole
        });
    } catch (error) {
        console.error('Error fetching tasks:', error);
        throw new Error(`Failed to get tasks: ${error.message}`);
    }
}

async function createTask(taskData, userEmail, userRole) {
    // Only admins can create tasks
    if (userRole !== 'admin') {
        return response(403, { error: 'Forbidden - Only admins can create tasks' });
    }
    
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
    
    // Verify all assigned users are active and exist
    const { inactiveUsers, nonExistentUsers } = await validateAssignedMembers(assignedMembers);
    
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
        const notifications = assignedMembers.map(memberEmail => 
            sendNotificationEmail(
                memberEmail,
                'New Task Assigned to You',
                `You have been assigned a new task:\n\nTitle: ${task.title}\n\nDescription: ${task.description}\n\nPriority: ${task.priority}\n\nDue Date: ${task.dueDate || 'Not set'}\n\nAssigned by: ${userEmail}\n\nStatus: ${task.status}`
            )
        );
        
        await Promise.allSettled(notifications);
        
        return response(201, { 
            message: 'Task created successfully', 
            task 
        });
    } catch (error) {
        console.error('Error creating task:', error);
        throw new Error(`Failed to create task: ${error.message}`);
    }
}

async function updateTask(updateData, userEmail, userRole) {
    try {
        const { taskId, status, ...otherUpdates } = updateData;
        
        if (!taskId) {
            return response(400, { error: 'Missing required field: taskId' });
        }
        
        // Get current task
        const currentTask = await dynamodb.get({
            TableName: TASKS_TABLE,
            Key: { taskId }
        }).promise();
        
        if (!currentTask.Item) {
            return response(404, { error: 'Task not found' });
        }
        
        const task = currentTask.Item;
        
        // Check permissions
        const isAssignedMember = task.assignedMembers && 
                                task.assignedMembers.includes(userEmail);
        
        if (userRole !== 'admin' && !isAssignedMember) {
            return response(403, { 
                error: 'Forbidden - You can only update tasks assigned to you' 
            });
        }
        
        // Build updates based on role
        let updates = {};
        let reassignmentOccurred = false;
        const validStatuses = ['pending', 'in-progress', 'completed', 'blocked', 'cancelled'];
        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        
        if (userRole === 'admin') {
            // Admins can update everything
            
            // Validate status if provided
            if (status) {
                if (!validStatuses.includes(status)) {
                    return response(400, { 
                        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
                    });
                }
                updates.status = status;
            }
            
            // Validate priority if provided
            if (otherUpdates.priority && !validPriorities.includes(otherUpdates.priority)) {
                return response(400, { 
                    error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}` 
                });
            }
            
            // Validate due date if provided
            if (otherUpdates.dueDate && otherUpdates.dueDate !== null) {
                const dueDate = new Date(otherUpdates.dueDate);
                if (isNaN(dueDate.getTime())) {
                    return response(400, { error: 'Invalid due date format' });
                }
            }
            
            // Copy other allowed fields
            if (otherUpdates.title) updates.title = otherUpdates.title.trim();
            if (otherUpdates.description) updates.description = otherUpdates.description.trim();
            if (otherUpdates.priority) updates.priority = otherUpdates.priority;
            if ('dueDate' in otherUpdates) updates.dueDate = otherUpdates.dueDate;
            if (otherUpdates.tags) updates.tags = otherUpdates.tags;
            
            // Handle assignment updates
            if (otherUpdates.assignedTo) {
                const emailValidation = validateEmails(otherUpdates.assignedTo);
                
                if (!emailValidation.valid) {
                    if (emailValidation.emails.length === 0) {
                        return response(400, { error: 'At least one member must be assigned' });
                    }
                    return response(400, { 
                        error: 'Invalid email addresses', 
                        invalidEmails: emailValidation.invalid 
                    });
                }
                
                const uniqueNewMembers = emailValidation.emails;
                
                // Check for inactive users and non-existent users
                const validationResult = await validateAssignedMembers(uniqueNewMembers);
                
                if (validationResult.nonExistentUsers.length > 0) {
                    return response(400, { 
                        error: 'Some users do not exist in the system', 
                        nonExistentUsers: validationResult.nonExistentUsers 
                    });
                }
                
                if (validationResult.inactiveUsers.length > 0) {
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
                
                updates.assignedMembers = uniqueNewMembers;
                updates.assignedTo = uniqueNewMembers[0];
                reassignmentOccurred = true;
            }
        } else {
            // Members can only update status
            if (status) {
                if (!validStatuses.includes(status)) {
                    return response(400, { 
                        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
                    });
                }
                updates.status = status;
            }
            
            // Members can add comments
            if (otherUpdates.comment && otherUpdates.comment.trim()) {
                const existingComments = task.comments || [];
                updates.comments = [
                    ...existingComments,
                    {
                        author: userEmail,
                        text: otherUpdates.comment.trim(),
                        timestamp: new Date().toISOString()
                    }
                ];
            }
            
            if (Object.keys(updates).length === 0) {
                return response(400, { error: 'No valid updates provided' });
            }
        }
        
        if (Object.keys(updates).length === 0) {
            return response(400, { error: 'No updates provided' });
        }
        
        updates.updatedAt = new Date().toISOString();
        updates.updatedBy = userEmail;
        
        // Build DynamoDB update expression
        const updateParams = buildUpdateExpression(updates);
        
        // Update the task
        await dynamodb.update({
            TableName: TASKS_TABLE,
            Key: { taskId },
            ...updateParams
        }).promise();
        
        // Send notifications based on what changed
        const notifications = [];
        
        // Status change notifications - notify admin and all assigned members
        if (status && status !== task.status) {
            // Notify admin/creator (if they didn't make the change)
            if (task.createdBy && task.createdBy !== userEmail) {
                notifications.push(
                    sendNotificationEmail(
                        task.createdBy,
                        'Task Status Updated',
                        `Task "${task.title}" status changed from "${task.status}" to "${status}" by ${userEmail}`
                    )
                );
            }
            
            // Notify all assigned members (except the one who made the change)
            if (task.assignedMembers) {
                task.assignedMembers
                    .filter(email => email !== userEmail)
                    .forEach(email => {
                        notifications.push(
                            sendNotificationEmail(
                                email,
                                'Task Status Updated',
                                `Task "${task.title}" status changed to "${status}" by ${userEmail}`
                            )
                        );
                    });
            }
        }
        
        // Assignment change notifications
        if (reassignmentOccurred && updates.assignedMembers) {
            const oldMembers = task.assignedMembers || [];
            const newMembers = updates.assignedMembers.filter(
                email => !oldMembers.includes(email)
            );
            const removedMembers = oldMembers.filter(
                email => !updates.assignedMembers.includes(email)
            );
            
            // Notify new members
            newMembers.forEach(email => {
                notifications.push(
                    sendNotificationEmail(
                        email,
                        'New Task Assigned',
                        `You have been assigned to task: "${task.title}"\n\nDescription: ${task.description}\n\nStatus: ${updates.status || task.status}\n\nPriority: ${updates.priority || task.priority}`
                    )
                );
            });
            
            // Notify removed members
            removedMembers.forEach(email => {
                notifications.push(
                    sendNotificationEmail(
                        email,
                        'Task Assignment Removed',
                        `You have been removed from task: "${task.title}"`
                    )
                );
            });
        }
        
        await Promise.allSettled(notifications);
        
        return response(200, { 
            message: 'Task updated successfully',
            taskId,
            updates
        });
   } catch (error) {
        console.error('Error updating task:', error);
        throw new Error(`Failed to update task: ${error.message}`);
    }
}

async function deleteTask(pathParameters, userEmail, userRole) {
    // Only admins can delete/close tasks
    if (userRole !== 'admin') {
        return response(403, { error: 'Forbidden - Only admins can delete tasks' });
    }
    
    if (!pathParameters || !pathParameters.taskId) {
        return response(400, { error: 'Missing required parameter: taskId' });
    }
    
    const taskId = pathParameters.taskId;
    
    try {
        // Get task details for notifications
        const taskResult = await dynamodb.get({
            TableName: TASKS_TABLE,
            Key: { taskId }
        }).promise();
        
        if (!taskResult.Item) {
            return response(404, { error: 'Task not found' });
        }
        
        const task = taskResult.Item;
        
        // Delete the task
        await dynamodb.delete({
            TableName: TASKS_TABLE,
            Key: { taskId }
        }).promise();
        
        // Notify all assigned members about task closure
        const notifications = [];
        if (task.assignedMembers && task.assignedMembers.length > 0) {
            task.assignedMembers.forEach(memberEmail => {
                notifications.push(
                    sendNotificationEmail(
                        memberEmail,
                        'Task Closed',
                        `Task "${task.title}" has been closed by ${userEmail}.\n\nDescription: ${task.description}\n\nFinal Status: ${task.status}`
                    )
                );
            });
        }
        
        await Promise.allSettled(notifications);
        
        return response(200, { 
            message: 'Task deleted successfully',
            taskId 
        });
    } catch (error) {
        console.error('Error deleting task:', error);
        throw new Error(`Failed to delete task: ${error.message}`);
    }
}