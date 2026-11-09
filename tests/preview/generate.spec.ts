import { test, expect } from '@playwright/test'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { seedProofreadCache, seedTasks, setupAuth } from '../e2e/helpers'

const MEDIA_ROOT = join(process.cwd(), '.test-artifacts', 'media')
const PREVIEW_MEDIA_ROOT = join(tmpdir(), 'subx-preview-media')
const OUTPUT_ROOT = join(process.cwd(), 'docs', 'images')

let authState: Awaited<ReturnType<import('@playwright/test').APIRequestContext['storageState']>> | null = null

test.beforeAll(async ({ request }) => {
  await request.get('/api/auth/status')
  await setupAuth(request)
  authState = await request.storageState()
  seedTasks()
  seedProofreadCache()

  mkdirSync(join(MEDIA_ROOT, 'Anime'), { recursive: true })
  mkdirSync(join(MEDIA_ROOT, 'Documentaries'), { recursive: true })
  rmSync(PREVIEW_MEDIA_ROOT, { recursive: true, force: true })
  cpSync(MEDIA_ROOT, PREVIEW_MEDIA_ROOT, { recursive: true })
  const config = await request.put('/api/config', {
    data: {
      mediaRoots: [
        { id: 'default', name: '影视库', path: PREVIEW_MEDIA_ROOT, enabled: true, isDefault: true, order: 0 },
        { id: 'movies', name: '电影库', path: join(PREVIEW_MEDIA_ROOT, 'Movies'), enabled: true, isDefault: false, order: 1 },
        { id: 'shows', name: '剧集库', path: join(PREVIEW_MEDIA_ROOT, 'Shows'), enabled: true, isDefault: false, order: 2 },
        { id: 'anime', name: '动画库', path: join(PREVIEW_MEDIA_ROOT, 'Anime'), enabled: true, isDefault: false, order: 3 }
      ]
    }
  })
  if (!config.ok()) throw new Error(`Preview config failed: ${config.status()} ${await config.text()}`)
})

test.afterAll(() => {
  rmSync(PREVIEW_MEDIA_ROOT, { recursive: true, force: true })
})

async function preparePage(page: import('@playwright/test').Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
      .stagger-fade-in,
      .stagger-fade-in > *,
      .animate-in {
        opacity: 1 !important;
      }
      html { scrollbar-width: none; }
      ::-webkit-scrollbar { display: none !important; }
      [data-preview-static] { position: static !important; }
    `
  })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(250)
  await page.evaluate(() => window.scrollTo(0, 0))
}

async function capture(page: import('@playwright/test').Page, name: string) {
  await preparePage(page)
  await page.screenshot({
    path: join(OUTPUT_ROOT, name),
    fullPage: false,
    animations: 'disabled',
    caret: 'hide'
  })
}

test('generate documentation preview images', async ({ page, browser }) => {
  if (authState) await page.context().addCookies(authState.cookies)

  const homeFiles = page.waitForResponse(item => item.url().includes('/api/files') && item.status() === 200).catch(() => null)
  await page.goto('/')
  await homeFiles
  await expect(page.getByText('文件浏览器')).toBeVisible()
  await expect(page.getByText('Movies').first()).toBeVisible()
  await expect(page.getByText('选择一个视频开始')).toBeVisible()
  await capture(page, 'preview-home.png')

  await page.goto('/history')
  await expect(page.getByRole('heading', { name: '翻译历史' })).toBeVisible()
  await expect(page.getByRole('button', { name: '进入核对' }).first()).toBeVisible()
  await page.waitForFunction(() => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__))
  const diagnosticsResponse = page.waitForResponse(item => item.url().includes('/api/tasks/diagnostics/overview') && item.status() === 200).catch(() => null)
  await page.locator('summary').click()
  await diagnosticsResponse
  await expect(page.getByText('高风险标签')).toBeVisible()
  await page.locator('summary').click()
  await capture(page, 'preview-history.png')

  const reviewResponse = page.waitForResponse(item => item.url().includes('/api/tasks/preview-review/review') && item.status() === 200).catch(() => null)
  const previewResponse = page.waitForResponse(item => item.url().includes('/api/tasks/preview-review/review-preview') && item.status() === 200).catch(() => null)
  await page.goto('/review/preview-review')
  await reviewResponse
  await previewResponse
  await expect(page.getByRole('heading', { name: '字幕核对' })).toBeVisible()
  await expect(page.getByText('Good evening, Minister.').first()).toBeVisible()
  await capture(page, 'preview-review.png')

  await page.getByRole('button', { name: /AI 校对 2/ }).first().click()
  await expect(page.getByText('缓存结果').last()).toBeVisible()
  await expect(page.getByText('一致性问题 2 条')).toBeVisible()
  await capture(page, 'preview-review-ai.png')

  await page.goto('/media-libraries')
  await expect(page.getByLabel('搜索媒体库')).toBeVisible()
  await expect(page.getByText('电影库').first()).toBeVisible()
  await capture(page, 'preview-media-libraries.png')

  const taskResponse = page.waitForResponse(item => item.url().includes('/api/tasks/preview-done') && item.status() === 200).catch(() => null)
  await page.goto('/task/preview-done')
  await taskResponse
  await expect(page.getByRole('heading', { name: /翻译任务/ })).toBeVisible()
  await capture(page, 'preview-task.png')

  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await capture(page, 'preview-settings.png')

  await page.goto('/automation')
  await expect(page.getByRole('heading', { name: '自动化' })).toBeVisible()
  await expect(page.getByText('Movies').first()).toBeVisible()
  await capture(page, 'preview-automation.png')

  await page.request.put('/api/config', { data: { asrEnabled: true } })
  await page.route('**/api/tracks**', route => route.fulfill({
    json: {
      tracks: [],
      audioTracks: [{ index: 2, codec: 'aac', language: 'jpn', title: 'Japanese', channels: 2, isDefault: true }],
      duration: 120
    }
  }))
  const asrFiles = page.waitForResponse(item => item.url().includes('/api/files') && item.status() === 200).catch(() => null)
  await page.goto('/')
  await asrFiles
  const tree = page.getByRole('tree', { name: '文件目录树' })
  await tree.getByText('Shows', { exact: true }).click()
  await tree.getByText('Demo Show', { exact: true }).click()
  await tree.getByText('Demo.Show.S01E02.mkv', { exact: true }).click()
  await expect(page.getByRole('switch', { name: '使用语音识别' })).toBeChecked()
  await expect(page.getByText('已启用语音识别，将从所选音频轨道生成字幕')).toBeVisible()
  await capture(page, 'preview-asr.png')

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light',
    reducedMotion: 'reduce'
  })
  if (authState) await mobileContext.addCookies(authState.cookies)
  const mobilePage = await mobileContext.newPage()
  await mobilePage.goto('/')
  await expect(mobilePage.getByRole('navigation', { name: '主导航' })).toBeVisible()
  await expect(mobilePage.getByText('Movies').first()).toBeVisible()
  await preparePage(mobilePage)
  await mobilePage.screenshot({
    path: join(OUTPUT_ROOT, 'preview-mobile.png'),
    fullPage: false,
    animations: 'disabled',
    caret: 'hide'
  })
  await mobileContext.close()

  const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8')
  for (const match of readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1]!
    if (/^https?:/i.test(link)) continue
    expect(existsSync(join(process.cwd(), link)), `Missing preview image: ${link}`).toBe(true)
  }
})
