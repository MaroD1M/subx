import { test, expect } from './fixtures'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import Database from 'better-sqlite3'
import { join } from 'path'
import { expectNoSeriousA11y, seedProofreadCache, seedTasks, setupAuth } from './helpers'

test.describe.configure({ mode: 'serial' })

let authState: Awaited<ReturnType<import('@playwright/test').APIRequestContext['storageState']>> | null = null

test.beforeAll(async ({ request }) => {
  await request.get('/api/auth/status')
  await setupAuth(request)
  authState = await request.storageState()
  seedTasks()
})

test.beforeEach(async ({ page }) => {
  if (authState) await page.context().addCookies(authState.cookies)
})

test('client navigation updates active nav and page content', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('文件浏览器')).toBeVisible()
  await page.locator('aside').getByRole('link', { name: '翻译历史' }).click()
  await expect(page).toHaveURL(/\/history$/)
  await expect(page.getByRole('heading', { name: '翻译历史' })).toBeVisible()
  await expect(page.locator('aside').getByRole('link', { name: '翻译历史' })).toHaveAttribute('aria-current', 'page')
})

test('shared config and watch folder caches avoid duplicate requests on navigation', async ({ page }) => {
  let configRequests = 0
  let watchFoldersRequests = 0
  page.on('request', request => {
    if (request.method() !== 'GET') return
    const pathname = new URL(request.url()).pathname
    if (pathname === '/api/config') configRequests += 1
    if (pathname === '/api/watch-folders') watchFoldersRequests += 1
  })
  await page.goto('/')
  await expect(page.getByText('文件浏览器')).toBeVisible()
  await page.waitForFunction(() => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__))
  await page.locator('aside').getByRole('link', { name: '媒体库' }).click()
  await expect(page).toHaveURL(/\/media-libraries$/)
  await expect(page.getByLabel('搜索媒体库')).toBeVisible()
  await page.locator('aside').getByRole('link', { name: '设置' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await page.locator('aside').getByRole('link', { name: '自动化' }).click()
  await expect(page).toHaveURL(/\/automation$/)
  await expect(page.getByRole('heading', { name: '自动化' })).toBeVisible()
  expect(configRequests).toBe(0)
  expect(watchFoldersRequests).toBeLessThanOrEqual(1)
})

test('subtitle output tab uses shared labels and sends a structured style', async ({ page }) => {
  await page.route('**/api/tracks**', route => route.fulfill({
    json: {
      tracks: [{ index: 2, codec: 'subrip', language: 'eng', title: 'English', isDefault: true, isSupported: true }],
      audioTracks: [{ index: 1, codec: 'aac', language: 'eng', channels: 2, isDefault: true }],
      duration: 120
    }
  }))
  let taskBody: any = null
  await page.route('**/api/task', async route => {
    taskBody = route.request().postDataJSON()
    await route.fulfill({ json: { taskId: 'subtitle-style-test', taskIds: ['subtitle-style-test'] } })
  })

  await page.goto('/')
  const tree = page.getByRole('tree', { name: '文件目录树' })
  await tree.getByText('Shows', { exact: true }).click()
  await tree.getByText('Demo Show', { exact: true }).click()
  await tree.getByText('Demo.Show.S01E02.mkv', { exact: true }).click()
  await page.getByRole('button', { name: '字幕输出' }).click()

  await expect(page.getByText('样式预设')).toBeVisible()
  await expect(page.getByText('字幕输出', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('bilingual_simple')).toHaveCount(0)
  await expect(page.getByText('1920 × 1080 预览')).toBeVisible()

  await page.getByRole('button', { name: '开始翻译' }).click()
  await expect.poll(() => Boolean(taskBody?.subtitleStyle), { timeout: 5000 }).toBe(true)
  expect(taskBody.subtitleStyle.presetId).toBeTruthy()
  expect(taskBody.subtitleStyle.translated.fontSize).toBeGreaterThan(0)
})

test('media library cards support drag sorting', async ({ page }) => {
  await page.goto('/media-libraries')
  await page.waitForFunction(() => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__))
  await page.getByRole('button', { name: '新增媒体库' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('例如：电影库 / 剧集库').fill('Drag Library')
  await dialog.getByPlaceholder('/media/movies').fill('/media/drag-test')
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()

  const cards = page.getByTestId('media-root-card')
  await expect(cards).toHaveCount(2)
  await cards.filter({ hasText: 'Drag Library' }).dragTo(cards.first())
  await expect(cards.first()).toContainText('Drag Library')
})

test('automation notifications and API tabs are accessible', async ({ page }) => {
  await page.goto('/automation?tab=notifications')
  await expect(page.getByText('通知渠道').first()).toBeVisible()
  await expectNoSeriousA11y(page)
  await page.goto('/automation?tab=api')
  await expect(page.getByText('API Token').first()).toBeVisible()
  await expectNoSeriousA11y(page)
  await page.goto('/automation?tab=integrations')
  await expect(page.getByText('下载器 / 媒体服务器 Webhook')).toBeVisible()
  await expectNoSeriousA11y(page)
})

test('monitor folder triggers on a new stable video', async ({ page }) => {
  const mediaDir = process.env.VIDEO_DIR || join(process.cwd(), '.test-artifacts', 'media')
  const dir = join(mediaDir, 'WatchTrigger')
  mkdirSync(dir, { recursive: true })
  await page.request.put('/api/config', { data: { notificationEnabled: false } })
  let folderId = 0
  try {
    const create = await page.request.post('/api/watch-folders', {
      data: {
        rootId: 'default',
        path: 'WatchTrigger',
        enabled: true,
        recursive: false,
        mode: 'new',
        rules: { extensions: ['.mkv'], stableSeconds: 0, skipExistingSubtitles: false, skipExistingOutput: false },
        outputPolicy: { targetLanguage: 'zh-CN', sourceType: 'auto', outputMode: 'translated', subtitleFormat: 'srt' }
      }
    })
    expect(create.ok()).toBeTruthy()
    folderId = (await create.json()).folder.id
    await page.waitForTimeout(800)
    writeFileSync(join(dir, 'Trigger.Movie.2026.mkv'), '')

    await expect.poll(async () => {
      const res = await page.request.get('/api/watch-events?limit=50')
      const payload = await res.json()
      return payload.events.filter((item: any) => item.folderId === folderId).length
    }, { timeout: 12_000 }).toBeGreaterThan(0)
  } finally {
    if (folderId) await page.request.delete(`/api/watch-folders/${folderId}`)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('original-only export creates review entries and output fallback works', async ({ page }) => {
  const mediaDir = process.env.VIDEO_DIR || join(process.cwd(), '.test-artifacts', 'media')
  const file = join(mediaDir, 'ReviewOriginal.srt')
  const output = join(mediaDir, 'ReviewOriginal.original.srt')
  const subtitle = '1\n00:00:01,000 --> 00:00:02,000\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld\n'
  writeFileSync(file, subtitle)
  let taskId = ''
  try {
    const create = await page.request.post('/api/task', {
      data: {
        filePath: 'ReviewOriginal.srt',
        rootId: 'default',
        sourceType: 'external',
        trackIndex: 0,
        outputMode: 'original',
        subtitleFormat: 'srt',
        targetLanguage: 'zh-CN',
        model: 'deepseek-chat'
      }
    })
    expect(create.ok()).toBeTruthy()
    const created = await create.json()
    taskId = String(created.taskId || '')
    expect(taskId).toBeTruthy()

    await expect.poll(async () => {
      const response = await page.request.get(`/api/tasks/${taskId}`)
      const payload = await response.json()
      return payload.task?.status
    }, { timeout: 20_000 }).toBe('done')

    const review = await page.request.get(`/api/tasks/${taskId}/review`)
    const reviewData = await review.json()
    expect(reviewData.summary.total).toBe(2)
    expect(reviewData.entries[0].finalText).toContain('Hello')

    const list = await page.request.get('/api/tasks?page=1&pageSize=100')
    const listData = await list.json()
    expect(listData.tasks.find((item: any) => item.taskId === taskId)?.reviewAvailable).toBe(true)

    const reviewPageResponse = page.waitForResponse(item => item.url().includes(`/api/tasks/${taskId}/review`) && item.status() === 200, { timeout: 30_000 }).catch(() => null)
    await page.goto(`/review/${taskId}`)
    await reviewPageResponse
    await page.waitForFunction(() => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__), null, { timeout: 30_000 })
    await expect(page.getByText('该任务为「仅原文字幕」')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Hello').first()).toBeVisible()

    const db = new Database(process.env.DB_PATH || join(process.cwd(), '.test-artifacts', 'subx.db'))
    db.prepare('DELETE FROM task_review_entries WHERE task_id = ?').run(taskId)
    db.close()

    const fallback = await page.request.get(`/api/tasks/${taskId}/review`)
    const fallbackData = await fallback.json()
    expect(fallbackData.summary.total).toBe(2)
    expect(fallbackData.entries[0].finalText).toContain('Hello')
  } finally {
    if (taskId) await page.request.delete(`/api/tasks/${taskId}`)
    rmSync(file, { force: true })
    rmSync(output, { force: true })
  }
})

test('settings ASR tab is accessible', async ({ page }) => {
  await page.goto('/settings?tab=asr')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await expect(page.getByText('快速预设')).toBeVisible()
  await expect(page.getByText('启用语音识别')).toBeVisible()
  await expect(page.getByText('长任务超时')).toBeVisible()
  await expectNoSeriousA11y(page)
})

test('settings OCR tab is accessible', async ({ page }) => {
  await page.goto('/settings?tab=ocr')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await expect(page.getByText('OCR 与语音识别是并列的字幕来源')).toBeVisible()
  await expect(page.getByText('启用图像字幕 OCR')).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)
  await page.getByRole('switch', { name: '启用图像字幕 OCR' }).click()
  await expect(page.getByText('长视频与超时')).toBeVisible()
  await expect(page.getByText('最大视频时长（小时）')).toBeVisible()
  await expectNoSeriousA11y(page)
})

test('settings storage tab is accessible', async ({ page }) => {
  await page.goto('/settings?tab=storage')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await expect(page.getByText('存储与缓存').first()).toBeVisible()
  await expect(page.getByText('磁盘总量')).toBeVisible()
  await expect(page.getByText('缓存合计')).toBeVisible()
  await expectNoSeriousA11y(page)
})

test('subtitled video can be forced to ASR', async ({ page }) => {
  // 从设置页真实保存，验证返回首页后 ASR 开关立即生效（而不是使用旧缓存）。
  await page.goto('/settings', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '语音识别' }).click()
  await expect(page.getByText('启用语音识别')).toBeVisible()
  const settingsSwitch = page.getByRole('switch', { name: '启用语音识别' })
  if (!(await settingsSwitch.isChecked())) await settingsSwitch.click()
  const saved = page.waitForResponse(response => response.url().includes('/api/config') && response.request().method() === 'PUT')
  await page.getByRole('button', { name: '保存修改' }).click()
  expect((await saved).ok()).toBe(true)

  await page.route('**/api/tracks**', route => route.fulfill({
    json: {
      tracks: [{ index: 1, codec: 'subrip', language: 'eng', title: 'English', isSupported: true, isDefault: true }],
      audioTracks: [{ index: 2, codec: 'aac', language: 'jpn', title: 'Japanese', channels: 2, isDefault: true }],
      duration: 120
    }
  }))
  let taskBody: any = null
  await page.route('**/api/task', async route => {
    taskBody = route.request().postDataJSON()
    await route.fulfill({ json: { taskId: 'asr-forced-test', taskIds: ['asr-forced-test'] } })
  })

  await page.goto('/')
  const tree = page.getByRole('tree', { name: '文件目录树' })
  await tree.getByText('Shows', { exact: true }).click()
  await tree.getByText('Demo Show', { exact: true }).click()
  await tree.getByText('Demo.Show.S01E01.mkv', { exact: true }).click()
  await expect(page.getByText('已有文本字幕。想重新听写')).toBeVisible()
  const asrSwitch = page.getByRole('switch', { name: '使用语音识别' })
  await expect(asrSwitch).toBeEnabled()
  await asrSwitch.click()
  await expect(page.getByText('已启用：将从所选音频轨道重新生成字幕')).toBeVisible()

  await asrSwitch.click()
  await expect(asrSwitch).not.toBeChecked()
  await expect(page.getByText('语音识别', { exact: true })).toBeVisible()
  await expect(page.getByText('已有文本字幕。想重新听写')).toBeVisible()

  await asrSwitch.click()
  await expect(asrSwitch).toBeChecked()
  await page.getByRole('button', { name: '开始翻译' }).click()

  await expect.poll(() => taskBody?.sourceType, { timeout: 5000 }).toBe('asr')
  expect(taskBody.trackIndex).toBe(2)
})

test('storage summary and targeted cleanup endpoints work', async ({ page }) => {
  const summary = await page.request.get('/api/storage')
  expect(summary.ok()).toBeTruthy()
  const payload = await summary.json()
  expect(Array.isArray(payload.categories)).toBeTruthy()
  expect(payload.categories.some((item: any) => item.key === 'asrAudio')).toBeTruthy()
  expect(String(payload.categories.find((item: any) => item.key === 'ocrTemp')?.path || '')).toContain('temp/ocr')
  const cleaned = await page.request.post('/api/storage/cleanup', {
    data: { targets: ['translationCache'], all: true }
  })
  expect(cleaned.ok()).toBeTruthy()
  const result = await cleaned.json()
  expect(result.success).toBe(true)
  expect(result.categories).toContain('translationCache')
})

test('Emby and Bazarr webhook endpoints accept valid tokens', async ({ page }) => {
  const token = 'subx-e2e-integration-token'
  const saved = await page.request.put('/api/config', { data: { integrationWebhookToken: token } })
  expect(saved.ok()).toBeTruthy()
  for (const source of ['emby', 'bazarr']) {
    const response = await page.request.post(`/api/integrations/${source}?token=${encodeURIComponent(token)}`, {
      data: { eventType: 'Test' }
    })
    expect(response.ok()).toBeTruthy()
    const payload = await response.json()
    expect(payload.test).toBe(true)
    expect(payload.source).toBe(source)
  }
})

test('combined auth session endpoint returns authentication state', async ({ page }) => {
  const response = await page.request.get('/api/auth/session')
  expect(response.ok()).toBeTruthy()
  const data = await response.json()
  expect(data.hasPasskey).toBe(true)
  expect(data.authenticated).toBe(true)
})

test('authenticated users are redirected away from login', async ({ page }) => {
  await page.goto('/login')
  await expect(page).toHaveURL(/\/$/)
})

test('login help modal explains passkey recovery', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('/login', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: '获取帮助' }).click()
  await expect(page.getByText('这是什么口令？')).toBeVisible()
  await expect(page.getByText('忘记口令怎么办？')).toBeVisible()
  await expect(page.getByText('DELETE FROM auth; DELETE FROM sessions;')).toBeVisible()
  await context.close()
})

test('media library edits save without leaving the page', async ({ page }) => {
  await page.goto('/media-libraries')
  await page.waitForFunction(() => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__))
  await page.getByRole('button', { name: /影视库/ }).first().click()
  await expect(page.getByText('路径说明')).toBeVisible()
  await page.getByPlaceholder('例如：电影库 / 剧集库').fill('影视库 E2E')
  await expect(page.getByText('有未保存修改').first()).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: '保存媒体库' }).click()
  await expect(page).toHaveURL(/\/media-libraries$/)
  await expect(page.getByText('保存成功').last()).toBeVisible()
  await expect(page.getByText('有未保存修改')).toHaveCount(0)
  await expect(page.getByPlaceholder('例如：电影库 / 剧集库')).toHaveValue('影视库 E2E')
  await page.getByPlaceholder('例如：电影库 / 剧集库').fill('影视库')
  await page.getByRole('dialog').getByRole('button', { name: '保存媒体库' }).click()
  await expect(page.getByText('保存成功').last()).toBeVisible()
  await expect(page.getByPlaceholder('例如：电影库 / 剧集库')).toHaveValue('影视库')
})

test.describe('tablet', () => {
  test.use({ viewport: { width: 900, height: 900 } })

  test('tablet keeps bottom navigation available', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('nav[aria-label="主导航"].fixed')).toBeVisible()
    await expect(page.getByRole('link', { name: '设置' }).last()).toBeVisible()
  })
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('mobile review and media pages do not overflow horizontally', async ({ page }) => {
    seedProofreadCache()
    await page.goto('/review/preview-review')
    await expect(page.getByRole('heading', { name: '字幕核对' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false)
    await page.getByRole('button', { name: /AI 校对 2/ }).click()
    await expect(page.getByText('缓存结果').last()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false)

    await page.goto('/media-libraries')
    await expect(page.getByLabel('搜索媒体库')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false)

    await page.goto('/history')
    await expect(page.getByRole('heading', { name: '翻译历史' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false)
  })
})
