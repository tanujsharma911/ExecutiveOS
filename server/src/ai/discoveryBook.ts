/**
 * Discovery Call Book — AI help preparing a discovery call with a prospect.
 * The coach edits one rich-text book (TipTap JSON): a template, plus a tailored copy per prospect.
 *
 * 1. Research: read the text of the prospect's public web pages (website, articles). Social networks
 *    that block automated reading (LinkedIn etc.) are skipped; coaches can paste notes instead.
 * 2. Compose (Gemini → Groq): a short book following the framework:
 *    Intro, rapport & frame → Info gathering (pains, problems, highlights, tied to profitability) → Transition,
 *    plus a coach-only fit check. Concise by design: no filler, nothing obvious.
 */
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { z } from 'zod'
import { createLogger } from '../lib/logger.js'
import { aiMode, deterministicFallback, invokeStructured, unavailable } from './model.js'

const log = createLogger('discovery')

export interface BookItem {
  text: string
  group?: string
  source?: string
}
export interface BookSection {
  key: SectionKey
  title: string
  items: BookItem[]
}
export interface BookContent {
  sections: BookSection[]
}
export type SectionKey = 'snapshot' | 'online' | 'intro' | 'gathering' | 'transition' | 'fit'

export const SECTION_TITLES: Record<SectionKey, string> = {
  snapshot: 'Prospect snapshot',
  online: 'What we found online',
  intro: '1. Intro, rapport & frame',
  gathering: '2. Info gathering',
  transition: '3. Transition',
  fit: 'Fit check (coach only)',
}
export const SECTION_KEYS = Object.keys(SECTION_TITLES) as SectionKey[]

export interface ProspectInput {
  name: string
  company?: string
  role?: string
  industry?: string
  companySize?: string
  location?: string
  notes?: string
  links?: { label: string; url: string }[]
}

export interface ResearchPage {
  url: string
  title: string
  text: string
}

// ── Research ──────────────────────────────────────────────────────────────────

/** Sites that require a login or block automated reading — skip rather than fetch a sign-in wall. */
const SKIP_HOSTS = /(^|\.)(linkedin\.com|facebook\.com|instagram\.com|x\.com|twitter\.com|tiktok\.com)$/i

function isPrivateAddress(ip: string) {
  if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true
  const v4 = ip.replace(/^::ffff:/, '')
  if (isIP(v4) !== 4) return false
  const [a, b] = v4.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

/** Only public http(s) pages: blocks localhost and private-network addresses (the server fetches these URLs). */
async function safeUrl(raw: string): Promise<URL | null> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (!/^https?:$/.test(url.protocol) || SKIP_HOSTS.test(url.hostname) || url.hostname === 'localhost') return null
  try {
    const addrs = await lookup(url.hostname, { all: true })
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) return null
  } catch {
    return null
  }
  return url
}

function htmlToText(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? ''
  const meta = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? ''
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
  return { title: title.replace(/\s+/g, ' '), text: `${meta ? `${meta}\n` : ''}${body}`.slice(0, 5000) }
}

/** Reads up to 3 public pages from the prospect's links. Failures are skipped, never fatal. */
export async function research(links: { url: string }[] = []): Promise<ResearchPage[]> {
  const pages: ResearchPage[] = []
  for (const l of links.slice(0, 6)) {
    if (pages.length >= 3) break
    let url = await safeUrl(l.url)
    if (!url) continue
    try {
      // Follow redirects by hand so every hop is re-checked against private addresses.
      let res: Response | null = null
      for (let hop = 0; hop < 4 && url; hop++) {
        res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'ExecutiveOS-DiscoveryResearch/1.0', Accept: 'text/html' } })
        const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
        if (!next) break
        url = await safeUrl(new URL(next, url).toString())
        res = null
      }
      if (!res || !url) continue
      const type = res.headers.get('content-type') ?? ''
      if (!res.ok || !type.includes('text/html')) continue
      const html = (await res.text()).slice(0, 1_500_000)
      const { title, text } = htmlToText(html)
      if (text.length > 200) pages.push({ url: url.toString(), title: title || url.hostname, text })
    } catch (e) {
      log.debug('Research fetch skipped', { url: url?.toString() ?? l.url, error: (e as Error).message })
    }
  }
  log.info('Discovery research done', { links: links.length, pagesRead: pages.length })
  return pages
}

