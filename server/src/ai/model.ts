/**
 * Model selection for the AI layer.
 *
 * Analysis always uses an LLM first: Google Gemini (primary) and Groq (fallback).
 * Agents get Groq through LangChain's modelFallbackMiddleware; structured-output
 * calls try Gemini first, then Groq.
 *
 * DETERMINISTIC_FALLBACK=true lets DeterministicAnalystModel — a LangChain
 * BaseChatModel that plans tool calls deterministically — answer when both LLMs
 * fail or no key is set. When false (the default), AiUnavailableError (HTTP 503)
 * is thrown instead.
 */
import { BaseChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models'
import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatGroq } from '@langchain/groq'
import { modelFallbackMiddleware } from 'langchain'
import type { z } from 'zod'
import { HttpError } from '../auth.js'
import { createLogger } from '../lib/logger.js'
import { llmCallbacks } from './llmLogger.js'

const log = createLogger('ai')

/**
 * llm          — Gemini/Groq are configured and always used first.
 * deterministic — no LLM key is set, but DETERMINISTIC_FALLBACK=true allows the deterministic analyst.
 * unavailable  — no LLM key is set and DETERMINISTIC_FALLBACK is false: AI features return 503.
 */
export type AiMode = 'llm' | 'deterministic' | 'unavailable'

/** Thrown when the LLMs fail (or aren't configured) and the deterministic fallback is disabled. */
export class AiUnavailableError extends HttpError {
  constructor(message: string) {
    super(503, message)
  }
}

/** DETERMINISTIC_FALLBACK=true lets the deterministic analyst answer after Gemini and Groq fail. Default: false. */
export const deterministicFallback = () => (process.env.DETERMINISTIC_FALLBACK ?? 'false').trim().toLowerCase() === 'true'

const geminiModel = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const groqModel = () => process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
const hasGemini = () => !!process.env.GOOGLE_API_KEY
const hasGroq = () => !!process.env.GROQ_API_KEY

export function aiMode(): AiMode {
  if (hasGemini() || hasGroq()) return 'llm'
  return deterministicFallback() ? 'deterministic' : 'unavailable'
}

/** Throws AiUnavailableError when no AI path is allowed. */
export function unavailable(reason: string): never {
  throw new AiUnavailableError(`AI is unavailable: ${reason}`)
}

/** Human-readable description of the configured model chain. */
export function aiModelName(): string {
  const mode = aiMode()
  if (mode === 'unavailable') return 'none (set GOOGLE_API_KEY or GROQ_API_KEY)'
  if (mode === 'deterministic') return 'deterministic-analyst-v1'
  const chain = [hasGemini() ? `google:${geminiModel()}` : null, hasGroq() ? `groq:${groqModel()}` : null, deterministicFallback() ? 'deterministic' : null].filter(Boolean)
  return chain.join(' → ')
}

export interface PlannedCall {
  name: string
  args: Record<string, unknown>
}

interface DeterministicFields extends BaseChatModelParams {
  plan: PlannedCall[]
  /** builds the final answer from the tool results */
  finalize: (results: { name: string; content: string }[]) => string
}

export class DeterministicAnalystModel extends BaseChatModel {
  plan: PlannedCall[]
  finalize: DeterministicFields['finalize']
  boundToolNames: string[] = []

  constructor(fields: DeterministicFields) {
    super(fields)
    this.plan = fields.plan
    this.finalize = fields.finalize
  }

  _llmType() {
    return 'deterministic-analyst'
  }

  getLsParams(options: this['ParsedCallOptions']) {
    return { ...super.getLsParams(options), ls_provider: 'deterministic', ls_model_name: 'deterministic-analyst-v1' }
  }

  bindTools(tools: { name?: string }[]) {
    const next = new DeterministicAnalystModel({ plan: this.plan, finalize: this.finalize })
    next.boundToolNames = tools.map((t) => t.name ?? '')
    return next as unknown as ReturnType<BaseChatModel['withConfig']>
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const toolResults = messages.filter((m) => ToolMessage.isInstance(m)) as ToolMessage[]
    let message: AIMessage
    if (toolResults.length === 0) {
      const calls = this.plan.filter((p) => !this.boundToolNames.length || this.boundToolNames.includes(p.name))
      message = new AIMessage({
        content: '',
        tool_calls: calls.map((c, i) => ({ id: `call_${i}_${c.name}`, name: c.name, args: c.args, type: 'tool_call' as const })),
      })
    } else {
      const content = this.finalize(toolResults.map((t) => ({ name: t.name ?? '', content: typeof t.content === 'string' ? t.content : JSON.stringify(t.content) })))
      message = new AIMessage({ content })
    }
    return { generations: [{ text: typeof message.content === 'string' ? message.content : '', message }] }
  }
}

let primary: BaseChatModel | null | undefined
let fallback: BaseChatModel | null | undefined

/** Gemini — primary model (null when GOOGLE_API_KEY is not set). */
export function getPrimaryModel(): BaseChatModel | null {
  if (primary === undefined) {
    primary = hasGemini() ? new ChatGoogleGenerativeAI({ model: geminiModel(), apiKey: process.env.GOOGLE_API_KEY, temperature: 0.3, maxRetries: 1 }) : null
  }
  return primary
}

/** Groq — fallback model (null when GROQ_API_KEY is not set). */
export function getFallbackModel(): BaseChatModel | null {
  if (fallback === undefined) {
    fallback = hasGroq() ? new ChatGroq({ model: groqModel(), apiKey: process.env.GROQ_API_KEY, temperature: 0.3, maxRetries: 1 }) : null
  }
  return fallback
}

/** Model + middleware for createAgent: Gemini first, Groq if Gemini errors. */
export function getAgentModel() {
  const p = getPrimaryModel()
  const f = getFallbackModel()
  const model = (p ?? f)!
  const middleware = p && f ? [modelFallbackMiddleware(f)] : []
  return { model, middleware }
}

type Messages = { role: 'system' | 'user'; content: string }[]

/** Structured output with provider fallback. Returns the parsed object and which provider served it. */
export async function invokeStructured<S extends z.ZodType>(operation: string, schema: S, messages: Messages): Promise<{ data: z.infer<S>; provider: string }> {
  const chain: [string, BaseChatModel | null][] = [
    [`google:${geminiModel()}`, getPrimaryModel()],
    [`groq:${groqModel()}`, getFallbackModel()],
  ]
  let lastError: unknown
  for (const [name, model] of chain) {
    if (!model) continue
    try {
      const t0 = Date.now()
      const data = (await model.withStructuredOutput(schema).invoke(messages, { callbacks: llmCallbacks(operation), runName: operation })) as z.infer<S>
      log.info('Structured output served', { op: operation, provider: name, ms: Date.now() - t0 })
      return { data, provider: name }
    } catch (e) {
      lastError = e
      log.warn(name.startsWith('google') ? 'Gemini failed, falling back to Groq' : 'Provider failed', { op: operation, provider: name, error: (e as Error).message })
    }
  }
  throw lastError ?? new Error('No AI provider configured')
}
