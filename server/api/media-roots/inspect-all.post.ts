import { validateMediaRoots, inspectMediaRoot } from '../../utils/mediaRoots'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const roots = validateMediaRoots(body?.roots || [])
  const results = await Promise.all(roots.map(async (root) => ({
    id: root.id,
    name: root.name,
    ...(await inspectMediaRoot(root))
  })))
  return { results }
})
