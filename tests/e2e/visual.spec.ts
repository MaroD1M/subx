import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { seedTasks, setupAuth } from './helpers'

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

async function expectNoSeriousA11y(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = results.violations.filter(violation => ['critical', 'serious'].includes(violation.impact || ''))
  expect(serious, serious.map(item => `${item.id}: ${item.help}`).join('\n')).toEqual([])
}

test('home visual and accessibility', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('文件浏览器')).toBeVisible()
  await expect(page).toHaveScreenshot('home.png', {
    fullPage: true,
    mask: [page.locator('header .version-badge')]
  })
  await expectNoSeriousA11y(page)
})

test('history visual and accessibility', async ({ page }) => {
  await page.goto('/history')
  await expect(page.getByRole('heading', { name: '翻译历史' })).toBeVisible()
  await expect(page).toHaveScreenshot('history.png', {
    fullPage: true,
    mask: [page.locator('header .version-badge')]
  })
  await expectNoSeriousA11y(page)
})

test('review visual and accessibility', async ({ page }) => {
  await page.goto('/review/preview-review')
  await expect(page.getByRole('heading', { name: '字幕核对' })).toBeVisible()
  await expect(page).toHaveScreenshot('review.png', {
    fullPage: true,
    mask: [page.locator('header .version-badge')]
  })
  await expectNoSeriousA11y(page)
})

test('task detail visual and accessibility', async ({ page }) => {
  await page.goto('/task/preview-done')
  await expect(page.getByRole('heading', { name: /翻译任务/ })).toBeVisible()
  await expect(page).toHaveScreenshot('task.png', {
    fullPage: true,
    mask: [page.locator('header .version-badge')]
  })
  await expectNoSeriousA11y(page)
})

test('automation visual and accessibility', async ({ page }) => {
  await page.goto('/automation')
  await expect(page.getByRole('heading', { name: '自动化' })).toBeVisible()
  await expect(page.getByText('Movies').first()).toBeVisible()
  await expect(page).toHaveScreenshot('automation.png', {
    fullPage: true,
    mask: [page.locator('header .version-badge')]
  })
  await expectNoSeriousA11y(page)
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
  const dir = join(process.cwd(), '.test-artifacts', 'media', 'WatchTrigger')
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

test('settings visual and accessibility', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await expect(page).toHaveScreenshot('settings.png', {
    fullPage: true,
    mask: [page.locator('header .version-badge')]
  })
  await expectNoSeriousA11y(page)
})

test('settings ASR tab is accessible', async ({ page }) => {
  await page.goto('/settings?tab=asr')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await expect(page.getByText('快速预设')).toBeVisible()
  await expect(page.getByText('启用语音识别')).toBeVisible()
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
  await page.getByRole('button', { name: '开始翻译' }).click()

  await expect.poll(() => taskBody?.sourceType, { timeout: 5000 }).toBe('asr')
  expect(taskBody.trackIndex).toBe(2)
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

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('mobile home visual', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
    await expect(page).toHaveScreenshot('mobile-home.png', {
      fullPage: true,
      mask: [page.locator('header .version-badge')]
    })
  })
})
