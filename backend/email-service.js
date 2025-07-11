// Create new file: backend/email-service.js

const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Email templates
const emailTemplates = {
  account_approved: (data) => ({
    subject: 'Your Tranch Account Has Been Approved',
    html: `
      <h2>Welcome to Tranch!</h2>
      <p>Hi ${data.recipient_name},</p>
      <p>Great news! Your account has been approved and you now have full access to the Tranch platform.</p>
      <p>You can now:</p>
      <ul>
        <li>Browse investment opportunities</li>
        <li>Request access to project details</li>
        <li>Create deal rooms with developers</li>
        <li>Submit proposals and negotiate terms</li>
      </ul>
      <p><a href="${process.env.FRONTEND_URL}/dashboard" style="background: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Go to Dashboard</a></p>
      <p>Best regards,<br>The Tranch Team</p>
    `
  }),
  
  message_received: (data) => ({
    subject: `New Message: ${data.project_title || 'Tranch Platform'}`,
    html: `
      <h2>You have a new message</h2>
      <p>Hi ${data.recipient_name},</p>
      <p>You've received a new message regarding: <strong>${data.project_title}</strong></p>
      <p>From: ${data.sender_name}</p>
      <blockquote style="border-left: 3px solid #3B82F6; padding-left: 16px; margin: 16px 0;">
        ${data.message_preview || 'Click below to view the full message'}
      </blockquote>
      <p><a href="${process.env.FRONTEND_URL}/messages" style="background: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Message</a></p>
      <p>Best regards,<br>The Tranch Team</p>
    `
  }),
  
  deal_room_created: (data) => ({
    subject: `Deal Room Created: ${data.project_title}`,
    html: `
      <h2>A funder has engaged with your project!</h2>
      <p>Hi ${data.recipient_name},</p>
      <p>Exciting news! A verified funder has created a deal room for your project: <strong>${data.project_title}</strong></p>
      <p>This means they're interested in potentially funding your development. You can now:</p>
      <ul>
        <li>Share additional documents</li>
        <li>Communicate directly with the funder</li>
        <li>Review and respond to proposals</li>
        <li>Negotiate terms</li>
      </ul>
      <p><a href="${process.env.FRONTEND_URL}/dashboard" style="background: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Go to Deal Room</a></p>
      <p>Best regards,<br>The Tranch Team</p>
    `
  }),
  
  access_request_received: (data) => ({
    subject: `Access Request: ${data.project_title}`,
    html: `
      <h2>New Access Request</h2>
      <p>Hi ${data.recipient_name},</p>
      <p>A funder has requested access to view the full details of your project: <strong>${data.project_title}</strong></p>
      ${data.funder_message ? `
        <p>Their message:</p>
        <blockquote style="border-left: 3px solid #3B82F6; padding-left: 16px; margin: 16px 0;">
          ${data.funder_message}
        </blockquote>
      ` : ''}
      <p>You can review their profile and approve or decline access.</p>
      <p><a href="${process.env.FRONTEND_URL}/messages" style="background: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Review Request</a></p>
      <p>Best regards,<br>The Tranch Team</p>
    `
  }),
  
  project_published: (data) => ({
    subject: `Your Project is Now Live: ${data.project_title}`,
    html: `
      <h2>Your project is live!</h2>
      <p>Hi ${data.recipient_name},</p>
      <p>Congratulations! Your project <strong>${data.project_title}</strong> has been reviewed and is now live on the Tranch marketplace.</p>
      <p>Verified funders can now discover your project and request access to view full details.</p>
      <p>What happens next:</p>
      <ul>
        <li>Funders will browse and discover your project</li>
        <li>Interested funders will request access</li>
        <li>You'll receive notifications when funders engage</li>
        <li>Deal rooms will be created for serious discussions</li>
      </ul>
      <p><a href="${process.env.FRONTEND_URL}/dashboard" style="background: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Your Project</a></p>
      <p>Best regards,<br>The Tranch Team</p>
    `
  }),
  
  project_rejected: (data) => ({
    subject: `Project Review Update: ${data.project_title}`,
    html: `
      <h2>Project Review Update</h2>
      <p>Hi ${data.recipient_name},</p>
      <p>Thank you for submitting your project <strong>${data.project_title}</strong> to Tranch.</p>
      <p>After review, we need some additional information or adjustments before your project can go live.</p>
      ${data.rejection_reason ? `
        <p>Feedback from our team:</p>
        <blockquote style="border-left: 3px solid #F59E0B; padding-left: 16px; margin: 16px 0;">
          ${data.rejection_reason}
        </blockquote>
      ` : ''}
      <p>Please update your project based on the feedback and resubmit for review.</p>
      <p><a href="${process.env.FRONTEND_URL}/dashboard" style="background: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Edit Project</a></p>
      <p>If you have questions, please don't hesitate to contact our support team.</p>
      <p>Best regards,<br>The Tranch Team</p>
    `
  })
};

// Send email function
const sendEmail = async (type, recipientEmail, data) => {
  try {
    const template = emailTemplates[type];
    if (!template) {
      throw new Error(`Email template '${type}' not found`);
    }
    
    const emailContent = template(data);
    
    const mailOptions = {
      from: `"Tranch Platform" <${process.env.EMAIL_USER}>`,
      to: recipientEmail,
      subject: emailContent.subject,
      html: emailContent.html
    };
    
    // Add common footer
    mailOptions.html += `
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">
        This email was sent by Tranch. If you have any questions, please contact support.<br>
        <a href="${process.env.FRONTEND_URL}" style="color: #3B82F6;">Visit Tranch</a> | 
        <a href="${process.env.FRONTEND_URL}/settings" style="color: #3B82F6;">Email Preferences</a>
      </p>
    `;
    
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    
    return info;
  } catch (error) {
    console.error('Email send error:', error);
    throw error;
  }
};

module.exports = { sendEmail };