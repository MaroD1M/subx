import { inspectMediaRoot } from '../../utils/mediaRoots'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const root = body?.root || body
  return await inspectMediaRoot(root)
})
