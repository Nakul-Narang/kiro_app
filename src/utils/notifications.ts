/**
 * Notification utilities for sending emails and SMS
 * Mock implementations for development - replace with real services in production
 */

import { logger } from './logger';

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface SMSOptions {
  to: string;
  message: string;
}

/**
 * Email service (mock implementation)
 * In production, replace with services like SendGrid, AWS SES, etc.
 */
export class EmailService {
  /**
   * Send email verification
   */
  async sendEmailVerification(email: string, token: string): Promise<void> {
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
    
    const emailOptions: EmailOptions = {
      to: email,
      subject: 'Verify your email - Multilingual Mandi',
      html: `
        <h2>Welcome to Multilingual Mandi!</h2>
        <p>Please click the link below to verify your email address:</p>
        <a href="${verificationUrl}" style="background-color: #4CAF50; color: white; padding: 14px 20px; text-decoration: none; border-radius: 4px;">
          Verify Email
        </a>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p>${verificationUrl}</p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create an account, please ignore this email.</p>
      `,
      text: `
        Welcome to Multilingual Mandi!
        
        Please visit the following link to verify your email address:
        ${verificationUrl}
        
        This link will expire in 24 hours.
        
        If you didn't create an account, please ignore this email.
      `
    };

    await this.sendEmail(emailOptions);
    logger.info(`Email verification sent to: ${email}`);
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(email: string, token: string): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    
    const emailOptions: EmailOptions = {
      to: email,
      subject: 'Reset your password - Multilingual Mandi',
      html: `
        <h2>Password Reset Request</h2>
        <p>You requested to reset your password. Click the link below to set a new password:</p>
        <a href="${resetUrl}" style="background-color: #f44336; color: white; padding: 14px 20px; text-decoration: none; border-radius: 4px;">
          Reset Password
        </a>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p>${resetUrl}</p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request a password reset, please ignore this email.</p>
      `,
      text: `
        Password Reset Request
        
        You requested to reset your password. Visit the following link to set a new password:
        ${resetUrl}
        
        This link will expire in 1 hour.
        
        If you didn't request a password reset, please ignore this email.
      `
    };

    await this.sendEmail(emailOptions);
    logger.info(`Password reset email sent to: ${email}`);
  }

  /**
   * Send generic email (mock implementation)
   */
  private async sendEmail(options: EmailOptions): Promise<void> {
    try {
      // Mock implementation - log email details
      logger.info('📧 Email would be sent:', {
        to: options.to,
        subject: options.subject,
        hasHtml: !!options.html,
        hasText: !!options.text
      });

      // In production, implement actual email sending:
      // - SendGrid: await sgMail.send(options)
      // - AWS SES: await ses.sendEmail(params).promise()
      // - Nodemailer: await transporter.sendMail(options)
      
      // Simulate async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      logger.error('Error sending email:', error);
      throw new Error('Failed to send email');
    }
  }
}

/**
 * SMS service (mock implementation)
 * In production, replace with services like Twilio, AWS SNS, etc.
 */
export class SMSService {
  /**
   * Send phone verification code
   */
  async sendPhoneVerification(phoneNumber: string, code: string): Promise<void> {
    const message = `Your Multilingual Mandi verification code is: ${code}. This code will expire in 10 minutes.`;
    
    await this.sendSMS({
      to: phoneNumber,
      message
    });
    
    logger.info(`Phone verification SMS sent to: ${phoneNumber}`);
  }

  /**
   * Send generic SMS (mock implementation)
   */
  private async sendSMS(options: SMSOptions): Promise<void> {
    try {
      // Mock implementation - log SMS details
      logger.info('📱 SMS would be sent:', {
        to: options.to,
        message: options.message.substring(0, 50) + '...'
      });

      // In production, implement actual SMS sending:
      // - Twilio: await client.messages.create({to: options.to, body: options.message, from: twilioNumber})
      // - AWS SNS: await sns.publish({PhoneNumber: options.to, Message: options.message}).promise()
      
      // Simulate async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      logger.error('Error sending SMS:', error);
      throw new Error('Failed to send SMS');
    }
  }
}

// Create singleton instances
export const emailService = new EmailService();
export const smsService = new SMSService();