// ── Compose ───────────────────────────────────────────────────────────────────

const short = (n: number) => z.string().max(n)
const Draft = z.object({
  title: short(90).describe('Book title, e.g. "Discovery call — Jane Doe, Acme Corp"'),
  snapshot: z.array(short(160)).max(6).describe('Who they are, in 4–6 short factual lines'),
  online: z.array(z.object({ text: short(220), source: z.string().optional().describe('URL of the page this fact came from') })).max(5).describe('3–5 facts from the research pages only; empty if nothing was read'),
  opener: short(220).describe('One rapport opener tailored to them (keep small talk under two minutes)'),
  frame: short(260).describe('One line that frames the call: you want to ask about their business strategy to understand their situation'),
  pains: z.array(short(200)).max(3).describe('Open questions uncovering pains, each linked to profitability'),
  problems: z.array(short(200)).max(3).describe('Open questions peeling back the onion on specific problems'),
  highlights: z.array(short(200)).max(2).describe('Open questions about what is going well'),
  transition: z.array(short(240)).max(2).describe('How to invite them to the next step (formal assessment or presentation)'),
  fit: z.array(short(160)).max(4).describe('Signals that would suggest they are NOT a good fit'),
})
type Draft = z.infer<typeof Draft>

const SYSTEM = `You prepare an executive coach for a discovery call with a potential client, using this framework:
1. Intro, rapport and frame — keep small talk under two minutes; frame the call by stating you want to ask about their business strategy to understand their current situation.
2. Info gathering — open-ended questions that peel back the "onion" of their business: pains, problems and highlights. Always relate the discussion to profitability.
3. Transition — use what was learned to invite them to the next step, such as a formal assessment or presentation.
Also: trust building (encourage them to share) and qualification (not every owner is a good fit).

Rules:
- Be concise and easy to scan. Each item is one sentence, at most ~25 words. No filler, nothing obvious.
- Ask open questions (what / how / tell me about), never yes/no.
- "online" facts must come only from the research pages provided, each with its source URL. Never invent facts. If there are no pages, return an empty list.
- Tailor everything to this prospect and the coach's notes. Never present guesses as facts.`

