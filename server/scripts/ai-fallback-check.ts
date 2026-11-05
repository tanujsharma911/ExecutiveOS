/**
 * Shows which AI path serves each call: Gemini → Groq → (deterministic, only if DETERMINISTIC_FALLBACK=true).
 * Run: npm run ai:fallback-check
 */
import { prisma } from '../src/db.js'
import { generateForm } from '../src/ai/assist.js'
import { runIntelligence } from '../src/ai/intelligence.js'
import { aiMode, aiModelName, deterministicFallback } from '../src/ai/model.js'

console.log('mode:', aiMode(), '| chain:', aiModelName(), '| DETERMINISTIC_FALLBACK:', deterministicFallback())
const c = await prisma.clientProfile.findFirstOrThrow()
try {
  const r = await runIntelligence(c.id, { fresh: true })
  console.log('intelligence served by:', r.model, '| recurring patterns:', r.recurring.length, '| tool calls:', r.trace.length)
} catch (e) {
  console.log('intelligence failed:', (e as Error).message)
}
try {
  const f = await generateForm('Weekly reflection for a CEO working on delegation')
  console.log('form generated via:', f.mode, '|', f.questions.length, 'questions')
} catch (e) {
  console.log('form generation failed:', (e as Error).message)
}
await prisma.$disconnect()
