import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter;
  private readonly companyName: string = 'Anand Jivan Foundation Trust';
  private readonly companyLogo: string = 'https://res.cloudinary.com/dkc66bu0s/image/upload/v1753822641/logo-2048_1_geghxn.png';
  private readonly primaryColor: string = '#0b6c1eff'; 
  private readonly footerText: string = '© 2025 Anand Jivan Foundation Trust. All rights reserved.';

  constructor(private configService: ConfigService) {
   this.transporter = nodemailer.createTransport({
      host: 'smtp.zoho.in',
      port: 465,
      secure: true,
      auth: {
        user: this.configService.get('EMAIL_USER'),
        pass: this.configService.get('EMAIL_PASSWORD'),
      },
    });
  }

  private getBaseTemplate(content: string) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${this.companyName}</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9fafb;">
          <table role="presentation" style="width: 100%; border: none; border-spacing: 0;">
            <tr>
              <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; border: none; border-spacing: 0; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="padding: 30px 40px; text-align: center; background-color: ${this.primaryColor}; border-radius: 8px 8px 0 0;">
                      <img src="${this.companyLogo}" alt="${this.companyName}" style="height: 40px; margin-bottom: 20px;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">${this.companyName}</h1>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px;">
                      ${content}
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 30px 40px; text-align: center; background-color: #f8fafc; border-radius: 0 0 8px 8px;">
                      <p style="margin: 0; color: #64748b; font-size: 14px;">
                        ${this.footerText}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  async sendInternshipAssignmentEmail(email: string, userName: string, internshipDetails: any) {
  try {
    const content = `
      <div style="text-align: center;">
        <h2 style="color: #1e293b; font-size: 28px; margin-bottom: 30px;">🎉 Congratulations! You've Been Selected</h2>
        <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
          Hello ${userName}, we're excited to inform you that you have been selected for an internship program at ${this.companyName}!
        </p>
        
        <div style="background-color: #f1f5f9; border-radius: 8px; padding: 30px; margin: 30px 0; text-align: left;">
          <h3 style="color: #1e293b; font-size: 20px; margin-bottom: 20px; text-align: center;">📋 Internship Details</h3>
          <div style="margin-bottom: 12px;">
            <strong style="color: #374151;">Position:</strong>
            <span style="color: #475569; margin-left: 10px;">${internshipDetails.role}</span>
          </div>
          <div style="margin-bottom: 12px;">
            <strong style="color: #374151;">Program:</strong>
            <span style="color: #475569; margin-left: 10px;">${internshipDetails.title}</span>
          </div>
          <div style="margin-bottom: 12px;">
            <strong style="color: #374151;">Start Date:</strong>
            <span style="color: #475569; margin-left: 10px;">${internshipDetails.startDate}</span>
          </div>
          <div style="margin-bottom: 12px;">
            <strong style="color: #374151;">End Date:</strong>
            <span style="color: #475569; margin-left: 10px;">${internshipDetails.endDate}</span>
          </div>
          <div style="margin-bottom: 12px;">
            <strong style="color: #374151;">Duration:</strong>
            <span style="color: #475569; margin-left: 10px;">${internshipDetails.duration}</span>
          </div>
          <div style="margin-top: 20px;">
            <strong style="color: #374151;">Description:</strong>
            <p style="color: #475569; margin-top: 8px; line-height: 1.6;">${internshipDetails.description}</p>
          </div>
        </div>

        <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; text-align: left;">
          <p style="color: #047857; font-size: 14px; margin: 0;">
            <strong>What's Next:</strong> Please log into your account to view more details and access your internship dashboard.
          </p>
        </div>

        <a href="https://ajftrust.org/login" style="display: inline-block; background-color: ${this.primaryColor}; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 600; margin-top: 20px;">
          Access Dashboard
        </a>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
          <p style="color: #475569; font-size: 14px;">
            We're excited to have you join our team! If you have any questions, please don't hesitate to reach out to our support team.
          </p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: `"${this.companyName}" <${this.configService.get('EMAIL_USER')}>`,
      to: email,
      subject: `🎉 Internship Assignment - ${internshipDetails.title}`,
      html: this.getBaseTemplate(content),
    };

    const info = await this.transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Internship assignment email sending failed:', error);
    throw error;
  }
}

// NEW METHOD - Send internship completion email with certificate
async sendInternshipCompletionEmail(email: string, userName: string, completionDetails: any, certificateHTML: string) {
  try {
    const content = `
      <div style="text-align: center;">
        <h2 style="color: #1e293b; font-size: 28px; margin-bottom: 30px;">🎓 Congratulations on Your Completion!</h2>
        <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
          Hello ${userName}, congratulations on successfully completing your internship program at ${this.companyName}!
        </p>
        
        <div style="background-color: #f1f5f9; border-radius: 8px; padding: 30px; margin: 30px 0; text-align: left;">
          <h3 style="color: #1e293b; font-size: 20px; margin-bottom: 20px; text-align: center;">🏆 Completion Summary</h3>
          <div style="margin-bottom: 12px;">
            <strong style="color: #374151;">Program:</strong>
            <span style="color: #475569; margin-left: 10px;">${completionDetails.title}</span>
          </div>
          <div style="margin-bottom: 12px;">
            <strong style="color: #374151;">Role:</strong>
            <span style="color: #475569; margin-left: 10px;">${completionDetails.role}</span>
          </div>
          <div style="margin-bottom: 12px;">
            <strong style="color: #374151;">Duration:</strong>
            <span style="color: #475569; margin-left: 10px;">${completionDetails.duration}</span>
          </div>
          <div style="margin-bottom: 12px;">
            <strong style="color: #374151;">Completion Date:</strong>
            <span style="color: #475569; margin-left: 10px;">${completionDetails.completionDate}</span>
          </div>
        </div>

        <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; text-align: left;">
          <p style="color: #047857; font-size: 14px; margin: 0;">
            <strong>🎖️ Achievement Unlocked:</strong> You have successfully completed all requirements and demonstrated excellent performance throughout the internship.
          </p>
        </div>

        <div style="background-color: #fff7ed; border-left: 4px solid #f97316; padding: 15px; margin: 20px 0; text-align: left;">
          <p style="color: #c2410c; font-size: 14px; margin: 0;">
            <strong>📜 Certificate Available:</strong> Your official certificate of completion is now available for download in your dashboard.
          </p>
        </div>

        <a href="https://ajftrust.org/dashboard" style="display: inline-block; background-color: ${this.primaryColor}; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 600; margin-top: 20px;">
          Download Certificate
        </a>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
          <p style="color: #475569; font-size: 14px;">
            Thank you for your dedication and hard work. We wish you the best in your future endeavors!
          </p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: `"${this.companyName}" <${this.configService.get('EMAIL_USER')}>`,
      to: email,
      subject: `🎓 Internship Completion Certificate - ${completionDetails.title}`,
      html: this.getBaseTemplate(content),
     
    };

    const info = await this.transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Internship completion email sending failed:', error);
    throw error;
  }
}

  // NEW METHOD - Send login credentials when admin creates user
  async sendLoginCredentialsEmail(email: string, userName: string, password: string) {
    try {
      const content = `
        <div style="text-align: center;">
          <h2 style="color: #1e293b; font-size: 28px; margin-bottom: 30px;">Welcome to ${this.companyName}!</h2>
          <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
            Hello ${userName}, your account has been created successfully by an administrator. Below are your login credentials to access your account.
          </p>
          
          <div style="background-color: #f1f5f9; border-radius: 8px; padding: 30px; margin: 30px 0; text-align: left;">
            <h3 style="color: #1e293b; font-size: 18px; margin-bottom: 20px; text-align: center;">Your Login Credentials</h3>
            <div style="margin-bottom: 15px;">
              <strong style="color: #374151;">Email:</strong>
              <span style="color: #475569; font-family: monospace; background-color: #ffffff; padding: 4px 8px; border-radius: 4px; margin-left: 10px;">${email}</span>
            </div>
            <div style="margin-bottom: 15px;">
              <strong style="color: #374151;">Password:</strong>
              <span style="color: #475569; font-family: monospace; background-color: #ffffff; padding: 4px 8px; border-radius: 4px; margin-left: 10px; font-weight: bold;">${password}</span>
            </div>
          </div>

         

          <a href="https://ajftrust.org/login" style="display: inline-block; background-color: ${this.primaryColor}; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 600; margin-top: 20px;">
            Login to Your Account
          </a>

          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
            <p style="color: #475569; font-size: 14px;">
              If you have any questions or need assistance, please don't hesitate to contact our support team.
            </p>
          </div>
        </div>
      `;

      const mailOptions = {
        from: `"${this.companyName}" <${this.configService.get('EMAIL_USER')}>`,
        to: email,
        subject: `Your ${this.companyName} Account Login Credentials`,
        html: this.getBaseTemplate(content),
      };

      const info = await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Login credentials email sending failed:', error);
      throw error;
    }
  }

  // NEW METHOD - Send password reset notification when admin resets password
  async sendPasswordResetNotificationEmail(email: string, userName: string, newPassword: string) {
    try {
      const content = `
        <div style="text-align: center;">
          <h2 style="color: #1e293b; font-size: 28px; margin-bottom: 30px;">Password Reset Successful</h2>
          <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
            Hello ${userName}, your password has been reset by an administrator. Below is your new password.
          </p>
          
          <div style="background-color: #f1f5f9; border-radius: 8px; padding: 30px; margin: 30px 0;">
            <h3 style="color: #1e293b; font-size: 18px; margin-bottom: 20px;">Your New Password</h3>
            <div style="background-color: #ffffff; border-radius: 6px; padding: 20px; margin: 15px 0;">
              <span style="font-family: monospace; font-size: 20px; font-weight: bold; color: ${this.primaryColor}; letter-spacing: 2px;">
                ${newPassword}
              </span>
            </div>
          </div>

          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; text-align: left;">
            <p style="color: #92400e; font-size: 14px; margin: 0;">
              <strong>Security Recommendation:</strong> Please change this password to something personal and secure after logging in.
            </p>
          </div>

          <a href="https://kyrolearn.com/login" style="display: inline-block; background-color: ${this.primaryColor}; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 600; margin-top: 20px;">
            Login with New Password
          </a>

          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
            <p style="color: #475569; font-size: 14px;">
              If you didn't request this password reset, please contact support immediately.
            </p>
          </div>
        </div>
      `;

      const mailOptions = {
        from: `"${this.companyName}" <${this.configService.get('EMAIL_USER')}>`,
        to: email,
        subject: 'Your Password Has Been Reset',
        html: this.getBaseTemplate(content),
      };

      const info = await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Password reset notification email sending failed:', error);
      throw error;
    }
  }

  // YOUR EXISTING METHODS FROM paste.txt
  async sendVerificationEmail(email: string, otp: string) {
    try {
      const content = `
        <div style="text-align: center;">
          <h2 style="color: #1e293b; font-size: 28px; margin-bottom: 30px;">Complete Your Account Setup</h2>
          <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
             Thanks for signing up for Kyro Learn! To get started, please confirm your email address using the code below.
          </p>
          <div style="background-color: #f1f5f9; border-radius: 8px; padding: 20px; margin: 30px 0;">
            <span style="font-family: monospace; font-size: 32px; font-weight: bold; color: ${this.primaryColor}; letter-spacing: 4px;">
              ${otp}
            </span>
          </div>
          <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
            This code expires in 24 hours. If you didn't create this account, please disregard this message.
          </p>
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
            <p style="color: #475569; font-size: 14px;">
            If you didn't sign up for Kyro Learn, you can safely ignore this message.
            </p>
          </div>
        </div>
      `;

      const mailOptions = {
        from: `"Kyro Learn" <${this.configService.get('EMAIL_USER')}>`,
        to: email,
        subject: 'Verify Your Email for Kyro Learn',
        html: this.getBaseTemplate(content),
      };

      const info = await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Email sending failed:', error);
      throw error;
    }
  }

  async sendPasswordResetEmail(email: string, resetCode: string) {
    try {
      const content = `
        <div style="text-align: center;">
          <h2 style="color: #1e293b; font-size: 28px; margin-bottom: 30px;">Reset Your Password</h2>
          <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
            We received a request to reset your password. Use the code below to proceed with your password reset.
          </p>
          <div style="background-color: #f1f5f9; border-radius: 8px; padding: 20px; margin: 30px 0;">
            <span style="font-family: monospace; font-size: 32px; font-weight: bold; color: ${this.primaryColor}; letter-spacing: 4px;">
              ${resetCode}
            </span>
          </div>
          <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
            This code will expire in 1 hour. If you didn't request this password reset, please ignore this email or contact support.
          </p>
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
            <p style="color: #475569; font-size: 14px;">
              For security reasons, never share this code with anyone.
            </p>
          </div>
        </div>
      `;

      const mailOptions = {
        from: `"${this.companyName}" <${this.configService.get('EMAIL_USER')}>`,
        to: email,
        subject: 'Password Reset Request',
        html: this.getBaseTemplate(content),
      };

      const info = await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Email sending failed:', error);
      throw error;
    }
  }