function describeProspect(p: ProspectInput | null) {
  if (!p) return 'No specific prospect: write a reusable template for the situation described by the coach.'
  return [
    `Name: ${p.name}`,
    p.role || p.company ? `Role: ${[p.role, p.company].filter(Boolean).join(' at ')}` : '',
    p.industry ? `Industry: ${p.industry}` : '',
    p.companySize ? `Company size: ${p.companySize}` : '',
    p.location ? `Location: ${p.location}` : '',
    p.notes ? `Coach's notes: ${p.notes}` : '',
    p.links?.length ? `Links: ${p.links.map((l) => `${l.label} ${l.url}`).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function toContent(d: Draft): BookContent {
  const items = (xs: string[], group?: string) => xs.filter((t) => t.trim()).map((text) => ({ text: text.trim(), ...(group ? { group } : {}) }))
  return {
    sections: [
      { key: 'snapshot', title: SECTION_TITLES.snapshot, items: items(d.snapshot) },
      { key: 'online', title: SECTION_TITLES.online, items: d.online.filter((o) => o.text.trim()).map((o) => ({ text: o.text.trim(), ...(o.source ? { source: o.source } : {}) })) },
      { key: 'intro', title: SECTION_TITLES.intro, items: [...items([d.opener], 'Opener'), ...items([d.frame], 'Frame')] },
      { key: 'gathering', title: SECTION_TITLES.gathering, items: [...items(d.pains, 'Pains'), ...items(d.problems, 'Problems'), ...items(d.highlights, 'Highlights')] },
      { key: 'transition', title: SECTION_TITLES.transition, items: items(d.transition) },
      { key: 'fit', title: SECTION_TITLES.fit, items: items(d.fit) },
    ],
  }
}

/** Template used when no LLM is allowed (DETERMINISTIC_FALLBACK=true and no provider answered). */
function deterministicDraft(p: ProspectInput | null, prompt: string): Draft {
  const who = p?.name ?? 'the prospect'
  const biz = p?.company || 'their business'
  return {
    title: p ? `Discovery call: ${p.name}${p.company ? `, ${p.company}` : ''}` : `Discovery call template: ${prompt.slice(0, 50) || 'general'}`,
    snapshot: p ? [[p.role, p.company].filter(Boolean).join(' at ') || p.name, p.industry && `Industry: ${p.industry}`, p.companySize && `Size: ${p.companySize}`, p.location && `Based in ${p.location}`, p.notes && `Notes: ${p.notes.slice(0, 150)}`].filter(Boolean) as string[] : [prompt.slice(0, 160) || 'Reusable template'],
    online: [],
    opener: `Thanks for making time, ${who.split(' ')[0]}. What's been taking most of your attention this month?`,
    frame: `I'd like to ask some questions about ${biz}'s strategy and where things stand today, so I can see whether and how I can help.`,
    pains: [`What is costing ${biz} the most time or money right now?`, 'Where do decisions get stuck, and what does that delay cost you?'],
    problems: ['Tell me about a recent problem that landed back on your desk. What happened?', 'What have you already tried, and why didn\'t it stick?'],
    highlights: ['What is working well that you want more of?'],
    transition: ['Based on what you shared, a short leadership assessment would show where the biggest profit gains are. Shall we book it?'],
    fit: ['Not willing to change their own behaviour, only the team\'s', 'Expects quick fixes in a few weeks', 'No time to commit to regular sessions'],
  }
}

async function draftWithAi(messages: { role: 'system' | 'user'; content: string }[], fallback: () => Draft): Promise<{ draft: Draft; model: string }> {
  if (aiMode() === 'unavailable') unavailable('no GOOGLE_API_KEY or GROQ_API_KEY is set and DETERMINISTIC_FALLBACK is false.')
  if (aiMode() === 'llm') {
    try {
      const { data, provider } = await invokeStructured('discovery.book', Draft, messages)
      return { draft: data, model: provider }
    } catch (e) {
      if (!deterministicFallback()) unavailable('Gemini and Groq both failed to write the Discovery Call Book. Try again shortly.')
      log.warn('LLM book generation failed, using template', { error: (e as Error).message })
    }
  }
  return { draft: fallback(), model: 'deterministic-template' }
}

function researchBlock(pages: ResearchPage[]) {
  if (!pages.length) return 'Research pages: none could be read.'
  return `Research pages:\n${pages.map((p, i) => `[${i + 1}] ${p.title} — ${p.url}\n${p.text}`).join('\n\n')}`
}

/** Generates a new book. */
export async function generateBook(input: { prospect: ProspectInput | null; prompt: string }) {
  const pages = await research(input.prospect?.links ?? [])
  const { draft, model } = await draftWithAi(
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `${describeProspect(input.prospect)}\n\nCoach's prompt: ${input.prompt || '(none)'}\n\n${researchBlock(pages)}` },
    ],
    () => deterministicDraft(input.prospect, input.prompt),
  )
  // Keep only sources that were actually read.
  const read = new Set(pages.map((p) => p.url))
  draft.online = draft.online.filter((o) => !o.source || read.has(o.source) || pages.some((p) => o.source && p.url.startsWith(o.source)))
  return { title: draft.title, content: toContent(draft), sources: pages.map((p) => ({ url: p.url, title: p.title })), model }
}

/** Plain-text/Markdown rendering for export. */
export function bookToMarkdown(title: string, content: BookContent, notesHeading = true) {
  const out = [`# ${title}`, '']
  for (const s of content.sections) {
    out.push(`## ${s.title}`, '')
    let group: string | undefined
    for (const i of s.items) {
      if (i.group && i.group !== group) {
        group = i.group
        out.push(`**${i.group}**`)
      }
      out.push(`- ${i.text}${i.source ? ` ([source](${i.source}))` : ''}`)
    }
    if (!s.items.length) out.push('- (empty)')
    out.push('')
  }
  if (notesHeading) out.push('## Notes during the call', '', '', '')
  return out.join('\n')
}

