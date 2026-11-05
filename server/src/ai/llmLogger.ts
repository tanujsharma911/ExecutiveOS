/**
 * LangChain callback handler that logs every LLM and tool call:
 * provider, model, duration, token usage, tool names and errors.
 * Prompt and response text are only logged at LOG_LEVEL=debug (and truncated),
 * because they contain confidential client reflections.
 */
import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import type { Serialized } from '@langchain/core/load/serializable'
import type { BaseMessage } from '@langchain/core/messages'
import type { LLMResult } from '@langchain/core/outputs'
import { createLogger, fmtDuration, highlight } from '../lib/logger.js'

const log = createLogger('llm')
const toolLog = createLogger('tool')

const preview = (s: unknown, n = 240) => {
  const t = typeof s === 'string' ? s : JSON.stringify(s)
  return t && t.length > n ? `${t.slice(0, n)}…` : t
}

/** Response time field: highlighted in pretty logs, milliseconds (number) in JSON logs. */
const responseTime = (r?: Started) => {
  if (!r) return undefined
  const ms = Date.now() - r.at
  return highlight(ms, fmtDuration(ms))
}

interface Started {
  at: number
  provider?: string
  model?: string
  label: string
}

export class LlmLogHandler extends BaseCallbackHandler {
  name = 'executiveos-llm-logger'
  private runs = new Map<string, Started>()

  constructor(private readonly operation: string) {
    super()
  }

  async handleChatModelStart(llm: Serialized, messages: BaseMessage[][], runId: string, _parentRunId?: string, extraParams?: Record<string, unknown>, _tags?: string[], metadata?: Record<string, unknown>) {
    const inv = (extraParams?.invocation_params ?? {}) as Record<string, unknown>
    const provider = (metadata?.ls_provider as string | undefined) ?? llm.id?.[llm.id.length - 1]
    const model = (metadata?.ls_model_name as string | undefined) ?? (inv.model as string | undefined) ?? (inv.modelName as string | undefined)
    const tools = Array.isArray(inv.tools) ? inv.tools.length : undefined
    this.runs.set(runId, { at: Date.now(), provider, model, label: `${provider ?? 'model'}:${model ?? '?'}` })
    log.info('LLM call started', { op: this.operation, provider, model, messages: messages[0]?.length, tools })
    log.debug('LLM prompt', { op: this.operation, last: preview(messages[0]?.[messages[0].length - 1]?.content) })
  }

  async handleLLMEnd(output: LLMResult, runId: string) {
    const r = this.runs.get(runId)
    this.runs.delete(runId)
    const gen = output.generations?.[0]?.[0] as { message?: { usage_metadata?: Record<string, number>; tool_calls?: { name: string }[]; content?: unknown } } | undefined
    const usage = gen?.message?.usage_metadata ?? ((output.llmOutput?.tokenUsage ?? output.llmOutput?.usage) as Record<string, number> | undefined)
    const toolCalls = gen?.message?.tool_calls?.map((t) => t.name)
    log.info('LLM call finished', {
      op: this.operation,
      model: r?.label,
      responseTime: responseTime(r),
      inTokens: usage?.input_tokens ?? usage?.promptTokens ?? usage?.prompt_tokens,
      outTokens: usage?.output_tokens ?? usage?.completionTokens ?? usage?.completion_tokens,
      toolCalls: toolCalls?.length ? toolCalls.join(',') : undefined,
    })
    log.debug('LLM response', { op: this.operation, content: preview(gen?.message?.content) })
  }

  async handleLLMError(err: Error, runId: string) {
    const r = this.runs.get(runId)
    this.runs.delete(runId)
    log.warn('LLM call failed', { op: this.operation, model: r?.label, responseTime: responseTime(r), error: err.message })
  }

  async handleToolStart(tool: Serialized, input: string, runId: string, _parentRunId?: string, _tags?: string[], _metadata?: Record<string, unknown>, runName?: string) {
    const name = runName ?? tool.id?.[tool.id.length - 1] ?? 'tool'
    this.runs.set(runId, { at: Date.now(), label: name })
    toolLog.debug('Tool call started', { op: this.operation, tool: name, input: preview(input, 120) })
  }

  async handleToolEnd(output: unknown, runId: string) {
    const r = this.runs.get(runId)
    this.runs.delete(runId)
    const content = (output as { content?: unknown })?.content ?? output
    toolLog.info('Tool call finished', { op: this.operation, tool: r?.label, ms: r ? Date.now() - r.at : undefined, bytes: typeof content === 'string' ? content.length : undefined })
  }

  async handleToolError(err: Error, runId: string) {
    const r = this.runs.get(runId)
    this.runs.delete(runId)
    toolLog.error('Tool call failed', { op: this.operation, tool: r?.label, ms: r ? Date.now() - r.at : undefined, error: err })
  }
}

/** Callbacks to pass in a LangChain invoke config for a named operation. */
export const llmCallbacks = (operation: string) => [new LlmLogHandler(operation)]
