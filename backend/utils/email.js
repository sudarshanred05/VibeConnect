const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: process.env.EMAIL_PORT || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log("⚠️  Email not sent (credentials not configured)");
      console.log(`To: ${to}, Subject: ${subject}`);
      return { sent: false, reason: "Email credentials not configured" };
    }

    const info = await transporter.sendMail({
      from: `"VibeConnect" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });

    console.log(`✉️  Email sent: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error("Email error:", error.message);
    return { sent: false, error: error.message };
  }
};

exports.sendApprovalEmail = async (user) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4CAF50;">Account Approved! ✓</h2>
      <p>Hi <strong>${user.name}</strong>,</p>
      <p>Your account has been approved by the administrator.</p>
      <p>You can now log in to <strong>VibeConnect</strong> using your credentials.</p>
      <p><strong>Role:</strong> ${user.role}</p>
      ${user.managerId ? `<p><strong>Manager ID:</strong> ${user.managerId}</p>` : ""}
      <p style="margin-top: 30px;">
        <a href="${process.env.CLIENT_URL || "http://localhost:3001"}/login" 
           style="background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Login Now
        </a>
      </p>
      <p style="color: #666; margin-top: 30px; font-size: 12px;">
        This is an automated email from VibeConnect.
      </p>
    </div>
  `;

  const text = `Hi ${user.name},\n\nYour account has been approved. You can now log in to VibeConnect.\n\nRole: ${user.role}`;

  return sendEmail({
    to: user.email,
    subject: "Account Approved - VibeConnect",
    html,
    text,
  });
};

exports.sendRejectionEmail = async (user) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #f44336;">Registration Rejected</h2>
      <p>Hi <strong>${user.name}</strong>,</p>
      <p>Unfortunately, your registration request has been rejected by the administrator.</p>
      <p>If you believe this was a mistake, please contact the administrator at 
         <a href="mailto:admin@gmail.com">admin@gmail.com</a>.
      </p>
      <p style="color: #666; margin-top: 30px; font-size: 12px;">
        This is an automated email from VibeConnect.
      </p>
    </div>
  `;

  const text = `Hi ${user.name},\n\nYour registration request has been rejected. Please contact admin@gmail.com for more information.`;

  return sendEmail({
    to: user.email,
    subject: "Registration Rejected - VibeConnect",
    html,
    text,
  });
};

exports.sendAdminReminder = async (pendingUsers) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #FF9800;">⏰ Pending User Approval Reminder</h2>
      <p>There are <strong>${pendingUsers.length}</strong> user(s) pending approval for more than 46 hours.</p>
      <ul style="list-style: none; padding: 0;">
        ${pendingUsers
          .map(
            (u) => `
          <li style="padding: 8px; border-bottom: 1px solid #eee;">
            <strong>${u.name}</strong> (${u.email})<br>
            <small style="color: #666;">Registered: ${new Date(u.createdAt).toLocaleString()}</small>
          </li>
        `,
          )
          .join("")}
      </ul>
      <p style="margin-top: 30px;">
        <a href="${process.env.CLIENT_URL || "http://localhost:3001"}/admin" 
           style="background: #FF9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Review Pending Users
        </a>
      </p>
      <p style="color: #666; margin-top: 30px; font-size: 12px;">
        This is an automated reminder from VibeConnect.
      </p>
    </div>
  `;

  const text = `Pending User Approval Reminder\n\nThere are ${pendingUsers.length} user(s) pending approval for more than 46 hours.\n\nPlease review them in the admin panel.`;

  return sendEmail({
    to: "admin@gmail.com",
    subject: "⏰ Pending User Approval Reminder - VibeConnect",
    html,
    text,
  });
};
