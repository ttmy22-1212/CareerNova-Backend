import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private oauth2Client: any;

  constructor() {
    this.logger.log(
      'Initializing Email Service using Pure Google HTTP API (No SMTP)',
    );

    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    this.oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });
  }

  private buildRawEmail(
    from: string,
    to: string,
    subject: string,
    htmlContent: string,
  ): string {
    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;

    const emailLines = [
      `From: ${from}`,
      `To: ${to}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${encodedSubject}`,
      '',
      htmlContent,
    ];

    const email = emailLines.join('\r\n');

    return Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private async sendEmailViaAPI(
    to: string,
    subject: string,
    htmlContent: string,
  ) {
    try {
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      const fromEmail = `"CareerNova Support" <${process.env.GMAIL_USER}>`;
      const raw = this.buildRawEmail(fromEmail, to, subject, htmlContent);

      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: raw,
        },
      });

      return { success: true };
    } catch (error) {
      this.logger.error(
        'Error sending email through Pure Google HTTP API:',
        error,
      );
      throw error;
    }
  }

  async sendVerificationEmail(email: string, token: string) {
    const verificationUrl = `${process.env.FRONTEND_URL}/email-verified?token=${token}`;

    console.log('Sending verification email to:', email);
    console.log('Token:', token);
    console.log('Verification URL:', verificationUrl);

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #334155;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f8fafc;
        }
        .container {
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
          border-radius: 24px;
          padding: 40px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }
        .logo {
          text-align: center;
          margin-bottom: 30px;
        }
        .logo h1 {
          color: #1e40af;
          font-size: 32px;
          margin: 0;
          letter-spacing: -1px;
        }
        .content {
          background: white;
          border-radius: 16px;
          padding: 35px;
          margin-bottom: 20px;
          border: 1px solid #e2e8f0;
        }
        .welcome-text {
          font-size: 18px;
          font-weight: 600;
          color: #1e293b;
          margin-top: 0;
        }
        .button-container {
          text-align: center;
          margin: 30px 0;
        }
        .button {
          display: inline-block;
          padding: 16px 45px;
          background-color: #2563eb;
          color: #ffffff !important;
          text-decoration: none;
          border-radius: 12px;
          font-weight: bold;
          font-size: 16px;
          transition: background-color 0.3s ease;
        }
        .footer {
          text-align: center;
          color: #64748b;
          font-size: 13px;
          margin-top: 25px;
        }
        .warning-box {
          background: #fffbeb;
          border-left: 4px solid #f59e0b;
          padding: 15px;
          margin-top: 25px;
          border-radius: 8px;
          font-size: 13px;
          color: #92400e;
        }
        .link-alt {
          word-break: break-all;
          color: #3b82f6;
          font-size: 12px;
          margin-top: 10px;
          display: block;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">
          <h1>🚀 CareerNova</h1>
        </div>
        
        <div class="content">
          <p class="welcome-text">Chào mừng bạn gia nhập CareerNova!</p>
          
          <p>Cảm ơn bạn đã tin tưởng lựa chọn chúng tôi để đồng hành trên con đường phát triển sự nghiệp. Chỉ còn một bước cuối cùng để kích hoạt tài khoản của bạn.</p>
          
          <p>Vui lòng nhấn vào nút bên dưới để xác thực địa chỉ email:</p>
          
          <div class="button-container">
            <a href="${verificationUrl}" class="button">Xác thực tài khoản</a>
          </div>
          
          <p>Nếu nút trên không hoạt động, bạn có thể sao chép và dán liên kết này vào trình duyệt:</p>
          <a href="${verificationUrl}" class="link-alt">${verificationUrl}</a>
          
          <div class="warning-box">
            <strong>Lưu ý:</strong> Liên kết này sẽ hết hạn trong vòng <strong>24 giờ</strong>. Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.
          </div>
        </div>
        
        <div class="footer">
          <p>© 2026 CareerNova. All rights reserved.</p>
          <p>District 1, Ho Chi Minh City, Vietnam</p>
        </div>
      </div>
    </body>
    </html>
    `;

    await this.sendEmailViaAPI(
      email,
      '🚀 Xác thực tài khoản CareerNova của bạn',
      htmlContent,
    );
    console.log(`Verification email successfully sent to ${email}`);
    return { success: true };
  }

  async sendPasswordResetEmail(email: string, resetToken: string) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #334155;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f8fafc;
        }
        .container {
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
          border-radius: 24px;
          padding: 40px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }
        .logo {
          text-align: center;
          margin-bottom: 30px;
        }
        .logo h1 {
          color: #1e40af;
          font-size: 32px;
          margin: 0;
          letter-spacing: -1px;
        }
        .content {
          background: white;
          border-radius: 16px;
          padding: 35px;
          margin-bottom: 20px;
          border: 1px solid #e2e8f0;
        }
        .title {
          font-size: 20px;
          font-weight: 700;
          color: #1e293b;
          margin-top: 0;
          text-align: center;
        }
        .button-container {
          text-align: center;
          margin: 30px 0;
        }
        .button {
          display: inline-block;
          padding: 16px 45px;
          background-color: #134074;
          color: #ffffff !important;
          text-decoration: none;
          border-radius: 12px;
          font-weight: bold;
          font-size: 16px;
        }
        .warning-box {
          background: #fffbeb;
          border-left: 4px solid #f59e0b;
          padding: 15px;
          margin-top: 25px;
          border-radius: 8px;
          font-size: 13px;
          color: #92400e;
        }
        .footer {
          text-align: center;
          color: #64748b;
          font-size: 13px;
          margin-top: 25px;
        }
        .link-alt {
          word-break: break-all;
          color: #3b82f6;
          font-size: 12px;
          margin-top: 10px;
          display: block;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">
          <h1>🚀 CareerNova</h1>
        </div>
        
        <div class="content">
          <h2 class="title">Đặt lại mật khẩu</h2>
          
          <p>Chào bạn,</p>
          <p>Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản CareerNova của bạn. Nếu bạn thực sự yêu cầu điều này, hãy nhấn vào nút bên dưới để tạo mật khẩu mới:</p>
          
          <div class="button-container">
            <a href="${resetUrl}" class="button">Đặt lại mật khẩu</a>
          </div>
          
          <p>Hoặc sao chép liên kết này vào trình duyệt của bạn:</p>
          <a href="${resetUrl}" class="link-alt">${resetUrl}</a>
          
          <div class="warning-box">
            <strong>Chú ý:</strong> Liên kết này sẽ hết hạn sau <strong>1 giờ</strong>. Nếu bạn không yêu cầu đặt lại mật khẩu, bạn có thể an tâm bỏ qua email này, mật khẩu của bạn sẽ không bị thay đổi.
          </div>
        </div>
        
        <div class="footer">
          <p>© 2026 CareerNova. All rights reserved.</p>
          <p>Hệ thống hỗ trợ nghề nghiệp CareerNova</p>
        </div>
      </div>
    </body>
    </html>
    `;

    await this.sendEmailViaAPI(
      email,
      '🔐 Khôi phục mật khẩu CareerNova của bạn',
      htmlContent,
    );
    console.log(`Password reset email successfully sent to ${email}`);
    return { success: true };
  }
}
