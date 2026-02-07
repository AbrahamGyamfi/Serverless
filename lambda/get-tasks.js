/**
 * Get Tasks Lambda Function
 * Handles retrieving tasks (all tasks or specific task by ID)
 * Role-based access control: Admins see all, members see only their assigned tasks
 */

const {
    getUserRole,
    checkUserActive,
    response,
    validateAuth,
    TASKS_TABLE,
    dynamodb
} = require('./shared-utils');

exports.handler = async (event) => {
    console.log('Get Tasks Event:', JSON.stringify(event, null, 2));
    
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
        
        return await getTasks(userEmail, userRole, pathParameters);
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
        return response(500, { 
            error: 'Failed to get tasks', 
            message: error.message 
        });
    }
}