async sendRemarkNotificationToAdmin(
  userEmail: string,
  userName: string,
  remarkData: {
    internshipTitle: string;
    requestType: string;
    message: string;
    remarkId: string;
  }
): Promise<boolean> {
  try {
    const requestTypeFormatted = remarkData.requestType.replace(/_/g, ' ').toLowerCase()
      .replace(/\b\w/g, l => l.toUpperCase());
      
    const content = `
      <div style="text-align: center;">
        <h2 style="color: #1e293b; font-size: 28px; margin-bottom: 30px;">📝 New Remark Submitted</h2>
        <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
          A user has submitted a new remark that requires your attention.
        </p>
        
        <div style="background-color: #f1f5f9; border-radius: 8px; padding: 30px; margin: 30px 0; text-align: left;">
          <h3 style="color: #1e293b; font-size: 20px; margin-bottom: 20px; text-align: center;">📋 Remark Details</h3>
          <div style="margin-bottom: 12px;">
            <strong style="color: #374151;">User:</strong>
            <span style="color: #475569; margin-left: 10px;">${userName} (${userEmail})</span>
          </div>
          <div style="margin-bottom: 12px;">
            <strong style="color: #374151;">Internship:</strong>
            <span style="color: #475569; margin-left: 10px;">${remarkData.internshipTitle}</span>
          </div>
          <div style="margin-bottom: 12px;">
            <strong style="color: #374151;">Request Type:</strong>
            <span style="color: #475569; margin-left: 10px;">${requestTypeFormatted}</span>
          </div>
          <div style="margin-bottom: 12px;">
            <strong style="color: #374151;">Remark ID:</strong>
            <span style="color: #475569; margin-left: 10px; font-family: monospace;">${remarkData.remarkId}</span>
          </div>
          <div style="margin-top: 20px; padding: 20px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px;">
            <strong style="color: #374151;">Message:</strong>
            <p style="color: #475569; margin-top: 8px; line-height: 1.6; white-space: pre-line;">${remarkData.message}</p>
          </div>
        </div>

        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; text-align: left;">
          <p style="color: #92400e; font-size: 14px; margin: 0;">
            <strong>Action Required:</strong> Please review this remark and respond through the admin dashboard.
          </p>
        </div>

        <a href="https://ajftrust.org/dashboard/" style="display: inline-block; background-color: ${this.primaryColor}; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 600; margin-top: 20px;">
          Review in Dashboard
        </a>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
          <p style="color: #475569; font-size: 14px;">
            This notification was sent because a user submitted a remark requiring admin attention.
          </p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: `"${this.companyName}" <${this.configService.get('EMAIL_USER')}>`,
      to: this.configService.get('ADMIN_EMAIL') || 'admin@kyrolearn.com',
      subject: `🔔 New ${requestTypeFormatted} from ${userName}`,
      html: this.getBaseTemplate(content),
    };

    const info = await this.transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Remark notification email sending failed:', error);
    throw error;
  }
}

async sendRemarkResponseToUser(
  userEmail: string,
  userName: string,
  responseData: {
    internshipTitle: string;
    originalMessage: string;
    adminResponse: string;
    status: string;
  }
): Promise<boolean> {
  try {
    const statusColor = responseData.status === 'RESOLVED' ? '#10b981' : '#f59e0b';
    const statusBg = responseData.status === 'RESOLVED' ? '#ecfdf5' : '#fff7ed';
    
    const content = `
      <div style="text-align: center;">
        <h2 style="color: #1e293b; font-size: 28px; margin-bottom: 30px;">💬 Response to Your Remark</h2>
        <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
          Hello ${userName}, we have responded to your remark regarding <strong>${responseData.internshipTitle}</strong>.
        </p>
        
        <div style="background-color: #f8fafc; border-radius: 8px; padding: 25px; margin: 30px 0; text-align: left;">
          <h3 style="color: #1e293b; font-size: 18px; margin-bottom: 15px;">📝 Your Original Message</h3>
          <div style="background-color: #ffffff; border-left: 4px solid #cbd5e1; padding: 15px; border-radius: 0 6px 6px 0;">
            <p style="color: #64748b; font-style: italic; line-height: 1.6; margin: 0; white-space: pre-line;">${responseData.originalMessage}</p>
          </div>
        </div>

        <div style="background-color: ${statusBg}; border-left: 4px solid ${statusColor}; padding: 25px; margin: 30px 0; text-align: left; border-radius: 0 8px 8px 0;">
          <h3 style="color: #1e293b; font-size: 18px; margin-bottom: 15px;">💡 Admin Response</h3>
          <p style="color: #374151; line-height: 1.6; margin-bottom: 15px; white-space: pre-line;">${responseData.adminResponse}</p>
          <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid ${statusColor};">
            <strong style="color: #374151;">Status: </strong>
            <span style="color: ${statusColor}; font-weight: 600; text-transform: uppercase; font-size: 14px;">
              ${responseData.status}
            </span>
          </div>
        </div>

        <div style="background-color: #e0f2fe; border-left: 4px solid #0284c7; padding: 15px; margin: 20px 0; text-align: left;">
          <p style="color: #0c4a6e; font-size: 14px; margin: 0;">
            <strong>Need More Help?</strong> If you have additional questions, please submit another remark.
          </p>
        </div>

        <a href="https://ajftrust.org/dashboard/internships" style="display: inline-block; background-color: ${this.primaryColor}; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 600; margin-top: 20px;">
          View Dashboard
        </a>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
          <p style="color: #475569; font-size: 14px;">
            Thank you for your patience. We're here to help you succeed!
          </p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: `"${this.companyName}" <${this.configService.get('EMAIL_USER')}>`,
      to: userEmail,
      subject: `📬 Response to Your Remark - ${responseData.internshipTitle}`,
      html: this.getBaseTemplate(content),
    };

    const info = await this.transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Remark response email sending failed:', error);
    throw error;
  }
}

  async sendWelcomeEmail(email: string, userName: string) {
    try {
      const content = `
        <div style="text-align: center;">
          <h2 style="color: #1e293b; font-size: 28px; margin-bottom: 30px;">Welcome to ${this.companyName}!</h2>
          <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
            Hi ${userName}, we're excited to have you on board!
          </p>
          <div style="background-color: #f1f5f9; border-radius: 8px; padding: 30px; margin: 30px 0; text-align: left;">
            <h3 style="color: #1e293b; font-size: 18px; margin-bottom: 15px;">Here's what you can do next:</h3>
            <ul style="color: #475569; font-size: 16px; line-height: 1.6; margin: 0; padding-left: 20px;">
              <li style="margin-bottom: 10px;">Complete your profile</li>
              <li style="margin-bottom: 10px;">Explore our features</li>
              <li style="margin-bottom: 10px;">Connect with others</li>
              <li>Check out our getting started guide</li>
            </ul>
          </div>
          <a href="https://ajftrust.org" style="display: inline-block; background-color: ${this.primaryColor}; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 600; margin-top: 20px;">
            Get Started
          </a>
        </div>
      `;

      const mailOptions = {
        from: `"${this.companyName}" <${this.configService.get('EMAIL_USER')}>`,
        to: email,
        subject: `Welcome to ${this.companyName}!`,
        html: this.getBaseTemplate(content),
      };

      const info = await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Email sending failed:', error);
      throw error;
    }
  }
}