/**
 * Transactional email through Resend (https://resend.com), using its REST API.
 *
 * RESEND_API_KEY  — from the Resend dashboard. Without it, emails are logged instead of sent (local dev).
 * EMAIL_FROM      — e.g. "ExecutiveOS <coach@yourdomain.com>". Defaults to Resend's test sender
 *                   onboarding@resend.dev, which only delivers to the Resend account owner's address,
 *                   so verify your own domain in Resend before emailing real clients.
 */
import { createLogger } from './logger.js'

const log = createLogger('email')

export interface Email {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}

export const emailConfigured = () => !!process.env.RESEND_API_KEY

/** App URL used in email links (login, intake). */
export const appUrl = () => {
  const configured = process.env.APP_URL?.trim()
  const renderUrl = process.env.RENDER_EXTERNAL_URL?.trim()
  const configuredIsLocal = configured ? /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(configured) : false
  const url = renderUrl && (!configured || configuredIsLocal) ? renderUrl : configured || renderUrl || `http://localhost:${process.env.WEB_PORT || 7462}`
  return url.replace(/\/$/, '')
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Sends an email. Returns { sent: false } instead of throwing, so a mail outage never breaks a payment flow. */
export async function sendEmail(email: Email): Promise<{ sent: boolean; id?: string; error?: string }> {
  if (!emailConfigured()) {
    log.warn('RESEND_API_KEY not set: email not sent (logged instead)', { to: email.to, subject: email.subject })
    log.info('Email body (dev only)', { text: email.text })
    return { sent: false, error: 'Email is not configured (RESEND_API_KEY missing)' }
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'ExecutiveOS <onboarding@resend.dev>',
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
      }),
    })
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
    if (!res.ok) {
      log.error('Resend rejected the email', { to: email.to, status: res.status, error: body.message })
      return { sent: false, error: body.message ?? `Resend error ${res.status}` }
    }
    log.info('Email sent', { to: email.to, subject: email.subject, id: body.id })
    return { sent: true, id: body.id }
  } catch (e) {
    log.error('Email send failed', { to: email.to, error: (e as Error).message })
    return { sent: false, error: (e as Error).message }
  }
}

/** Simple branded HTML wrapper: a heading, paragraphs and an optional button. */
export function layout({ heading, paragraphs, button, footer }: { heading: string; paragraphs: string[]; button?: { label: string; url: string }; footer?: string }) {
  const p = paragraphs.map((x) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#27272a">${x}</p>`).join('')
  const b = button
    ? `<p style="margin:22px 0"><a href="${escape(button.url)}" style="display:inline-block;background:#5b5bd6;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;font-size:14px">${escape(button.label)}</a></p>`
    : ''
  const f = footer ? `<p style="margin:24px 0 0;font-size:12px;color:#71717a">${footer}</p>` : ''
  return `<!doctype html><html><body style="margin:0;background:#fafaf9;font-family:Inter,ui-sans-serif,system-ui,sans-serif"><div style="max-width:560px;margin:0 auto;padding:32px 24px"><div style="font-weight:700;font-size:15px;margin-bottom:20px">ExecutiveOS</div><div style="background:#fff;border:1px solid #e7e6e3;border-radius:12px;padding:28px"><h1 style="margin:0 0 16px;font-size:20px;color:#18181b">${escape(heading)}</h1>${p}${b}</div>${f}</div></body></html>`
}

export { escape as escapeHtml }
