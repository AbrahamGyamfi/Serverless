/**
 * User Management Lambda
 * Handles user administration functions like listing users, updating roles, and deactivating accounts
 * Only accessible by admins
 */

const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const {
    getUserRole,
    response,
    validateAuth,
    buildUpdateExpression,
    USERS_TABLE,
    dynamodb
} = require('./shared-utils');

const cognito = new AWS.CognitoIdentityServiceProvider();
const USER_POOL_ID = process.env.USER_POOL_ID;

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
        
        // Only admins can access user management functions
        if (userRole !== 'admin') {
            return response(403, { 
                error: 'Forbidden - Only admins can access user management functions' 
            });
        }
        
        switch (httpMethod) {
            case 'GET':
                return await getUsers(pathParameters);
            case 'POST':
                return await createOrUpdateUser(JSON.parse(body), userEmail);
            case 'PUT':
                return await updateUserStatus(JSON.parse(body), userEmail);
            case 'DELETE':
                return await deactivateUser(pathParameters, userEmail);
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

/**
 * Get users - all users or specific user by ID
 */
async function getUsers(pathParameters) {
    try {
        let users;
        
        if (pathParameters && pathParameters.userId) {
            // Get specific user
            const result = await dynamodb.get({
                TableName: USERS_TABLE,
                Key: { userId: pathParameters.userId }
            }).promise();
            
            if (!result.Item) {
                return response(404, { error: 'User not found' });
            }
            
            return response(200, { user: result.Item });
        } else {
            // Get all users
            const result = await dynamodb.scan({
                TableName: USERS_TABLE
            }).promise();
            
            users = result.Items || [];
            
            // Enrich with Cognito status if possible
            const enrichedUsers = await Promise.all(
                users.map(async (user) => {
                    try {
                        const cognitoUser = await getCognitoUserByEmail(user.email);
                        return {
                            ...user,
                            cognitoStatus: cognitoUser?.UserStatus,
                            emailVerified: cognitoUser?.Attributes?.find(
                                attr => attr.Name === 'email_verified'
                            )?.Value === 'true'
                        };
                    } catch (error) {
                        console.warn(`Could not enrich user ${user.email}:`, error.message);
                        return user;
                    }
                })
            );
            
            return response(200, { 
                users: enrichedUsers, 
                count: enrichedUsers.length 
            });
        }
    } catch (error) {
        console.error('Error fetching users:', error);
        throw new Error(`Failed to get users: ${error.message}`);
    }
}

async function getCognitoUserByEmail(email) {
    if (!USER_POOL_ID) {
        return null;
    }
    
    try {
        const params = {
            UserPoolId: USER_POOL_ID,
            Filter: `email = "${email}"`
        };
        
        const result = await cognito.listUsers(params).promise();
        return result.Users && result.Users.length > 0 ? result.Users[0] : null;
    } catch (error) {
        console.error('Error fetching Cognito user:', error);
        return null;
    }
}

async function createOrUpdateUser(userData, adminEmail) {
    try {
        // Validate required fields
        if (!userData.email) {
            return response(400, { error: 'Missing required field: email' });
        }
        
        // Validate email domain
        const allowedDomains = ['@amalitech.com', '@amalitechtraining.org'];
        const isValidDomain = allowedDomains.some(domain => 
            userData.email.toLowerCase().endsWith(domain.toLowerCase())
        );
        
        if (!isValidDomain) {
            return response(400, { 
                error: 'Email must be from @amalitech.com or @amalitechtraining.org' 
            });
        }
        
        // Check if user exists
        const existingUser = await dynamodb.query({
            TableName: USERS_TABLE,
            IndexName: 'EmailIndex',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: { ':email': userData.email }
        }).promise();
        
        let userId;
        let action;
        
        if (existingUser.Items && existingUser.Items.length > 0) {
            // Update existing user
            userId = existingUser.Items[0].userId;
            action = 'updated';
            
            const updates = {};
            if (userData.role) updates.role = userData.role;
            if (userData.status) updates.status = userData.status;
            if (userData.firstName) updates.firstName = userData.firstName;
            if (userData.lastName) updates.lastName = userData.lastName;
            
            if (Object.keys(updates).length === 0) {
                return response(400, { error: 'No updates provided' });
            }
            
            updates.updatedAt = new Date().toISOString();
            updates.updatedBy = adminEmail;
            
            const updateParams = buildUpdateExpression(updates);
            
            await dynamodb.update({
                TableName: USERS_TABLE,
                Key: { userId },
                ...updateParams
            }).promise();
        } else {
            // Create new user
            userId = uuidv4();
            action = 'created';
            
            const newUser = {
                userId,
                email: userData.email,
                role: userData.role || 'member',
                status: userData.status || 'active',
                firstName: userData.firstName || '',
                lastName: userData.lastName || '',
                createdAt: new Date().toISOString(),
                createdBy: adminEmail
            };
            
            await dynamodb.put({
                TableName: USERS_TABLE,
                Item: newUser
            }).promise();
        }
        
        return response(action === 'created' ? 201 : 200, { 
            message: `User ${action} successfully`,
            userId 
        });
    } catch (error) {
        console.error('Error creating/updating user:', error);
        throw new Error(`Failed to create/update user: ${error.message}`);
    }
}

async function updateUserStatus(updateData, adminEmail) {
    try {
        const { userId, status } = updateData;
        
        if (!userId || !status) {
            return response(400, { error: 'Missing required fields: userId and status' });
        }
        
        if (!['active', 'inactive', 'suspended'].includes(status)) {
            return response(400, { 
                error: 'Invalid status. Must be: active, inactive, or suspended' 
            });
        }
        
        // Update user status
        const updates = {
            status,
            updatedAt: new Date().toISOString(),
            updatedBy: adminEmail
        };
        
        const updateParams = buildUpdateExpression(updates);
        
        await dynamodb.update({
            TableName: USERS_TABLE,
            Key: { userId },
            ...updateParams
        }).promise();
        
        return response(200, { 
            message: 'User status updated successfully',
            userId,
            status
        });
    } catch (error) {
        console.error('Error updating user status:', error);
        throw new Error(`Failed to update user status: ${error.message}`);
    }
}

async function deactivateUser(pathParameters, adminEmail) {
    try {
        if (!pathParameters || !pathParameters.userId) {
            return response(400, { error: 'Missing required parameter: userId' });
        }
        
        const userId = pathParameters.userId;
        
        // Get user details
        const userResult = await dynamodb.get({
            TableName: USERS_TABLE,
            Key: { userId }
        }).promise();
        
        if (!userResult.Item) {
            return response(404, { error: 'User not found' });
        }
        
        const user = userResult.Item;
        
        // Prevent self-deactivation
        if (user.email === adminEmail) {
            return response(400, { error: 'Cannot deactivate your own account' });
        }
        
        // Mark user as inactive instead of deleting
        const updates = {
            status: 'inactive',
            updatedAt: new Date().toISOString(),
            deactivatedBy: adminEmail
        };
        
        const updateParams = buildUpdateExpression(updates);
        
        await dynamodb.update({
            TableName: USERS_TABLE,
            Key: { userId },
            ...updateParams
        }).promise();
        
        // Optionally disable in Cognito as well
        if (USER_POOL_ID) {
            try {
                const cognitoUser = await getCognitoUserByEmail(user.email);
                if (cognitoUser) {
                    await cognito.adminDisableUser({
                        UserPoolId: USER_POOL_ID,
                        Username: cognitoUser.Username
                    }).promise();
                    console.log(`Disabled Cognito user: ${cognitoUser.Username}`);
                }
            } catch (cognitoError) {
                console.warn('Could not disable Cognito user:', cognitoError.message);
                // Continue anyway - DynamoDB status is the source of truth
            }
        }
        
        return response(200, { 
            message: 'User deactivated successfully',
            userId
        });
    } catch (error) {
        console.error('Error deactivating user:', error);
        throw new Error(`Failed to deactivate user: ${error.message}`);
    }
}
