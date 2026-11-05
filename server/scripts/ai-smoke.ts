import { prisma } from '../src/db.js'
import { runIntelligence } from '../src/ai/intelligence.js'
for (const c of await prisma.clientProfile.findMany({ include: { user: true } })) {
  const r = await runIntelligence(c.id)
  console.log('=====', r.clientName, r.mode)
  console.log(r.narrative)
  console.log('trace', r.trace.map(t=>`${t.tool}:${t.summary}`).join(' | '))
  for (const k of ['recurring','emerging','disappearing','contradictions','unresolved'] as const) console.log(k, (r[k] as any[]).map(i=>`${i.title} [${i.confidence}]`))
  console.log('emo', r.emotional.insights.map(i=>i.title + ' :: ' + (i.hypothesis??'')))
  console.log('cm', r.commitments.insights.map(i=>i.summary), r.commitments.summary)
  console.log('opps', r.opportunities.map(o=>o.question))
  console.log('contra', JSON.stringify(r.contradictions[0]?.facts))
}
await prisma.$disconnect()
