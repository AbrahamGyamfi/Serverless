/**
 * Post-Confirmation Lambda Trigger
 * Creates user record in DynamoDB after successful email verification
 * Adds user to appropriate Cognito group based on email domain
 */

const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const cognito = new AWS.CognitoIdentityServiceProvider();
const USERS_TABLE = process.env.USERS_TABLE;

/**
 * Determines user role based on email
 * Only abraham.gyamfi@amalitech.com is admin, all others are members
 * @param {string} email - User email address
 * @returns {string} User role ('admin' or 'member')
 */
function determineUserRole(email) {
    return email.toLowerCase() === 'abraham.gyamfi@amalitech.com' ? 'admin' : 'member';
}

/**
 * Add user to Cognito group based on their role
 * @param {string} userPoolId - Cognito User Pool ID
 * @param {string} username - Cognito username (sub)
 * @param {string} groupName - Group name to add user to
 */
async function addUserToGroup(userPoolId, username, groupName) {
    if (!userPoolId) {
        console.warn('userPoolId not provided, skipping group assignment');
        return;
    }
    
    try {
        await cognito.adminAddUserToGroup({
            UserPoolId: userPoolId,
            Username: username,
            GroupName: groupName
        }).promise();
        
        console.log(`User ${username} added to group: ${groupName}`);
    } catch (error) {
        console.error(`Failed to add user to group ${groupName}:`, error.message);
        // Don't throw - group assignment failure shouldn't block confirmation
    }
}

exports.handler = async (event) => {
    console.log('Post-confirmation event:', JSON.stringify(event, null, 2));
    
    try {
        const email = event.request.userAttributes.email;
        const sub = event.request.userAttributes.sub; // Cognito user ID
        const username = event.userName; // Will be the email since username_attributes = ["email"]
        const userPoolId = event.userPoolId;
        
        // Determine role based on email domain
        const role = determineUserRole(email);
        
        // Add user to appropriate Cognito group (admin or member)
        await addUserToGroup(userPoolId, username, role);
        
        // Check if user already exists in DynamoDB
        const existingUser = await dynamodb.query({
            TableName: USERS_TABLE,
            IndexName: 'EmailIndex',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: { ':email': email }
        }).promise();
        
        if (existingUser.Items && existingUser.Items.length > 0) {
            console.log(`User already exists: ${email}`);
            return event;
        }
        
        // Create user record in DynamoDB
        const userId = uuidv4();
        const user = {
            userId,
            cognitoSub: sub,
            email,
            role,
            status: 'active',
            createdAt: new Date().toISOString(),
            emailVerified: true
        };
        
        await dynamodb.put({
            TableName: USERS_TABLE,
            Item: user
        }).promise();
        
        console.log(`User created successfully: ${email} with role: ${role}`);
        
    } catch (error) {
        console.error('Error in post-confirmation trigger:', error);
        // Don't throw - we don't want to block the Cognito confirmation process
        // User record can be created lazily on first API call if this fails
    }
    
    return event;
};
