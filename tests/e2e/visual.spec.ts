import { test, expect } from './fixtures'
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

test('home visual and accessibility', async ({ page }) => {
  const filesResponse = page.waitForResponse(item => item.url().includes('/api/files') && item.status() === 200).catch(() => null)
  await page.goto('/')
  await expect(page.getByText('文件浏览器')).toBeVisible()
  await filesResponse
  await expect(page.getByText('Movies').first()).toBeVisible()
  await expect(page.getByText('选择一个视频开始')).toBeVisible()
  await expect(page).toHaveScreenshot('home.png')
  await expectNoSeriousA11y(page)
})

test('home dark visual and accessibility', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  const filesResponse = page.waitForResponse(item => item.url().includes('/api/files') && item.status() === 200).catch(() => null)
  await page.goto('/')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByText('文件浏览器')).toBeVisible()
  await filesResponse
  await expect(page.getByText('Movies').first()).toBeVisible()
  await expect(page).toHaveScreenshot('home-dark.png')
  await expectNoSeriousA11y(page)
})

test('history visual and accessibility', async ({ page }) => {
  let diagnosticsRequests = 0
  page.on('request', request => {
    if (request.url().includes('/api/operations/overview')) diagnosticsRequests += 1
  })
  await page.goto('/history')
  await expect(page.getByRole('heading', { name: '翻译历史' })).toBeVisible()
  await expect(page.getByRole('button', { name: '进入核对' }).first()).toBeVisible()
  await expect(page).toHaveScreenshot('history.png', {
    fullPage: true
  })
  const firstHistoryRow = page.locator('tbody tr').first()
  await firstHistoryRow.hover()
  const hoverBackground = await firstHistoryRow.evaluate(element => getComputedStyle(element).backgroundColor)
  expect(hoverBackground).not.toBe('rgba(0, 0, 0, 0)')
  await expectNoSeriousA11y(page)

  expect(diagnosticsRequests).toBe(0)
  await page.waitForFunction(() => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__))
  const diagnosticsResponse = page.waitForResponse(item => item.url().includes('/api/operations/overview') && item.status() === 200)
  await page.locator('summary').click()
  await diagnosticsResponse
  expect(diagnosticsRequests).toBe(1)
})

test('review visual and accessibility', async ({ page }) => {
  const response = page.waitForResponse(item => item.url().includes('/api/tasks/preview-review/review') && item.status() === 200).catch(() => null)
  const previewResponse = page.waitForResponse(item => item.url().includes('/api/tasks/preview-review/review-preview') && item.status() === 200).catch(() => null)
  await page.goto('/review/preview-review')
  await response
  await previewResponse
  await expect(page.getByRole('heading', { name: '字幕核对' })).toBeVisible()
  await expect(page.getByText('Good evening, Minister.').first()).toBeVisible()
  await page.waitForTimeout(300)
  await expect(page).toHaveScreenshot('review.png', {
    fullPage: true
  })
  await expectNoSeriousA11y(page)
})

test('media libraries visual and accessibility', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/media-libraries')
  await expect(page.getByRole('heading', { name: '媒体库管理' })).toBeVisible()
  await expect(page.getByText('影视库').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '新增媒体库' }).first()).toBeVisible()
  await expect(page.getByLabel('搜索媒体库')).toBeVisible()
  await page.waitForTimeout(300)
  await expect(page).toHaveScreenshot('media-libraries.png', {
    fullPage: true
  })
  await page.waitForFunction(() => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__))
  await page.getByRole('button', { name: /影视库/ }).first().click()
  await expect(page.getByText('路径说明')).toBeVisible()
  await page.getByRole('button', { name: '关闭媒体库设置' }).click()
  await page.waitForFunction(() => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__))
  await page.getByLabel('搜索媒体库').fill('不存在的媒体库')
  await expect(page.getByText('没有匹配的媒体库')).toBeVisible()
  await page.getByRole('button', { name: '清空筛选' }).click()
  await expect(page.getByText('影视库').first()).toBeVisible()
  await expectNoSeriousA11y(page)
})

