/**
 * Outbound notification transports and proxy handling.
 */

import { createHmac, randomUUID } from 'crypto'
import { lookup } from 'dns/promises'
import { isIP } from 'net'
import nodemailer from 'nodemailer'
import { fetch as undiciFetch, ProxyAgent } from 'undici'
import type { NotificationChannelType, NotificationEvent } from '../../types'

export interface NotificationPayload {
  event: NotificationEvent
  title: string
  body: string
}

export function asString(value: unknown): string {
  return String(value ?? '').trim()
}


export function validateHttpUrl(value: string, label: string): string {
  const text = asString(value)
  if (!text) return ''
  try {
    const url = new URL(text)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol')
    return text
  } catch {
    throw new Error(`${label}必须是合法的 http/https 地址`)
  }
}


function isBlockedOutboundAddress(address: string): boolean {
  const ip = String(address || '').toLowerCase()
  if (ip === '0.0.0.0' || ip === '100.100.100.200' || ip === 'fd00:ec2::254') return true
  if (/^169\.254\./.test(ip)) return true
  if (/^fe80:/i.test(ip)) return true
  return false
}

async function assertSafeOutboundUrl(raw: string) {
  const url = new URL(raw)
  const hostname = url.hostname.toLowerCase()
  if (['metadata.google.internal', 'metadata', 'instance-data'].includes(hostname)) {
    throw new Error('目标地址不允许访问云元数据服务')
  }
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true }).catch(() => [])
  if (addresses.some(address => isBlockedOutboundAddress(address.address))) {
    throw new Error('目标地址指向受限网络')
  }
}

function envProxyUrl(): string {
  for (const key of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) {
    const value = asString(process.env[key])
    if (value) return value
  }
  return ''
}

function shouldBypassProxy(targetUrl: string): boolean {
  const noProxy = asString(process.env.NO_PROXY || process.env.no_proxy)
  if (!noProxy) return false
  let hostname = ''
  try {
    hostname = new URL(targetUrl).hostname.toLowerCase()
  } catch {
    return false
  }
  return noProxy.split(',').map(item => item.trim().toLowerCase()).filter(Boolean).some(item => {
    if (item === '*') return true
    const host = item.replace(/^\./, '').replace(/:\d+$/, '')
    return hostname === host || hostname.endsWith(`.${host}`)
  })
}

function resolveProxyUrl(explicit?: unknown, targetUrl?: string): string {
  const value = asString(explicit)
  if (value) return value
  if (targetUrl && shouldBypassProxy(targetUrl)) return ''
  return envProxyUrl()
}

function maskProxyUrl(proxyUrl: string): string {
  if (!proxyUrl) return ''
  try {
    const url = new URL(proxyUrl)
    return `${url.protocol}//${url.host}`
  } catch {
    return '已配置代理'
  }
}

function getProxyDispatcher(proxyUrl: string) {
  return proxyUrl ? new ProxyAgent(proxyUrl) : undefined
}

function describeFetchError(error: any): string {
  const cause = error?.cause
  return String(cause?.code || cause?.message || error?.code || error?.message || error)
}

async function outboundFetch(label: string, url: string, init: any, proxyUrl?: unknown) {
  await assertSafeOutboundUrl(url)
  const proxy = resolveProxyUrl(proxyUrl, url)
  try {
    return await undiciFetch(url, { ...init, dispatcher: getProxyDispatcher(proxy) } as any)
  } catch (error: any) {
    const proxyText = proxy ? `（代理 ${maskProxyUrl(proxy)}）` : ''
    throw new Error(`${label} 网络请求失败${proxyText}：${describeFetchError(error)}`)
  }
}

export async function testNotificationProxy(proxyUrl?: string) {
  const started = Date.now()
  const proxy = resolveProxyUrl(proxyUrl, 'https://api.telegram.org')
  const response = await outboundFetch('代理测试', 'https://api.telegram.org', {
    method: 'GET',
    signal: AbortSignal.timeout(10_000)
  }, proxyUrl)
  return {
    ok: response.status < 400 || response.status === 404,
    status: response.status,
    latencyMs: Date.now() - started,
    proxy: proxy ? maskProxyUrl(proxy) : ''
  }
}

async function sendTelegram(config: Record<string, any>, payload: NotificationPayload) {
  const token = asString(config.botToken)
  const chatId = asString(config.chatId)
  if (!token || !chatId) throw new Error('Telegram Bot Token 或 Chat ID 未配置')
  const response = await outboundFetch('Telegram', `https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: `${payload.title}\n\n${payload.body}`, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15_000)
  }, config.proxyUrl)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Telegram 发送失败 (${response.status}) ${text.substring(0, 200)}`)
  }
}

