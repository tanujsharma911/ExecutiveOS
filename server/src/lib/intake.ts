/**
 * Intake: a coach's public form where a new client enters their details, picks a program and pays
 * with PayPal. A completed payment creates the client account (exactly once) and emails a random
 * password that must be changed at first sign-in.
 */
import { randomBytes, randomInt } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../db.js'
import { appUrl, escapeHtml, layout, sendEmail } from './email.js'
import { createLogger } from './logger.js'
import { cancelSubscription } from './paypal.js'

const log = createLogger('intake')

const Link = z.object({ label: z.string().trim().min(1).max(60), url: z.string().trim().max(500).regex(/^https?:\/\/[^\s.]+\.[^\s]+$/i, 'Links must start with http:// or https://') })

/** What the intake form collects. */
export const IntakeDetails = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: z.string().trim().max(40).optional().default(''),
  company: z.string().trim().min(1, 'Enter your company').max(120),
  role: z.string().trim().min(1, 'Enter your role').max(120),
  industry: z.string().trim().max(120).optional().default(''),
  companySize: z.string().trim().max(60).optional().default(''),
  location: z.string().trim().min(1, 'Enter your location').max(120),
  links: z.array(Link).max(10).optional().default([]),
  goals: z.string().trim().max(2000).optional().default(''),
})
export type IntakeDetails = z.infer<typeof IntakeDetails>

/** Coach's reusable intake token, created on first use. */
export async function coachIntakeToken(coachId: string): Promise<string> {
  const coach = await prisma.user.findUniqueOrThrow({ where: { id: coachId }, select: { intakeToken: true } })
  if (coach.intakeToken) return coach.intakeToken
  const token = randomBytes(12).toString('base64url')
  await prisma.user.update({ where: { id: coachId }, data: { intakeToken: token } })
  return token
}

export const intakeUrl = (token: string, prospectId?: string) => `${appUrl()}/intake/${token}${prospectId ? `?p=${encodeURIComponent(prospectId)}` : ''}`

/**
 * Demo mode (SHOW_DEMO_ACCOUNTS is not "false"): every client uses the shared demo password, so anyone trying
 * the app can sign in from the demo list. Turn it off for real use: clients then get a random password by email
 * and must change it at first sign-in.
 */
export const demoMode = () => process.env.SHOW_DEMO_ACCOUNTS !== 'false'
export const demoClientPassword = () => process.env.SEED_CLIENT_PASSWORD ?? 'Client@2026'
/** The password a new (or reset) client gets, and whether they must change it at first sign-in. */
export const newClientPassword = () => (demoMode() ? { password: demoClientPassword(), mustChange: false } : { password: randomPassword(), mustChange: true })

/** Readable, unambiguous random password (no 0/O, 1/l/I). */
export function randomPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < length; i++) out += chars[randomInt(chars.length)]
  return out
}

