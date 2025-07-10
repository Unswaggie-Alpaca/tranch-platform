// email-service.js
const nodemailer = require('nodemailer');

// Configure your email transport
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const emailTemplates = {
  access_request_received: (data) => ({
    subject: `New Access Request for ${data.project_title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; text-align: center;">
          <h1>New Access Request</h1>
        </div>
        <div style="padding: 2rem; background: white;">
          <p>Hi ${data.borrower_name || 'there'},</p>
          <p>A verified funder has requested access to your project <strong>${data.project_title}</strong>.</p>
          <a href="${process.env.FRONTEND_URL}/messages" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 1rem 0;">View Request</a>
        </div>
      </div>
    `
  }),
  
  deal_room_created: (data) => ({
    subject: `Deal Room Created for ${data.project_title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; text-align: center;">
          <h1>Deal Room Created</h1>
        </div>
        <div style="padding: 2rem; background: white;">
          <p>Great news!</p>
          <p>A funder has engaged with your project <strong>${data.project_title}</strong> and created a deal room.</p>
          <a href="${process.env.FRONTEND_URL}/dashboard" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 1rem 0;">Go to Deal Room</a>
        </div>
      </div>
    `
  }),
  
  project_published: (data) => ({
    subject: `Your Project "${data.project_title}" is Now Live!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; text-align: center;">
          <h1>Project Published!</h1>
        </div>
        <div style="padding: 2rem; background: white;">
          <p>Congratulations!</p>
          <p>Your project <strong>${data.project_title}</strong> is now live on Tranch and visible to all verified funders.</p>
          ${data.admin_action ? '<p><em>This project was published by an administrator.</em></p>' : ''}
          <a href="${process.env.FRONTEND_URL}/project/${data.project_id}" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 1rem 0;">View Your Project</a>
        </div>
      </div>
    `
  }),
  
  project_rejected: (data) => ({
    subject: `Action Required: ${data.project_title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #dc2626; color: white; padding: 2rem; text-align: center;">
          <h1>Project Needs Attention</h1>
        </div>
        <div style="padding: 2rem; background: white;">
          <p>Your project <strong>${data.project_title}</strong> has been moved back to draft status.</p>
          <div style="background: #fef3c7; padding: 1rem; border-radius: 4px; margin: 1rem 0;">
            <strong>Reason:</strong> ${data.reason}
          </div>
          <p>Please address the issues mentioned above and resubmit your project.</p>
          <a href="${process.env.FRONTEND_URL}/project/${data.project_id}/edit" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 1rem 0;">Edit Project</a>
        </div>
      </div>
    `
  }),
  
  admin_review_required: (data) => ({
    subject: `New Project Pending Review: ${data.project_title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #f59e0b; color: white; padding: 2rem; text-align: center;">
          <h1>New Project Pending Review</h1>
        </div>
        <div style="padding: 2rem; background: white;">
          <p>A new project requires your review and approval:</p>
          <div style="background: #f3f4f6; padding: 1.5rem; border-radius: 4px; margin: 1rem 0;">
            <p><strong>Project:</strong> ${data.project_title}</p>
            <p><strong>Borrower:</strong> ${data.borrower_name}</p>
            <p><strong>Loan Amount:</strong> $${(data.loan_amount / 100).toLocaleString()}</p>
            <p><strong>Location:</strong> ${data.suburb}</p>
          </div>
          <p>The borrower has successfully completed payment. Please review the project details and payment status in Stripe before approving.</p>
          <a href="${process.env.FRONTEND_URL}/admin" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 1rem 0;">Review in Admin Panel</a>
        </div>
      </div>
    `
  }),
  
  payment_failed_notification: (data) => ({
    subject: `Payment Failed: ${data.project_title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #dc2626; color: white; padding: 2rem; text-align: center;">
          <h1>Payment Failed</h1>
        </div>
        <div style="padding: 2rem; background: white;">
          <p>Your payment for project <strong>${data.project_title}</strong> has failed.</p>
          <p>The project has been returned to draft status. You will need to attempt payment again to publish your project.</p>
          <a href="${process.env.FRONTEND_URL}/project/${data.project_id}/edit" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 1rem 0;">View Project</a>
        </div>
      </div>
    `
  }),
  
  admin_subscription_review: (data) => ({
    subject: `New Subscription Pending Review: ${data.user_name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #f59e0b; color: white; padding: 2rem; text-align: center;">
          <h1>New Subscription Pending Review</h1>
        </div>
        <div style="padding: 2rem; background: white;">
          <p>A new funder subscription requires your review and approval:</p>
          <div style="background: #f3f4f6; padding: 1.5rem; border-radius: 4px; margin: 1rem 0;">
            <p><strong>Funder:</strong> ${data.user_name}</p>
            <p><strong>Email:</strong> ${data.user_email}</p>
            <p><strong>Company:</strong> ${data.company_name}</p>
            <p><strong>User ID:</strong> ${data.user_id}</p>
          </div>
          <p>The funder has successfully completed payment. Please review their profile and verify payment status in Stripe before approving.</p>
          <a href="${process.env.FRONTEND_URL}/admin" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 1rem 0;">Review in Admin Panel</a>
        </div>
      </div>
    `
  }),
  
  subscription_approved: (data) => ({
    subject: `Your Funder Subscription is Active!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; text-align: center;">
          <h1>Subscription Approved!</h1>
        </div>
        <div style="padding: 2rem; background: white;">
          <p>Great news! Your funder subscription has been approved and is now active.</p>
          <p>You now have full access to:</p>
          <ul style="margin: 1rem 0;">
            <li>View all project details</li>
            <li>Connect with borrowers</li>
            <li>Access deal rooms</li>
            <li>Download documents</li>
          </ul>
          <a href="${process.env.FRONTEND_URL}/dashboard" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 1rem 0;">Start Exploring Projects</a>
        </div>
      </div>
    `
  }),
  
  subscription_denied: (data) => ({
    subject: `Subscription Review: Action Required`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #dc2626; color: white; padding: 2rem; text-align: center;">
          <h1>Subscription Needs Attention</h1>
        </div>
        <div style="padding: 2rem; background: white;">
          <p>Your subscription application needs additional information.</p>
          <div style="background: #fef3c7; padding: 1rem; border-radius: 4px; margin: 1rem 0;">
            <strong>Reason:</strong> ${data.reason}
          </div>
          <p>Please update your profile with the requested information and contact support.</p>
          <a href="${process.env.FRONTEND_URL}/profile" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 1rem 0;">Update Profile</a>
        </div>
      </div>
    `
  })
};

const sendEmail = async (type, recipientEmail, data) => {
  try {
    const template = emailTemplates[type];
    if (!template) {
      console.error(`Email template not found: ${type}`);
      return;
    }
    
    const emailContent = template(data);
    
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@tranch.com.au',
      to: recipientEmail,
      subject: emailContent.subject,
      html: emailContent.html
    });
    
    console.log(`Email sent: ${type} to ${recipientEmail}`);
  } catch (error) {
    console.error('Email send error:', error);
  }
};

module.exports = { sendEmail };