test('review proofread cache is actionable and filterable', async ({ page }) => {
  seedProofreadCache()
  let proofreadPostCount = 0
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/api/tasks/preview-review/proofread')) {
      proofreadPostCount += 1
    }
  })
  const cacheResponse = page.waitForResponse(item => item.url().includes('/api/tasks/preview-review/proofread') && item.url().includes('kind=consistency') && item.status() === 200).catch(() => null)
  await page.goto('/review/preview-review')
  await cacheResponse
  await expect(page.getByRole('button', { name: /AI 校对 2/ }).first()).toBeVisible()
  await page.getByRole('button', { name: /AI 校对 2/ }).first().click()
  await expect(page.getByText('缓存结果')).toBeVisible()
  await expect(page.getByText('一致性问题 2 条')).toBeVisible()
  await expect(page.getByText('人名译法与前后文不一致')).toBeVisible()
  await page.getByRole('button', { name: '只看问题字幕' }).click()
  await expect(page.getByText('筛选结果 2 条')).toBeVisible()
  expect(proofreadPostCount).toBe(0)
  await expect(page).toHaveScreenshot('review-proofread.png', {
    fullPage: false,
    maxDiffPixelRatio: 0.04
  })
  await page.getByRole('button', { name: '#8', exact: true }).first().click()
  await expect(page.locator('#review-entry-8')).toHaveClass(/ring-warning/)
  await expectNoSeriousA11y(page)
})

test('task detail visual and accessibility', async ({ page }) => {
  const response = page.waitForResponse(item => item.url().includes('/api/tasks/preview-done') && item.status() === 200).catch(() => null)
  await page.goto('/task/preview-done')
  await response
  await page.waitForTimeout(300)
  await expect(page.getByRole('heading', { name: /翻译任务/ })).toBeVisible()
  await expect(page).toHaveScreenshot('task.png', {
    fullPage: true
  })
  await expectNoSeriousA11y(page)
})

test('automation visual and accessibility', async ({ page }) => {
  await page.goto('/automation')
  await expect(page.getByRole('heading', { name: '自动化' })).toBeVisible()
  await expect(page.getByText('Movies').first()).toBeVisible()
  await expect(page).toHaveScreenshot('automation.png', {
    fullPage: true
  })
  await expectNoSeriousA11y(page)
})

test('ASR card stays visible when toggled off without subtitle tracks', async ({ page }) => {
  await page.request.put('/api/config', { data: { asrEnabled: true } })
  await page.route('**/api/tracks**', route => route.fulfill({
    json: {
      tracks: [],
      audioTracks: [{ index: 2, codec: 'aac', language: 'jpn', title: 'Japanese', channels: 2, isDefault: true }],
      duration: 120
    }
  }))
  let taskBody: any = null
  await page.route('**/api/task', async route => {
    taskBody = route.request().postDataJSON()
    await route.fulfill({ json: { taskId: 'asr-toggle-test', taskIds: ['asr-toggle-test'] } })
  })

  await page.goto('/')
  const tree = page.getByRole('tree', { name: '文件目录树' })
  await tree.getByText('Shows', { exact: true }).click()
  await tree.getByText('Demo Show', { exact: true }).click()
  await tree.getByText('Demo.Show.S01E02.mkv', { exact: true }).click()

  const asrSwitch = page.getByRole('switch', { name: '使用语音识别' })
  await expect(asrSwitch).toBeChecked()
  await expect(page.getByText('已启用语音识别，将从所选音频轨道生成字幕')).toBeVisible()

  await asrSwitch.click()
  await expect(asrSwitch).not.toBeChecked()
  await expect(page.getByText('语音识别', { exact: true })).toBeVisible()
  await expect(page.getByText('未发现文本字幕，可使用语音识别')).toBeVisible()
  await expect(page.getByText('当前视频没有可用的文本/图像字幕轨；关闭语音识别后无法创建任务。')).toBeVisible()
  await expect(page.getByText('字幕轨道：')).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  await expect(page).toHaveScreenshot('asr-source.png', {
    fullPage: false
  })

  await asrSwitch.click()
  await expect(page.getByText('已启用语音识别，将从所选音频轨道生成字幕')).toBeVisible()
  await page.getByRole('button', { name: '开始翻译' }).click()

  await expect.poll(() => taskBody?.sourceType, { timeout: 5000 }).toBe('asr')
  expect(taskBody.trackIndex).toBe(2)
})

test('settings visual and accessibility', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await expect(page).toHaveScreenshot('settings.png', {
    fullPage: true
  })
  await expectNoSeriousA11y(page)
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('mobile home visual', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
    await expect(page).toHaveScreenshot('mobile-home.png', { maxDiffPixelRatio: 0.04 })
  })
})
