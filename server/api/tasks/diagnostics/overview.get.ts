import { buildTaskDiagnosticsOverview } from '../../../utils/taskDiagnostics'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  return buildTaskDiagnosticsOverview({
    limit: Number(query.limit) || 50,
    status: query.status ? String(query.status) : ''
  })
})
