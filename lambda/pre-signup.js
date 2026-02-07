/**
 * Pre-signup Lambda trigger for AWS Cognito
 * Validates email domain and ensures email verification is mandatory
 */

const ALLOWED_DOMAINS = ['@amalitech.com', '@amalitechtraining.org'];

exports.handler = async (event) => {
    console.log('Pre-signup event:', JSON.stringify(event, null, 2));
    
    const email = event.request.userAttributes.email;
    
    // Validate email domain
    const isValidDomain = ALLOWED_DOMAINS.some(domain => 
        email.toLowerCase().endsWith(domain.toLowerCase())
    );
    
    if (!isValidDomain) {
        console.error(`Signup blocked for email: ${email} - Domain not allowed`);
        throw new Error('Email address is not authorized for registration.');
    }
    
    // Email verification is mandatory - do NOT auto-confirm
    // User must verify their email before first login
    event.response.autoConfirmUser = false;
    event.response.autoVerifyEmail = false;
    
    console.log(`Pre-signup validation passed for: ${email}`);
    return event;
};