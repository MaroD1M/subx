import { formatLogTimestamp } from '~~/shared/time'

export const AI_LOG_FULL_PAYLOAD_ENV = 'SUBX_AI_LOG_FULL_PAYLOAD'

export interface AiLogMeta {
    taskId?: string
    chunkIndex?: number
    attempt: number
    provider: string
    model: string
    targetLanguage: string
    streaming: boolean
    streamUsage: boolean
    timestamp: Date
    requestOptions?: Record<string, unknown>
}

export interface AiLogPayload {
    systemMessage: string
    prompt: string
}

export interface AiLogResponseSummary {
    format: string
    anomaly: string
    parsedCount: number
    expectedCount: number
    missingIds: string[]
}

export interface AiLogSummaryInput {
    usage: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
    }
    durationMs: number
    systemMessageLength: number
    promptLength: number
    responseLength: number
    responseSummary: AiLogResponseSummary
    endedAt: Date
}

export function isAiLogFullPayloadEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    return String(env[AI_LOG_FULL_PAYLOAD_ENV] ?? '').trim() === '1'
}

export function buildAiLogHeader(meta: AiLogMeta): string {
    return `=== TASK INFO ===
Task ID: ${meta.taskId}
Chunk Index: ${meta.chunkIndex}
Attempt: ${meta.attempt}
Provider: ${meta.provider}
Model: ${meta.model}
Target: ${meta.targetLanguage}
Translation Mode: ${meta.streaming ? 'STREAM' : 'NON_STREAM'}
Stream Usage Toggle: ${meta.streamUsage ? 'ON' : 'OFF'}
Timestamp: ${formatLogTimestamp(meta.timestamp)}

=== REQUEST OPTIONS ===
${JSON.stringify(meta.requestOptions ?? {}, null, 2)}
`
}

export function buildAiLogPayloadSection(payload: AiLogPayload, fullPayload: boolean): string {
    if (fullPayload) {
        return `
=== SYSTEM MESSAGE ===
${payload.systemMessage}

=== USER PROMPT ===
${payload.prompt}

=== AI STREAMING RESPONSE ===
`
    }

    return `
=== REQUEST SUMMARY ===
System Message Length: ${payload.systemMessage.length}
Prompt Length: ${payload.prompt.length}
Payload Body: OMITTED (set ${AI_LOG_FULL_PAYLOAD_ENV}=1 to include full prompt/response)

=== AI STREAMING RESPONSE (body omitted) ===
`
}

export function buildAiLogInitialLog(meta: AiLogMeta, payload: AiLogPayload, fullPayload: boolean): string {
    return `${buildAiLogHeader(meta)}${buildAiLogPayloadSection(payload, fullPayload)}`
}

export function buildAiLogSummary(input: AiLogSummaryInput): string {
    const missingIds = input.responseSummary.missingIds.length
        ? input.responseSummary.missingIds.join(', ')
        : 'none'

    return `

=== SUMMARY ===
Duration: ${input.durationMs}ms
Tokens: ${input.usage.totalTokens} (P: ${input.usage.promptTokens}, C: ${input.usage.completionTokens})
System Message Length: ${input.systemMessageLength}
Prompt Length: ${input.promptLength}
Response Length: ${input.responseLength}
Parse Result: format=${input.responseSummary.format}, anomaly=${input.responseSummary.anomaly}, parsed=${input.responseSummary.parsedCount}/${input.responseSummary.expectedCount}, missing=${missingIds}
End Time: ${formatLogTimestamp(input.endedAt)}
`
}

export function buildAiLogErrorSection(error: { message?: string; stack?: string } | null | undefined): string {
    return `\n\n=== ERROR ===\n${error?.message || 'Unknown error'}\n${error?.stack || ''}`
}