/** Sign-in email with a temporary password (also used by "Resend sign-in email"). */
export async function sendWelcomeEmail(o: { coachId: string; name: string; email: string; password: string; mustChange?: boolean; programName?: string | null; paidCents?: number; renewsEveryWeeks?: number; resend?: boolean }) {
  const coach = await prisma.user.findUniqueOrThrow({ where: { id: o.coachId }, select: { name: true, email: true } })
  const login = `${appUrl()}/login`
  const mustChange = o.mustChange ?? true
  const label = mustChange ? 'Temporary password' : 'Password'
  const joined = o.programName ? `${o.programName} with ${coach.name}` : `coaching with ${coach.name}`
  const intro = o.resend
    ? `${coach.name} sent you new sign-in details for ExecutiveOS.`
    : `Thank you for joining ${joined}.${o.paidCents ? ` Your payment of ${usd(o.paidCents)} was received.` : ''}${o.paidCents && o.renewsEveryWeeks ? ` Your program renews automatically every ${o.renewsEveryWeeks} weeks through PayPal; you can cancel anytime in your PayPal account.` : ''}`
  return sendEmail({
    to: o.email,
    replyTo: coach.email,
    subject: o.resend ? 'Your new ExecutiveOS sign-in details' : `Welcome to ${o.programName ?? 'ExecutiveOS'}: your sign-in details`,
    text: `Hi ${o.name},\n\n${intro}\n\nSign in at ${login}\nEmail: ${o.email}\n${label}: ${o.password}\n\n${mustChange ? "For your security you'll be asked to choose a new password the first time you sign in." : 'This is a demo account, so this password is shared with the other demo clients.'}\n\n— ExecutiveOS`,
    html: layout({
      heading: o.resend ? 'Your new sign-in details' : `Welcome to ${o.programName ?? 'ExecutiveOS'}`,
      paragraphs: [
        `Hi ${escapeHtml(o.name)}, ${escapeHtml(intro)}`,
        `<b>Email:</b> ${escapeHtml(o.email)}<br/><b>${label}:</b> <code style="font-size:15px;background:#f4f4f5;padding:2px 6px;border-radius:4px">${escapeHtml(o.password)}</code>`,
        mustChange ? 'For your security, you will be asked to <b>change this password the first time you sign in</b>.' : 'This is a demo account, so this password is shared with the other demo clients.',
      ],
      button: { label: 'Sign in to ExecutiveOS', url: login },
      footer: `Questions? Reply to this email to reach ${escapeHtml(coach.name)}.`,
    }),
  })
}

