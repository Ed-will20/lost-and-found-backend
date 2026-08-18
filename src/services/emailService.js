const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// TODO: update this to match the exact sending address you set up in
// Resend for the notify.eyefoundyou.com subdomain (e.g. the address
// shown on your verified domain's "Sending" page).
const FROM_EMAIL = 'EyeFoundYou <noreply@notify.eyefoundyou.com>';

const SITE_URL = 'https://eyefoundyou.com';

// Fire-and-forget wrapper: notifications should never block or fail the
// actual app action (claim submitted, message sent, etc). Errors are
// logged, not thrown, so a Resend outage never breaks the core flow.
async function send({ to, subject, html }) {
  if (!to) return;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html
    });
  } catch (error) {
    console.error('Email send error:', error);
  }
}

function wrapper(bodyHtml) {
  return `
    <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #2563eb; margin-bottom: 4px;">EyeFoundYou</h2>
      ${bodyHtml}
      <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">
        You are receiving this because you have an account on eyefoundyou.com.
      </p>
    </div>
  `;
}

// Notify the finder that someone submitted a claim on their item.
exports.sendClaimSubmittedEmail = async ({ finderEmail, finderName, claimerName, itemTitle }) => {
  await send({
    to: finderEmail,
    subject: `New claim submitted for "${itemTitle}"`,
    html: wrapper(`
      <p>Hi ${finderName || 'there'},</p>
      <p><strong>${claimerName}</strong> submitted a claim for your item "<strong>${itemTitle}</strong>".</p>
      <p><a href="${SITE_URL}/dashboard" style="color: #2563eb;">Review the claim on your dashboard</a></p>
    `)
  });
};

// Notify the claimant that their claim was approved or rejected.
exports.sendClaimDecisionEmail = async ({ claimerEmail, claimerName, itemTitle, approved, chatId, rejectionReason }) => {
  const subject = approved
    ? `Your claim for "${itemTitle}" was approved`
    : `Update on your claim for "${itemTitle}"`;

  const body = approved
    ? `
      <p>Hi ${claimerName || 'there'},</p>
      <p>Good news - your claim for "<strong>${itemTitle}</strong>" was approved.</p>
      <p><a href="${SITE_URL}/chats/${chatId}" style="color: #2563eb;">Open the chat to arrange return</a></p>
    `
    : `
      <p>Hi ${claimerName || 'there'},</p>
      <p>Your claim for "<strong>${itemTitle}</strong>" was not approved.</p>
      ${rejectionReason ? `<p>Reason: ${rejectionReason}</p>` : ''}
      <p><a href="${SITE_URL}/dashboard" style="color: #2563eb;">View your claims</a></p>
    `;

  await send({ to: claimerEmail, subject, html: wrapper(body) });
};

// Notify the recipient of a chat message that a new message arrived.
exports.sendNewMessageEmail = async ({ recipientEmail, recipientName, senderName, itemTitle, chatId }) => {
  await send({
    to: recipientEmail,
    subject: `New message from ${senderName}`,
    html: wrapper(`
      <p>Hi ${recipientName || 'there'},</p>
      <p><strong>${senderName}</strong> sent you a message about "<strong>${itemTitle}</strong>".</p>
      <p><a href="${SITE_URL}/chats/${chatId}" style="color: #2563eb;">Open the chat</a></p>
    `)
  });
};
