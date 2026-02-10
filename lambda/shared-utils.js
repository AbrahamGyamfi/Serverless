/**
 * Shared utilities for Lambda microservices
 * Provides common authentication, database, and notification functions
 */

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const ses = new AWS.SES();

const TASKS_TABLE = process.env.TASKS_TABLE;
const USERS_TABLE = process.env.USERS_TABLE;
const SES_SOURCE_EMAIL = process.env.SES_SOURCE_EMAIL;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

/**
 * Get user role from DynamoDB
 * Auto-creates user entry if not exists
 * @param {string} email - User email address
 * @returns {Promise<string>} User role ('admin' or 'member')
 */
async function getUserRole(email) {
    try {
        const result = await dynamodb.query({
            TableName: USERS_TABLE,
            IndexName: 'EmailIndex',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: { ':email': email }
        }).promise();
        
        if (result.Items && result.Items.length > 0) {
            return result.Items[0].role || 'member';
        }
        
        // Auto-create user entry if not exists
        const userId = require('uuid').v4();
        const userRole = email.toLowerCase() === 'abraham.gyamfi@amalitech.com' ? 'admin' : 'member';
        
        await dynamodb.put({
            TableName: USERS_TABLE,
            Item: {
                userId,
                email,
                role: userRole,
                status: 'active',
                createdAt: new Date().toISOString()
            }
        }).promise();
        
        return userRole;
    } catch (error) {
        console.error('Error getting user role:', error);
        return 'member';
    }
}

/**
 * Check if user is active in the system
 * @param {string} email - User email address
 * @returns {Promise<boolean>} True if user is active, false otherwise
 */
async function checkUserActive(email) {
    try {
        const result = await dynamodb.query({
            TableName: USERS_TABLE,
            IndexName: 'EmailIndex',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: { ':email': email }
        }).promise();
        
        if (result.Items && result.Items.length > 0) {
            return result.Items[0].status === 'active';
        }
        
        return true; // New users are active by default
    } catch (error) {
        console.error('Error checking user status:', error);
        return true;
    }
}

/**
 * Send notification email via SES with HTML formatting
 * Gracefully handles SES configuration errors
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} message - Plain text message (newlines converted to <br>)
 * @returns {Promise<void>}
 */
async function sendNotificationEmail(to, subject, message) {
    if (!SES_SOURCE_EMAIL || SES_SOURCE_EMAIL === 'noreply@yourdomain.com') {
        console.log('SES not configured, skipping email to:', to);
        return;
    }
    
    try {
        const htmlMessage = message.replace(/\n/g, '<br>');
        
        const params = {
            Source: SES_SOURCE_EMAIL,
            Destination: { 
                ToAddresses: [to] 
            },
            Message: {
                Subject: { 
                    Data: subject,
                    Charset: 'UTF-8'
                },
                Body: { 
                    Text: { 
                        Data: message,
                        Charset: 'UTF-8'
                    },
                    Html: {
                        Data: `
                            <!DOCTYPE html>
                            <html>
                            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                                    <h2 style="color: #2c3e50;">${subject}</h2>
                                    <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #007bff; margin: 20px 0;">
                                        <p style="margin: 0;">${htmlMessage}</p>
                                    </div>
                                    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                                    <p style="color: #666; font-size: 12px; text-align: center;">
                                        Task Management System - Automated Notification<br>
                                        Please do not reply to this email
                                    </p>
                                </div>
                            </body>
                            </html>
                        `,
                        Charset: 'UTF-8'
                    }
                }
            }
        };
        
        await ses.sendEmail(params).promise();
        console.log(`Email sent successfully to ${to}: "${subject}"`);
    } catch (error) {
        console.error('Failed to send email to', to, ':', error.message);
    }
}

/**
 * Standard HTTP response with CORS headers
 * @param {number} statusCode - HTTP status code
 * @param {Object} body - Response body object (will be JSON stringified)
 * @returns {Object} API Gateway formatted response
 */
function response(statusCode, body) {
    return {
        statusCode,
        headers: corsHeaders,
        body: JSON.stringify(body)
    };
}

/**
 * Validate authentication from API Gateway request context
 * @param {Object} requestContext - API Gateway request context
 * @returns {Object} Validation result with { valid, userEmail, error }
 */
function validateAuth(requestContext) {
    if (!requestContext || !requestContext.authorizer || !requestContext.authorizer.claims) {
        return { valid: false, error: response(401, { error: 'Unauthorized - Missing authentication' }) };
    }
    
    const userEmail = requestContext.authorizer.claims.email;
    return { valid: true, userEmail };
}

/**
 * Validate email format
 * @param {string} email - Email address to validate
 * @returns {boolean} True if valid email format
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate and normalize an array of email addresses
 * @param {string|Array<string>} emails - Single email or array of emails
 * @returns {Object} { valid: boolean, emails: Array<string>, invalid: Array<string> }
 */
function validateEmails(emails) {
    const emailArray = Array.isArray(emails) ? emails : [emails];
    const uniqueEmails = [...new Set(emailArray.filter(email => email && email.trim()))];
    const invalidEmails = uniqueEmails.filter(email => !isValidEmail(email));
    
    return {
        valid: invalidEmails.length === 0 && uniqueEmails.length > 0,
        emails: uniqueEmails,
        invalid: invalidEmails
    };
}

/**
 * Build DynamoDB update expression from object
 * @param {Object} updates - Object with fields to update
 * @returns {Object} { updateExpression, expressionAttributeNames, expressionAttributeValues }
 */
function buildUpdateExpression(updates) {
    const keys = Object.keys(updates);
    
    if (keys.length === 0) {
        return null;
    }
    
    const updateExpression = keys.map(key => `#${key} = :${key}`).join(', ');
    const expressionAttributeNames = keys.reduce(
        (acc, key) => ({ ...acc, [`#${key}`]: key }), 
        {}
    );
    const expressionAttributeValues = keys.reduce(
        (acc, key) => ({ ...acc, [`:${key}`]: updates[key] }), 
        {}
    );
    
    return {
        UpdateExpression: `SET ${updateExpression}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
    };
}

/**
 * Validate assigned members - check if they exist, are active, and are members (not admins)
 * @param {Array<string>} memberEmails - Array of email addresses
 * @returns {Promise<Object>} Validation result with { inactiveUsers, nonExistentUsers, adminUsers }
 */
async function validateAssignedMembers(memberEmails) {
    const inactiveUsers = [];
    const nonExistentUsers = [];
    const adminUsers = [];
    
    for (const memberEmail of memberEmails) {
        const userResult = await dynamodb.query({
            TableName: USERS_TABLE,
            IndexName: 'EmailIndex',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: { ':email': memberEmail }
        }).promise();
        
        if (!userResult.Items || userResult.Items.length === 0) {
            nonExistentUsers.push(memberEmail);
        } else {
            const user = userResult.Items[0];
            if (user.status !== 'active') {
                inactiveUsers.push(memberEmail);
            } else if (user.role === 'admin') {
                adminUsers.push(memberEmail);
            }
        }
    }
    
    return { inactiveUsers, nonExistentUsers, adminUsers };
}

module.exports = {
    getUserRole,
    checkUserActive,
    sendNotificationEmail,
    response,
    validateAuth,
    isValidEmail,
    validateEmails,
    buildUpdateExpression,
    validateAssignedMembers,
    TASKS_TABLE,
    USERS_TABLE,
    dynamodb
};