const AVATARS = ['#4f46e5', '#0f766e', '#b45309', '#be185d', '#0369a1', '#7c3aed', '#15803d']
export const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`

/**
 * Marks the payment COMPLETED and creates the client — once. Safe to call from both the browser
 * capture and the PayPal webhook: only the first caller that flips CREATED → COMPLETED creates anything.
 */
export interface SubscriptionStart {
  paypalSubscriptionId: string
  paypalPlanId: string
  lastPaymentAt: Date | null
  nextBillingAt: Date | null
}

export async function completeIntakePayment(paymentId: string, paid: { captureId?: string; subscription?: SubscriptionStart }): Promise<{ clientId: string | null; created: boolean }> {
  let password: string | null = null
  let mustChange = true
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.intakePayment.updateMany({ where: { id: paymentId, status: 'CREATED' }, data: { status: 'COMPLETED', paypalCaptureId: paid.captureId ?? null, completedAt: new Date() } })
    const payment = await tx.intakePayment.findUniqueOrThrow({ where: { id: paymentId }, include: { program: true } })
    if (claimed.count === 0) return { clientId: payment.clientId, created: false, payment }

    const d = IntakeDetails.parse(payment.details)
    const existing = await tx.user.findUnique({ where: { email: d.email } })
    if (existing) {
      // Checked before payment too; if an account appeared in between, keep the payment and flag it to the coach.
      await tx.notification.create({ data: { userId: payment.coachId, title: `Payment received from ${d.name}`, body: `${usd(payment.amountCents)} for ${payment.program.name}, but ${d.email} already has an account, so no new client was created. Please follow up.`, kind: 'payment' } })
      return { clientId: null, created: false, payment }
    }

    const creds = newClientPassword()
    password = creds.password
    mustChange = creds.mustChange
    const user = await tx.user.create({
      data: {
        email: d.email,
        name: d.name,
        role: 'CLIENT',
        title: `${d.role}, ${d.company}`,
        avatarColor: AVATARS[randomInt(AVATARS.length)],
        passwordHash: await bcrypt.hash(password, 10),
        mustChangePassword: creds.mustChange,
      },
    })
    const profile = await tx.clientProfile.create({
      data: {
        userId: user.id,
        coachId: payment.coachId,
        programId: payment.programId,
        company: d.company,
        designation: d.role,
        industry: d.industry,
        companySize: d.companySize,
        location: d.location,
        phone: d.phone || null,
        links: d.links,
        startDate: new Date(),
        coachNotes: d.goals ? `From the intake form: ${d.goals}` : '',
      },
    })
    // Same reflection forms the coach already uses with their other clients.
    const forms = await tx.form.findMany({ where: { coachId: payment.coachId, status: 'PUBLISHED' }, select: { id: true } })
    if (forms.length) await tx.formAssignment.createMany({ data: forms.map((f) => ({ formId: f.id, clientId: profile.id })), skipDuplicates: true })

    await tx.intakePayment.update({ where: { id: payment.id }, data: { clientId: profile.id } })
    if (paid.subscription) {
      await tx.subscription.create({
        data: {
          coachId: payment.coachId,
          clientId: profile.id,
          programId: payment.programId,
          paypalSubscriptionId: paid.subscription.paypalSubscriptionId,
          paypalPlanId: paid.subscription.paypalPlanId,
          amountCents: payment.amountCents,
          intervalWeeks: payment.program.durationWeeks,
          lastPaymentAt: paid.subscription.lastPaymentAt ?? new Date(),
          nextBillingAt: paid.subscription.nextBillingAt,
        },
      })
    }

    // Link to the prospect: the one the link was sent to, else one with the same email, else a new record.
    const prospect =
      (payment.prospectId && (await tx.prospect.findFirst({ where: { id: payment.prospectId, coachId: payment.coachId } }))) ||
      (await tx.prospect.findFirst({ where: { coachId: payment.coachId, email: { equals: d.email, mode: 'insensitive' }, clientId: null } }))
    const prospectData = { status: 'CONVERTED' as const, clientId: profile.id, email: d.email, company: d.company, role: d.role, phone: d.phone || null, location: d.location, links: d.links }
    const linked = prospect
      ? await tx.prospect.update({ where: { id: prospect.id }, data: prospectData })
      : await tx.prospect.create({ data: { coachId: payment.coachId, name: d.name, industry: d.industry, companySize: d.companySize, notes: 'Joined through the intake form.', ...prospectData } })
    // The intake-assistant conversation now belongs to this prospect, so the coach can read it on their page.
    if (payment.chatId) await tx.intakeChat.updateMany({ where: { id: payment.chatId, prospectId: null }, data: { prospectId: linked.id } })

    await tx.notification.create({
      data: { userId: payment.coachId, title: `${d.name} joined ${payment.program.name}`, body: `Paid ${usd(payment.amountCents)} with PayPal${paid.subscription ? `, renewing every ${payment.program.durationWeeks} weeks` : ''}. Their client account is ready.`, link: `/coach/clients/${profile.id}`, kind: 'payment' },
    })
    return { clientId: profile.id, created: true, payment }
  })

  // An auto-renewing payment that couldn't become a client must not keep billing.
  if (!result.created && result.clientId === null && paid.subscription) {
    await cancelSubscription(paid.subscription.paypalSubscriptionId, 'Account already existed; coach will follow up').catch((e) => log.error('Could not cancel orphan subscription', { error: (e as Error).message }))
  }

  if (result.created && password) {
    const d = IntakeDetails.parse(result.payment.details)
    const mail = await sendWelcomeEmail({ coachId: result.payment.coachId, name: d.name, email: d.email, password, mustChange, programName: result.payment.program.name, paidCents: result.payment.amountCents, renewsEveryWeeks: paid.subscription ? result.payment.program.durationWeeks : undefined })
    if (!mail.sent) {
      await prisma.notification.create({
        data: { userId: result.payment.coachId, title: `Welcome email to ${d.name} was not sent`, body: `${mail.error ?? 'Email failed'}. Open their client page and use "Resend sign-in email".`, link: `/coach/clients/${result.clientId}`, kind: 'warning' },
      })
    }
    log.info('Client created from intake payment', { paymentId, clientId: result.clientId, emailSent: mail.sent })
  }
  return { clientId: result.clientId, created: result.created }
}
