import { useDb } from '../../../utils/db'

function detectResponseIssue(value: string | null | undefined) {
    const normalized = String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
    if (!normalized) return 'empty'

    const lower = normalized.toLowerCase()
    if (/无法|不能|抱歉|对不起|sorry|cannot|can't|unable|i can't|i cannot|policy|safety/.test(lower)) return 'refusal'
    if (/\[content filtered\]|\[filtered\]|content omitted|内容已过滤|已过滤/.test(lower)) return 'filtered'
    if (/```|\{\s*"items"\s*:|^\s*\[/.test(normalized)) return 'structured'
    return 'plain'
}

function issueLabel(issue: string) {
    switch (issue) {
        case 'empty':
            return '空响应/格式异常'
        case 'refusal':
            return '疑似拒答'
        case 'filtered':
            return '内容被过滤'
        case 'structured':
            return '结构化响应'
        default:
            return '纯文本响应'
    }
}

function toPreview(value: string | null | undefined, maxLength = 320) {
    const normalized = String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
    if (!normalized) return ''
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized
}

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id')
    if (!id) {
        throw createError({ statusCode: 400, message: 'Task ID is required' })
    }

    const db = useDb()
    const rows = db.prepare(
        'SELECT id, task_id, chunk_index, model, raw_request, raw_response, response_meta, prompt_tokens, completion_tokens, total_tokens, created_at FROM task_responses WHERE task_id = ? ORDER BY chunk_index ASC'
    ).all(id) as any[]

    const totalPrompt = rows.reduce((sum, r) => sum + (r.prompt_tokens || 0), 0)
    const totalCompletion = rows.reduce((sum, r) => sum + (r.completion_tokens || 0), 0)
    const totalTokens = rows.reduce((sum, r) => sum + (r.total_tokens || 0), 0)

    const issueCounts = new Map<string, number>()
    const enrichedRows = rows.map(row => {
        const responseIssue = detectResponseIssue(row.raw_response)
        issueCounts.set(responseIssue, (issueCounts.get(responseIssue) || 0) + 1)

        let meta: any = null
        try {
            meta = row.response_meta ? JSON.parse(String(row.response_meta)) : null
        } catch {
            meta = null
        }

        return {
            ...row,
            response_meta: meta,
            response_issue: responseIssue,
            response_issue_label: issueLabel(responseIssue),
            raw_request_preview: toPreview(row.raw_request),
            raw_response_preview: toPreview(row.raw_response)
        }
    })

    const chunkMetaList = enrichedRows.map(row => row.response_meta).filter(Boolean)
    const chunkDiagnosticsList = chunkMetaList.map((meta: any) => meta?.chunkDiagnostics).filter(Boolean)
    const riskTagCounts = new Map<string, number>()
    for (const meta of chunkMetaList) {
        const tags = Array.isArray(meta?.chunkRisk?.tags) ? meta.chunkRisk.tags : []
        for (const tag of tags) {
            riskTagCounts.set(String(tag), (riskTagCounts.get(String(tag)) || 0) + 1)
        }
    }
    const diagnostics = {
        totalChunks: rows.length,
        structuredChunks: issueCounts.get('structured') || 0,
        plainChunks: issueCounts.get('plain') || 0,
        emptyChunks: issueCounts.get('empty') || 0,
        refusalChunks: issueCounts.get('refusal') || 0,
        filteredChunks: issueCounts.get('filtered') || 0,
        missingIdChunks: chunkMetaList.filter((meta: any) => Array.isArray(meta.missingIds) && meta.missingIds.length > 0).length,
        chunksWithParseLoss: chunkMetaList.filter((meta: any) => Number(meta.parsedCount || 0) < Number(meta.expectedCount || 0)).length,
        retriedChunks: chunkDiagnosticsList.filter((item: any) => Number(item.retryAttempts || 0) > 0).length,
        singleRetriedChunks: chunkDiagnosticsList.filter((item: any) => Number(item.singleRetryAttempts || 0) > 0).length,
        fallbackChunks: chunkDiagnosticsList.filter((item: any) => Number(item.fallbackCount || 0) > 0).length,
        totalRetryAttempts: chunkDiagnosticsList.reduce((sum: number, item: any) => sum + Number(item.retryAttempts || 0), 0),
        totalSingleRetryAttempts: chunkDiagnosticsList.reduce((sum: number, item: any) => sum + Number(item.singleRetryAttempts || 0), 0),
        totalFallbackCount: chunkDiagnosticsList.reduce((sum: number, item: any) => sum + Number(item.fallbackCount || 0), 0),
        riskTags: Array.from(riskTagCounts.entries()).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count })),
        issues: Array.from(issueCounts.entries())
            .filter(([issue]) => !['structured', 'plain'].includes(issue))
            .sort((a, b) => b[1] - a[1])
            .map(([issue, count]) => ({ issue, label: issueLabel(issue), count }))
    }

    return {
        records: enrichedRows,
        summary: {
            totalChunks: rows.length,
            totalPromptTokens: totalPrompt,
            totalCompletionTokens: totalCompletion,
            totalTokens,
            diagnostics
        }
    }
})
