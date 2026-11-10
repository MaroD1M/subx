import { listServerFonts } from '../utils/fonts'

export default defineEventHandler(async () => {
  const fonts = await listServerFonts()
  return {
    fonts,
    available: fonts.length > 0
  }
})
