import { buildOperationsRuntimeOverview } from '../../utils/operationsOverview'
import { buildTaskDiagnosticsOverview } from '../../utils/taskDiagnostics'
import type { OperationsOverview } from '~~/types'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const overview: OperationsOverview = {
    generatedAt: new Date().toISOString(),
    runtime: await buildOperationsRuntimeOverview(),
    diagnostics: buildTaskDiagnosticsOverview({
      limit: Number(query.limit) || 50,
      status: query.status ? String(query.status) : ''
    })
  }
  return overview
})
