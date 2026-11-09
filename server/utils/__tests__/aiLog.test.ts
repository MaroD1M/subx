import { describe, expect, it } from 'vitest'
import {
    AI_LOG_FULL_PAYLOAD_ENV,
    buildAiLogErrorSection,
    buildAiLogInitialLog,
    buildAiLogSummary,
    isAiLogFullPayloadEnabled
} from '../aiLog'

const meta = {
    taskId: 'task-1',
    chunkIndex: 2,
    attempt: 0,
    provider: 'openai',
    model: 'test-model',
    targetLanguage: 'zh-CN',
    streaming: false,
    streamUsage: false,
    timestamp: new Date('2026-11-09T00:00:00.000Z'),
    requestOptions: { stream: false }
}

const payload = {
    systemMessage: 'SYSTEM_SECRET_BODY',
    prompt: 'PROMPT_SECRET_BODY'
}

const responseSummary = {
    format: 'text',
    anomaly: 'other',
    parsedCount: 2,
    expectedCount: 3,
    missingIds: ['3']
}

describe('AI log payload privacy', () => {
    it('detects the explicit full payload switch', () => {
        expect(isAiLogFullPayloadEnabled({ [AI_LOG_FULL_PAYLOAD_ENV]: '1' })).toBe(true)
        expect(isAiLogFullPayloadEnabled({ [AI_LOG_FULL_PAYLOAD_ENV]: 'true' })).toBe(false)
        expect(isAiLogFullPayloadEnabled({})).toBe(false)
    })

    it('omits prompt and response bodies in summary mode', () => {
        const log = buildAiLogInitialLog(meta, payload, false)

        expect(log).toContain('Prompt Length: 18')
        expect(log).toContain('System Message Length: 18')
        expect(log).not.toContain(payload.systemMessage)
        expect(log).not.toContain(payload.prompt)
        expect(log).toContain(`${AI_LOG_FULL_PAYLOAD_ENV}=1`)
    })

    it('includes prompt and response bodies when full payload is enabled', () => {
        const log = buildAiLogInitialLog(meta, payload, true)

        expect(log).toContain(payload.systemMessage)
        expect(log).toContain(payload.prompt)
    })

    it('writes token, duration and parse summary without response body', () => {
        const log = buildAiLogSummary({
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
            durationMs: 1234,
            systemMessageLength: 18,
            promptLength: 18,
            responseLength: 512,
            responseSummary,
            endedAt: new Date('2026-11-09T00:00:01.234Z')
        })

        expect(log).toContain('Duration: 1234ms')
        expect(log).toContain('Tokens: 30 (P: 10, C: 20)')
        expect(log).toContain('Prompt Length: 18')
        expect(log).toContain('Response Length: 512')
        expect(log).toContain('format=text, anomaly=other, parsed=2/3, missing=3')
        expect(log).not.toContain('SECRET_BODY')
    })

    it('keeps error message and stack without prompt or response bodies', () => {
        const error = new Error('request failed')
        const log = buildAiLogErrorSection(error)

        expect(log).toContain('request failed')
        expect(log).toContain('Error: request failed')
        expect(log).not.toContain(payload.systemMessage)
        expect(log).not.toContain(payload.prompt)
    })
})