// ── Rich-text book (TipTap / ProseMirror JSON) ────────────────────────────────

export interface DocNode {
  type: string
  attrs?: Record<string, unknown>
  content?: DocNode[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}
export type Doc = DocNode & { type: 'doc' }

const t = (text: string, marks?: DocNode['marks']): DocNode => ({ type: 'text', text, ...(marks ? { marks } : {}) })
const para = (...c: DocNode[]): DocNode => ({ type: 'paragraph', content: c.filter((x) => x.text) })
const heading = (level: number, text: string): DocNode => ({ type: 'heading', attrs: { level }, content: [t(text)] })
const bullets = (items: DocNode[][]): DocNode => ({ type: 'bulletList', content: items.map((c) => ({ type: 'listItem', content: [para(...c)] })) })
const tasks = (items: string[]): DocNode => ({ type: 'taskList', content: items.map((x) => ({ type: 'taskItem', attrs: { checked: false }, content: [para(t(x))] })) })

/** Converts the older section format (and AI drafts) to a rich-text document. */
export function sectionsToDoc(content: BookContent): Doc {
  const nodes: DocNode[] = []
  for (const s of content.sections) {
    nodes.push(heading(2, s.title))
    if (s.key === 'fit') {
      nodes.push(para(t('Tick any warning sign you notice during the call.', [{ type: 'italic' }])))
      if (s.items.length) nodes.push(tasks(s.items.map((i) => i.text)))
      continue
    }
    const groups = [...new Set(s.items.map((i) => i.group ?? ''))]
    for (const g of groups) {
      if (g) nodes.push(heading(3, g))
      const items = s.items.filter((i) => (i.group ?? '') === g)
      nodes.push(bullets(items.map((i) => [t(i.text), ...(i.source ? [t(' '), t('(source)', [{ type: 'link', attrs: { href: i.source } }])] : [])])))
    }
    if (!s.items.length) nodes.push(para(t(s.key === 'online' ? 'Nothing read online yet. Add public links to the prospect and ask the AI to draft again.' : '—', [{ type: 'italic' }])))
  }
  return { type: 'doc', content: nodes }
}

/** Books saved before the rich-text editor used { sections }; read both. */
export function toDoc(content: unknown): Doc {
  const c = content as { type?: string; sections?: BookContent['sections'] } | null
  if (c?.type === 'doc') return c as Doc
  if (c?.sections) return sectionsToDoc(c as BookContent)
  return { type: 'doc', content: [para()] }
}

export const textOf = (n: DocNode): string => (n.text ?? '') + (n.content ?? []).map(textOf).join(n.type === 'listItem' || n.type === 'taskItem' ? ' ' : '')

/** The warning signs under the "Fit check" heading, used to pre-fill a call's fit check. */
export function fitSignals(doc: Doc): string[] {
  const nodes = doc.content ?? []
  const at = nodes.findIndex((n) => n.type === 'heading' && /fit/i.test(textOf(n)))
  if (at < 0) return []
  const level = Number(nodes[at].attrs?.level ?? 2)
  const out: string[] = []
  for (const n of nodes.slice(at + 1)) {
    if (n.type === 'heading' && Number(n.attrs?.level ?? 2) <= level) break
    if (['bulletList', 'orderedList', 'taskList'].includes(n.type)) for (const li of n.content ?? []) out.push(textOf(li).trim())
  }
  return out.filter(Boolean).slice(0, 12).map((x) => x.slice(0, 200))
}

function inlineMd(nodes: DocNode[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '  \n'
      let x = n.text ?? ''
      for (const m of n.marks ?? []) {
        if (m.type === 'bold') x = `**${x}**`
        else if (m.type === 'italic') x = `*${x}*`
        else if (m.type === 'link') x = `[${x}](${String(m.attrs?.href ?? '')})`
      }
      return x
    })
    .join('')
}

