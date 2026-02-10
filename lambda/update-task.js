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
        const { body, requestContext, pathParameters } = event;
        
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
        
        // Support taskId from either path parameter or body
        const taskId = pathParameters?.taskId || updateData.taskId;
        if (taskId) {
            updateData.taskId = taskId;
        }
        
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
        
        console.log('updateTask called with:', { taskId, status, otherUpdates, userEmail, userRole });
        
        if (!taskId) {
            console.log('ERROR: Missing taskId');
            return response(400, { error: 'Missing required field: taskId' });
        }
        
        // Get current task
        const currentTask = await dynamodb.get({
            TableName: TASKS_TABLE,
            Key: { taskId }
        }).promise();
        
        console.log('Current task fetch result:', { found: !!currentTask.Item });
        
        if (!currentTask.Item) {
            console.log('ERROR: Task not found');
            return response(404, { error: 'Task not found' });
        }
        
        const task = currentTask.Item;
        console.log('Found task:', { taskId: task.taskId, title: task.title });
        
        // Check permissions
        const isAssignedMember = task.assignedMembers && 
                                task.assignedMembers.includes(userEmail);
        
        console.log('Permission check:', { userRole, isAssignedMember });
        
        if (userRole !== 'admin' && !isAssignedMember) {
            console.log('ERROR: Permission denied');
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
            console.log('ERROR: No updates provided');
            return response(400, { error: 'No updates provided' });
        }
        
        updates.updatedAt = new Date().toISOString();
        updates.updatedBy = userEmail;
        
        console.log('Final updates to apply:', updates);
        
        // Build DynamoDB update expression
        const updateParams = buildUpdateExpression(updates);
        console.log('Update params:', JSON.stringify(updateParams, null, 2));
        
        // Update the task
        console.log('Attempting DynamoDB update...');
        const updateResult = await dynamodb.update({
            TableName: TASKS_TABLE,
            Key: { taskId },
            ...updateParams,
            ReturnValues: 'ALL_NEW'
        }).promise();
        console.log('DynamoDB update successful, result:', JSON.stringify(updateResult.Attributes, null, 2));
        
        // Send notifications based on what changed
        const notifications = [];
        
        // Track if we should send general update notification
        let hasGeneralUpdate = false;
        const changedFields = [];
        
        // Check what fields changed
        if (updates.title && updates.title !== task.title) {
            changedFields.push('title');
            hasGeneralUpdate = true;
        }
        if (updates.description && updates.description !== task.description) {
            changedFields.push('description');
            hasGeneralUpdate = true;
        }
        if (updates.dueDate && updates.dueDate !== task.dueDate) {
            changedFields.push('due date');
            hasGeneralUpdate = true;
        }
        if (updates.priority && updates.priority !== task.priority && updates.priority !== 'urgent') {
            changedFields.push('priority');
            hasGeneralUpdate = true;
        }
        
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
        
        // General update notification - notify all assigned members for other changes
        if (hasGeneralUpdate && !reassignmentOccurred) {
            const assignedMembers = task.assignedMembers || [];
            const fieldsChanged = changedFields.join(', ');
            
            assignedMembers
                .filter(email => email !== userEmail)
                .forEach(email => {
                    notifications.push(
                        sendNotificationEmail(
                            email,
                            'Task Updated',
                            `Task "${task.title}" has been updated by ${userEmail}.\n\nFields changed: ${fieldsChanged}\n\nTitle: ${updates.title || task.title}\n\nDescription: ${updates.description || task.description}\n\nPriority: ${(updates.priority || task.priority).toUpperCase()}\n\nDue Date: ${updates.dueDate || task.dueDate || 'Not set'}\n\nStatus: ${updates.status || task.status}`
                        )
                    );
                });
        }
        
        await Promise.allSettled(notifications);
        console.log(`Sent ${notifications.length} email notification(s) for task update`);
        
        console.log('Update completed successfully');
        
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
