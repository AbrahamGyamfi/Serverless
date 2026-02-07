/**
 * Update Task Lambda Function
 * Handles task updates with role-based permissions
 * Admins can update all fields, members can only update status and add comments
 */

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
    dynamodb
} = require('./shared-utils');

exports.handler = async (event) => {
    console.log('Update Task Event:', JSON.stringify(event, null, 2));
    
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
        
        const updateData = JSON.parse(body);
        return await updateTask(updateData, userEmail, userRole);
    } catch (error) {
        console.error('Error:', error);
        return response(500, { 
            error: 'Internal server error', 
            message: error.message 
        });
    }
};

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
                
                // Check for inactive users, non-existent users, and admin users
                const validationResult = await validateAssignedMembers(uniqueNewMembers);
                
                if (validationResult.nonExistentUsers.length > 0) {
                    return response(400, { 
                        error: 'Some users do not exist in the system', 
                        nonExistentUsers: validationResult.nonExistentUsers 
                    });
                }
                
                if (validationResult.inactiveUsers.length > 0) {
                    return response(400, { 
                        error: 'Cannot assign to deactivated users', 
                        inactiveUsers: validationResult.inactiveUsers 
                    });
                }
                
                if (validationResult.adminUsers.length > 0) {
                    return response(400, { 
                        error: 'Cannot assign tasks to admins. Admins manage tasks, only members can be assigned tasks.', 
                        adminUsers: validationResult.adminUsers 
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
        
        // Priority change to urgent - notify all assigned members
        if (updates.priority === 'urgent' && task.priority !== 'urgent') {
            const assignedMembers = updates.assignedMembers || task.assignedMembers || [];
            assignedMembers.forEach(email => {
                const urgentWarning = '\n⚠️ THIS TASK IS NOW URGENT - IMMEDIATE ATTENTION REQUIRED ⚠️\n';
                notifications.push(
                    sendNotificationEmail(
                        email,
                        '🚨 URGENT: Task Priority Changed',
                        `${urgentWarning}\nTask: "${task.title}"\n\nThe priority of this task has been changed to URGENT by ${userEmail}.\n\nDescription: ${task.description}\n\nStatus: ${updates.status || task.status}\n\nPlease prioritize this task immediately.`
                    )
                );
            });
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
            
            // Check if task is urgent (either in updates or existing priority)
            const isUrgent = (updates.priority || task.priority) === 'urgent';
            const emailSubject = isUrgent ? '🚨 URGENT: New Task Assigned' : 'New Task Assigned';
            const urgentWarning = isUrgent ? '\n⚠️ THIS IS AN URGENT TASK - IMMEDIATE ATTENTION REQUIRED ⚠️\n' : '';
            const urgentMessage = isUrgent ? '\n\nPlease prioritize this task immediately.' : '';
            
            // Notify new members
            newMembers.forEach(email => {
                notifications.push(
                    sendNotificationEmail(
                        email,
                        emailSubject,
                        `${urgentWarning}\nYou have been assigned to task: "${task.title}"\n\nDescription: ${task.description}\n\nStatus: ${updates.status || task.status}\n\nPriority: ${(updates.priority || task.priority).toUpperCase()}${urgentMessage}`
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
        return response(500, { 
            error: 'Failed to update task', 
            message: error.message 
        });
    }
}
