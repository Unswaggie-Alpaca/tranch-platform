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