import { CostService } from '../../utils/cost'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  return CostService.summary(String(query.month || ''))
})
