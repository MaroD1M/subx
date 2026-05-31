import { useDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id')
    if (!id) {
        throw createError({ statusCode: 400, message: 'Task ID is required' })
    }

    const db = useDb()
    const rows = db.prepare(
        'SELECT id, task_id, chunk_index, model, prompt_tokens, completion_tokens, total_tokens, created_at FROM task_responses WHERE task_id = ? ORDER BY chunk_index ASC'
    ).all(id) as any[]

    const totalPrompt = rows.reduce((sum, r) => sum + (r.prompt_tokens || 0), 0)
    const totalCompletion = rows.reduce((sum, r) => sum + (r.completion_tokens || 0), 0)
    const totalTokens = rows.reduce((sum, r) => sum + (r.total_tokens || 0), 0)

    return {
        records: rows,
        summary: {
            totalChunks: rows.length,
            totalPromptTokens: totalPrompt,
            totalCompletionTokens: totalCompletion,
            totalTokens
        }
    }
})
