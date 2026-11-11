import { test, expect } from './fixtures'
import { expectNoSeriousA11y, setupAuth } from './helpers'

test.describe.configure({ mode: 'serial' })

let authState: Awaited<ReturnType<import('@playwright/test').APIRequestContext['storageState']>> | null = null

test.beforeAll(async ({ request }) => {
  await request.get('/api/auth/status')
  await setupAuth(request)
  authState = await request.storageState()
})

test.beforeEach(async ({ page }) => {
  if (authState) await page.context().addCookies(authState.cookies)
})

test('home keeps workspace first and history merges runtime diagnostics', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('文件浏览器')).toBeVisible()
  await expect(page.getByText('运行与诊断', { exact: true })).toHaveCount(0)
  await expectNoSeriousA11y(page)

  let overviewRequests = 0
  page.on('request', (request) => {
    if (request.url().includes('/api/operations/overview')) overviewRequests += 1
  })
  await page.goto('/history')
  await expect(page.getByRole('heading', { name: '翻译历史' })).toBeVisible()
  await expect(page.getByText('运行与诊断', { exact: true })).toBeVisible()
  expect(overviewRequests).toBe(0)
  const overviewResponse = page.waitForResponse(item => item.url().includes('/api/operations/overview') && item.status() === 200)
  await page.locator('summary').click()
  await overviewResponse
  await expect(page.getByRole('button', { name: '运行状态' })).toBeVisible()
  await expect(page.getByRole('button', { name: '诊断风险' })).toBeVisible()
  await expect(page.getByText('最近 7 天任务')).toBeVisible()
  await page.getByRole('button', { name: '诊断风险' }).click()
  await expect(page.getByText('高风险标签')).toBeVisible()
  await expectNoSeriousA11y(page)

  await page.goto('/coverage')
  await expect(page.getByRole('heading', { name: '覆盖检查' })).toBeVisible()
  await expect(page.getByText('字幕覆盖健康度')).toBeVisible()
  await page.getByText('自动补齐缺失字幕').click()
  await expect(page.getByText('预览可补齐')).toBeVisible()
  const preview = page.waitForResponse(item => item.url().includes('/api/library/coverage-auto-fill') && item.status() === 200)
  await page.getByText('预览可补齐').click()
  await preview
  await expect(page.getByText(/发现|可创建/).first()).toBeVisible()
  await expectNoSeriousA11y(page)
})

test('intelligence settings render', async ({ page }) => {
  await page.goto('/settings?tab=intelligence')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '智能增强' })).toBeVisible()
  await expect(page.getByText('简繁双输出', { exact: true })).toBeVisible()
  await expect(page.getByText('成本预算', { exact: true })).toBeVisible()
  await expect(page.getByText('媒体元数据', { exact: true })).toBeVisible()
  await expectNoSeriousA11y(page)
})
