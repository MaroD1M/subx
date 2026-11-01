import { z } from 'zod'
import type { H3Event } from 'h3'

const outputModeSchema = z.enum(['translated', 'bilingual', 'original'])
const subtitleFormatSchema = z.enum(['srt', 'ass', 'both'])
const bilingualLayoutSchema = z.enum(['translated_first', 'original_first'])

export const taskCreateSchema = z.object({
  filePath: z.string().optional(),
  rootId: z.string().optional(),
  sourceType: z.enum(['auto', 'embedded', 'external', 'asr', 'ocr']).optional(),
  trackIndex: z.coerce.number().int().min(0).optional(),
  targetLanguage: z.string().min(1).optional(),
  outputMode: outputModeSchema.optional(),
  model: z.string().optional(),
  stylePreset: z.string().optional(),
  stylePrompt: z.string().max(4000).optional(),
  contentTitle: z.string().max(200).optional(),
  contentBackground: z.string().max(4000).optional(),
  customInstructions: z.string().max(4000).optional(),
  subtitleFormat: subtitleFormatSchema.optional(),
  subtitleStylePreset: z.string().optional(),
  bilingualLayout: bilingualLayoutSchema.optional(),
  files: z.array(z.union([
    z.string(),
    z.object({ path: z.string(), rootId: z.string().optional() })
  ])).optional(),
  retryTaskId: z.string().optional()
}).passthrough()

export const configUpdateSchema = z.record(z.string(), z.unknown())

export const reviewPatchSchema = z.object({
  entries: z.array(z.object({
    subtitleId: z.union([z.string(), z.number()]),
    translatedText: z.string().optional(),
    finalText: z.string().optional(),
    reviewStatus: z.string().optional(),
    sortOrder: z.number().optional(),
    selected: z.boolean().optional(),
    edited: z.boolean().optional()
  })).optional(),
  bilingualLayout: bilingualLayoutSchema.optional()
}).passthrough()

export const reviewRetranslateSchema = z.object({
  subtitleIds: z.array(z.union([z.string(), z.number()])).min(1)
})

export const fileCreateSchema = z.object({
  name: z.string().min(1),
  parentPath: z.string().optional(),
  rootId: z.string().optional()
})

export const fileRenameSchema = z.object({
  path: z.string().min(1),
  newName: z.string().min(1),
  rootId: z.string().optional()
})

export const fileDeleteSchema = z.object({
  path: z.string().min(1),
  rootId: z.string().optional()
})

export const authPasskeySchema = z.object({
  passkey: z.string().min(1)
})

export const watchFolderCreateSchema = z.object({
  rootId: z.string().min(1),
  path: z.string().optional(),
  enabled: z.boolean().optional(),
  recursive: z.boolean().optional(),
  mode: z.enum(['new', 'backfill', 'both']).optional(),
  rules: z.record(z.string(), z.unknown()).optional(),
  outputPolicy: z.record(z.string(), z.unknown()).optional()
}).passthrough()

export const watchFolderUpdateSchema = z.object({
  rootId: z.string().min(1).optional(),
  path: z.string().optional(),
  enabled: z.boolean().optional(),
  recursive: z.boolean().optional(),
  mode: z.enum(['new', 'backfill', 'both']).optional(),
  rules: z.record(z.string(), z.unknown()).optional(),
  outputPolicy: z.record(z.string(), z.unknown()).optional()
}).passthrough()

export const watchBackfillSchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
  path: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional()
}).passthrough()

export const notificationChannelSchema = z.object({
  type: z.enum(['telegram', 'smtp', 'webhook', 'ntfy', 'discord', 'matrix', 'wecom']),
  name: z.string().min(1).max(120),
  config: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().optional()
})

export const apiTokenCreateSchema = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(z.string()).optional(),
  expiresInDays: z.coerce.number().int().min(1).max(3650).optional(),
  expiresAt: z.string().optional()
})

export const taskListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  status: z.string().optional(),
  q: z.string().optional()
})

export async function parseBody<T extends z.ZodTypeAny>(event: H3Event, schema: T): Promise<z.infer<T>> {
  const body = await readBody(event)
  const result = schema.safeParse(body)
  if (!result.success) {
    const message = result.error.issues
      .map(issue => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ')
    throw createError({ statusCode: 400, message: `请求参数不合法: ${message}` })
  }
  return result.data as z.infer<T>
}