/** Markdown export, also what the AI reads. */
export function docToMarkdown(doc: DocNode, depth = 0): string {
  const out: string[] = []
  const pad = '  '.repeat(depth)
  for (const n of doc.content ?? []) {
    if (n.type === 'heading') out.push(`${'#'.repeat(Number(n.attrs?.level ?? 2))} ${inlineMd(n.content)}`, '')
    else if (n.type === 'paragraph') out.push(pad + inlineMd(n.content), depth ? '' : '')
    else if (n.type === 'blockquote') out.push(...docToMarkdown(n).split('\n').map((l) => `> ${l}`), '')
    else if (n.type === 'horizontalRule') out.push('---', '')
    else if (['bulletList', 'orderedList', 'taskList'].includes(n.type)) {
      ;(n.content ?? []).forEach((li, i) => {
        const marker = n.type === 'orderedList' ? `${i + 1}.` : n.type === 'taskList' ? `- [${li.attrs?.checked ? 'x' : ' '}]` : '-'
        const [first, ...rest] = li.content ?? []
        out.push(`${pad}${marker} ${inlineMd(first?.content)}`)
        for (const r of rest) out.push(docToMarkdown({ type: 'doc', content: [r] }, depth + 1).trimEnd())
      })
      if (!depth) out.push('')
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
function docToHtml(n: DocNode): string {
  const inner = () => (n.content ?? []).map(docToHtml).join('')
  switch (n.type) {
    case 'doc':
      return inner()
    case 'text': {
      let x = esc(n.text ?? '')
      for (const m of n.marks ?? []) x = m.type === 'bold' ? `<strong>${x}</strong>` : m.type === 'italic' ? `<em>${x}</em>` : m.type === 'link' ? `<a href="${esc(String(m.attrs?.href ?? ''))}">${x}</a>` : x
      return x
    }
    case 'heading':
      return `<h${n.attrs?.level ?? 2}>${inner()}</h${n.attrs?.level ?? 2}>`
    case 'paragraph':
      return `<p>${inner()}</p>`
    case 'bulletList':
      return `<ul>${inner()}</ul>`
    case 'orderedList':
      return `<ol>${inner()}</ol>`
    case 'listItem':
      return `<li>${inner()}</li>`
    case 'taskList':
      return `<ul data-type="taskList">${inner()}</ul>`
    case 'taskItem':
      return `<li data-type="taskItem" data-checked="${n.attrs?.checked ? 'true' : 'false'}">${inner()}</li>`
    default:
      return inner()
  }
}

const ALLOWED = new Set(['h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 'a', 'br', 'blockquote'])
/** Keeps only simple formatting tags from AI output (no attributes except safe links and task lists). */
export function sanitizeHtml(html: string) {
  return html
    .replace(/```(?:html)?/g, '')
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (m, tag: string, attrs: string) => {
      const name = tag.toLowerCase()
      if (!ALLOWED.has(name) && !(name === 'h1' || name === 'h4')) return ''
      const n = name === 'h1' ? 'h2' : name === 'h4' ? 'h3' : name
      if (m.startsWith('</')) return `</${n}>`
      if (n === 'a') {
        const href = /href\s*=\s*"(https?:\/\/[^"]+)"/i.exec(attrs)?.[1]
        return href ? `<a href="${esc(href)}">` : '<a>'
      }
      if (n === 'ul' && /data-type="taskList"/.test(attrs)) return '<ul data-type="taskList">'
      if (n === 'li' && /data-type="taskItem"/.test(attrs)) return '<li data-type="taskItem" data-checked="false">'
      return `<${n}>`
    })
    .trim()
}

/** The coach's starting template (no prospect). */
export function templateDoc(): Doc {
  return sectionsToDoc(
    toContent({
      title: 'Discovery Call Book',
      snapshot: ['Who they are: role, company, size, location', 'How you met and why they want to talk now'],
      online: [],
      opener: "Thanks for making time. What's been taking most of your attention this month?",
      frame: "I'd like to ask some questions about your business strategy and where things stand today, so I can see whether and how I can help.",
      pains: ['What is costing the business the most time or money right now?', 'Where do decisions get stuck, and what does that delay cost you?'],
      problems: ['Tell me about a recent problem that landed back on your desk. What happened?', "What have you already tried, and why didn't it stick?"],
      highlights: ['What is working well that you want more of?'],
      transition: ['Based on what you shared, a short leadership assessment would show where the biggest profit gains are. Shall we book it?'],
      fit: ["Not willing to change their own behaviour, only the team's", 'Expects quick fixes in a few weeks', 'No time to commit to regular sessions'],
    }),
  )
}

const Assist = z.object({
  reply: z.string().max(600).describe('One or two short sentences to the coach about what you wrote or answered'),
  apply: z.enum(['insert', 'replace_selection', 'replace_all', 'none']).describe('insert: add at the cursor; replace_selection: rewrite the selected text; replace_all: a full new book; none: answer only'),
  html: z.string().max(16000).describe('The content to apply, as simple HTML (h2, h3, p, ul, ol, li, strong, em, a). Empty when apply is none.'),
})

const ASSIST_SYSTEM = `${SYSTEM}

You are now an editing assistant beside the coach's rich-text Discovery Call Book.
- Follow the coach's instruction. Keep their structure and voice; don't rewrite parts they didn't ask about.
- If text is selected and the instruction is about it, return apply "replace_selection" with only the rewritten selection.
- If they ask to add something, return apply "insert" with just the new part.
- If they ask for a full draft, return apply "replace_all" with the whole book: h2 sections "Prospect snapshot", "What we found online", "1. Intro, rapport & frame", "2. Info gathering" (h3 Pains / Problems / Highlights), "3. Transition", "Fit check (coach only)" as a bullet list of warning signs.
- If they only ask a question, return apply "none" and answer in reply.
- Use only h2, h3, p, ul, ol, li, strong, em and a. No h1, no inline styles, no code fences.`

/** AI help beside the editor: draft, rewrite a selection, add questions, or answer. */
export async function assistBook(input: { bookHtml: string; selection?: string; instruction: string; prospect: ProspectInput | null; research: boolean }) {
  const pages = input.research ? await research(input.prospect?.links ?? []) : []
  const ask = `${describeProspect(input.prospect)}\n\nCurrent book (HTML):\n${input.bookHtml.replace(/ (class|style|data-[a-z-]+)="[^"]*"/g, '').slice(0, 24000) || '(empty)'}\n\n${input.selection ? `Selected text:\n${input.selection.slice(0, 3000)}\n\n` : ''}${input.research ? `${researchBlock(pages)}\n\n` : ''}Coach's instruction: ${input.instruction}`
  const sources = pages.map((p) => ({ url: p.url, title: p.title }))
  if (aiMode() === 'unavailable') unavailable('no GOOGLE_API_KEY or GROQ_API_KEY is set and DETERMINISTIC_FALLBACK is false.')
  if (aiMode() === 'llm') {
    try {
      const { data, provider } = await invokeStructured('discovery.assist', Assist, [
        { role: 'system', content: ASSIST_SYSTEM },
        { role: 'user', content: ask },
      ])
      return { ...data, html: data.apply === 'none' ? '' : sanitizeHtml(data.html), model: provider, sources }
    } catch (e) {
      if (!deterministicFallback()) unavailable('Gemini and Groq both failed to answer. Try again shortly.')
      log.warn('LLM assist failed, using template', { error: (e as Error).message })
    }
  }
  // No LLM: the only thing we can do well is a template draft for this prospect.
  if (input.research || /draft|template|start/i.test(input.instruction)) {
    return { reply: 'AI is off, so here is the standard framework filled in with what you know about this prospect.', apply: 'replace_all' as const, html: docToHtml(sectionsToDoc(toContent(deterministicDraft(input.prospect, input.instruction)))), model: 'deterministic-template', sources }
  }
  return { reply: 'AI is off on the server (no Gemini or Groq key), so I can only draft the standard framework. Ask me to "Draft for this prospect".', apply: 'none' as const, html: '', model: 'deterministic-template', sources }
}
