/**
 * Demo only: sets every client's password to the shared demo password (SEED_CLIENT_PASSWORD, default Client@2026)
 * and clears "must change password". Use it for clients who joined through the intake form before demo mode
 * gave them the shared password.   npm --prefix server run db:demo-passwords
 */
import '../src/env.js'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/db.js'
import { demoClientPassword, demoMode } from '../src/lib/intake.js'

if (!demoMode()) {
  console.error('SHOW_DEMO_ACCOUNTS is "false" (real use): refusing to set shared passwords.')
  process.exit(1)
}
const r = await prisma.user.updateMany({ where: { role: 'CLIENT' }, data: { passwordHash: await bcrypt.hash(demoClientPassword(), 10), mustChangePassword: false } })
console.log(`Set the demo password for ${r.count} client account(s).`)
await prisma.$disconnect()