async function sendSmtp(config: Record<string, any>, payload: NotificationPayload) {
  if (!asString(config.host) || !asString(config.to)) throw new Error('SMTP Host 或收件人未配置')
  const transporter = nodemailer.createTransport({
    host: asString(config.host),
    port: Number(config.port || 587),
    secure: config.secure === true,
    auth: asString(config.user) ? { user: asString(config.user), pass: asString(config.password) } : undefined,
    tls: { rejectUnauthorized: config.rejectUnauthorized !== false },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000
  })
  await transporter.sendMail({
    from: asString(config.from) || asString(config.user),
    to: asString(config.to),
    subject: `[SubX] ${payload.title}`,
    text: payload.body
  })
}

async function sendWebhook(config: Record<string, any>, payload: NotificationPayload) {
  const url = validateHttpUrl(config.url, 'Webhook 地址')
  if (!url) throw new Error('Webhook 地址未配置')
  const body = JSON.stringify({ event: payload.event, title: payload.title, body: payload.body, timestamp: new Date().toISOString() })
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(config.headers || {}) }
  if (asString(config.secret)) {
    headers['X-SubX-Signature'] = `sha256=${createHmac('sha256', asString(config.secret)).update(body).digest('hex')}`
  }
  const response = await outboundFetch('Webhook', url, {
    method: String(config.method || 'POST'),
    headers,
    body,
    signal: AbortSignal.timeout(15_000)
  }, config.proxyUrl)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Webhook 发送失败 (${response.status}) ${text.substring(0, 200)}`)
  }
}

async function sendDiscord(config: Record<string, any>, payload: NotificationPayload) {
  const url = validateHttpUrl(config.url, 'Discord Webhook 地址')
  if (!url) throw new Error('Discord Webhook 地址未配置')
  const response = await outboundFetch('Discord', url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `${payload.title}\n\n${payload.body}` }),
    signal: AbortSignal.timeout(15_000)
  })
  if (!response.ok) throw new Error(`Discord 发送失败 (${response.status})`)
}

async function sendMatrix(config: Record<string, any>, payload: NotificationPayload) {
  const base = validateHttpUrl(config.homeserverUrl, 'Matrix Homeserver 地址').replace(/\/+$/, '')
  const roomId = asString(config.roomId)
  const token = asString(config.accessToken)
  if (!base || !roomId || !token) throw new Error('Matrix Homeserver、Room ID 或 Access Token 未配置')
  const txnId = randomUUID()
  const response = await outboundFetch('Matrix', `${base}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}?access_token=${encodeURIComponent(token)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'm.text', body: `${payload.title}\n\n${payload.body}` }),
    signal: AbortSignal.timeout(15_000)
  })
  if (!response.ok) throw new Error(`Matrix 发送失败 (${response.status})`)
}

async function sendWecom(config: Record<string, any>, payload: NotificationPayload) {
  const url = validateHttpUrl(config.url, '企业微信 Webhook 地址')
  if (!url) throw new Error('企业微信 Webhook 地址未配置')
  const response = await outboundFetch('企业微信', url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'text', text: { content: `${payload.title}\n\n${payload.body}` } }),
    signal: AbortSignal.timeout(15_000)
  })
  if (!response.ok) throw new Error(`企业微信发送失败 (${response.status})`)
}

async function sendNtfy(config: Record<string, any>, payload: NotificationPayload) {
  const base = validateHttpUrl(config.url, 'ntfy 地址') || 'https://ntfy.sh'
  const topic = asString(config.topic)
  if (!topic) throw new Error('ntfy Topic 未配置')
  const url = `${base.replace(/\/+$/, '')}/${encodeURIComponent(topic)}`
  const asciiTitle = /^[\x20-\x7E]*$/.test(payload.title) ? payload.title : 'SubX'
  const messageBody = asciiTitle === payload.title ? payload.body : `${payload.title}\n\n${payload.body}`
  const headers: Record<string, string> = {
    'Title': asciiTitle,
    'Priority': String(Math.min(5, Math.max(1, Number(config.priority) || 3)))
  }
  if (asString(config.token)) headers.Authorization = `Bearer ${asString(config.token)}`
  const response = await outboundFetch('ntfy', url, {
    method: 'POST',
    headers,
    body: messageBody,
    signal: AbortSignal.timeout(15_000)
  }, config.proxyUrl)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`ntfy 发送失败 (${response.status}) ${text.substring(0, 200)}`)
  }
}

export async function dispatchChannel(type: NotificationChannelType, config: Record<string, any>, payload: NotificationPayload) {
  if (type === 'telegram') return sendTelegram(config, payload)
  if (type === 'smtp') return sendSmtp(config, payload)
  if (type === 'webhook') return sendWebhook(config, payload)
  if (type === 'discord') return sendDiscord(config, payload)
  if (type === 'matrix') return sendMatrix(config, payload)
  if (type === 'wecom') return sendWecom(config, payload)
  return sendNtfy(config, payload)
}
