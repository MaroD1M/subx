import { TranslationMemoryService } from '../../utils/translationMemory'

export default defineEventHandler(() => TranslationMemoryService.stats())
