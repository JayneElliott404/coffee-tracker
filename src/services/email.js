import { Resend } from 'resend';
import { CONFIRM_EMAIL, issueToken } from './emailTokens.js';

export const FROM_ADDRESS = 'Nespresso Tracker <noreply@nespresso-tracker.com>';

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let client;
const getClient = () => (client ??= new Resend(process.env.RESEND_API_KEY));

// Links always use APP_URL rather than the request's Host header, which an attacker can forge.
export function appUrl() {
  return (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
}

export async function sendEmail({ to, subject, text, html }) {
  if (!process.env.RESEND_API_KEY) {
    // Development and tests: no key, so show the message instead of sending it.
    console.log(`\n[email not sent: RESEND_API_KEY is not set]\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }
  // Resend reports failures in the result rather than throwing.
  const { error } = await getClient().emails.send({ from: FROM_ADDRESS, to, subject, text, html });
  if (error) throw new Error(`Resend could not send "${subject}": ${error.message}`);
}

const layout = (name, intro, url, buttonLabel, outro) => ({
  html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#3b2a20">
<h2 style="margin-bottom:8px">Nespresso Tracker</h2>
<p>Hi ${escapeHtml(name)},</p>
<p>${intro}</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#3b2a20;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${buttonLabel}</a></p>
<p style="font-size:13px">Or copy this link into your browser:<br>${escapeHtml(url)}</p>
<p style="font-size:13px;color:#777">${outro}</p>
</div>`,
});

export function sendConfirmationEmail(user, token) {
  const url = `${appUrl()}/confirm-email/${token}`;
  return sendEmail({
    to: user.username,
    subject: 'Confirm your email address',
    text: `Hi ${user.name},\n\nPlease confirm your email address to start using Nespresso Tracker:\n${url}\n\nThis link expires in 24 hours. If you didn't create an account, you can ignore this email.`,
    ...layout(user.name, 'Please confirm your email address to start using Nespresso Tracker.', url, 'Confirm my email', "This link expires in 24 hours. If you didn't create an account, you can ignore this email."),
  });
}

// Sends a fresh confirmation email unless one went out recently. Never throws, so callers can treat it as best effort.
export async function sendConfirmation(user) {
  try {
    const token = await issueToken(user._id, CONFIRM_EMAIL);
    if (token) await sendConfirmationEmail(user, token);
  } catch (err) {
    console.error('Could not send confirmation email:', err);
  }
}

export function sendPasswordResetEmail(user, token) {
  const url = `${appUrl()}/reset-password/${token}`;
  return sendEmail({
    to: user.username,
    subject: 'Reset your password',
    text: `Hi ${user.name},\n\nSomeone asked to reset your Nespresso Tracker password. To choose a new one, open:\n${url}\n\nThis link expires in 1 hour and works once. If it wasn't you, ignore this email; your password won't change.`,
    ...layout(user.name, 'Someone asked to reset your Nespresso Tracker password. Choose a new one with the button below.', url, 'Reset my password', "This link expires in 1 hour and works once. If it wasn't you, ignore this email; your password won't change."),
  });
}
