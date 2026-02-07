/**
 * Delete Task Lambda Function
 * Handles task deletion (admin only)
 * Sends notifications to all assigned members
 */

const {
    getUserRole,
    checkUserActive,
    sendNotificationEmail,
    response,
    validateAuth,
    TASKS_TABLE,
    dynamodb
} = require('./shared-utils');

exports.handler = async (event) => {
    console.log('Delete Task Event:', JSON.stringify(event, null, 2));
    
    try {
        const { pathParameters, requestContext } = event;
        
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
        
        // Only admins can delete tasks
        if (userRole !== 'admin') {
            return response(403, { error: 'Forbidden - Only admins can delete tasks' });
        }
        
        return await deleteTask(pathParameters, userEmail);
    } catch (error) {
        console.error('Error:', error);
        return response(500, { 
            error: 'Internal server error', 
            message: error.message 
        });
    }
};

async function deleteTask(pathParameters, userEmail) {
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
        return response(500, { 
            error: 'Failed to delete task', 
            message: error.message 
        });
    }
}
