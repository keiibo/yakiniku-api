import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/index'
import { fixtures } from './fixtures'

const app = createApp(fixtures)

describe('public API operations', () => {
  it('shares one trusted IP limit across routes and returns retry metadata', async () => {
    const limit = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValue({ success: false })
    const env = { API_RATE_LIMITER: { limit } }
    const headers = {
      'CF-Connecting-IP': '192.0.2.1',
      'X-Forwarded-For': 'spoofed',
    }
    expect((await app.request('/shops', { headers }, env)).status).toBe(200)
    const response = await app.request('/health', { headers }, env)
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('60')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Content-Type')).toContain('charset=UTF-8')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Expose-Headers')).toContain(
      'Retry-After',
    )
    expect(limit.mock.calls).toEqual([
      [{ key: 'yakiniku-api:192.0.2.1' }],
      [{ key: 'yakiniku-api:192.0.2.1' }],
    ])
  })
  it('uses a conservative bucket when a client IP is absent', async () => {
    const limit = vi.fn().mockResolvedValue({ success: true })
    await app.request('/shops', {}, { API_RATE_LIMITER: { limit } })
    expect(limit).toHaveBeenCalledWith({ key: 'yakiniku-api:unknown' })
  })
  it('logs a safe request identifier and fails closed if the limiter fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = await app.request(
        '/shops?q=private',
        { headers: { 'X-Request-Id': 'user-private-value' } },
        {
          API_RATE_LIMITER: {
            limit: vi.fn().mockRejectedValue(new Error('secret-token')),
          },
        },
      )
      expect(response.status).toBe(500)
      const requestId = response.headers.get('X-Request-Id')
      expect(requestId).toMatch(/^[a-f0-9-]{36}$/)
      expect(log).toHaveBeenCalledWith(
        JSON.stringify({
          event: 'api_error',
          requestId,
          code: 'INTERNAL_ERROR',
        }),
      )
      expect(await response.text()).not.toContain('secret-token')
    } finally {
      log.mockRestore()
    }
  })
  it('caches deterministic data and preserves headers on a conditional response', async () => {
    const first = await app.request('/shops')
    const tag = first.headers.get('ETag') ?? ''
    expect(tag).toMatch(/^W\/"[a-f0-9]{64}"$/)
    expect(first.headers.get('Cache-Control')).toBe(
      'public, max-age=60, must-revalidate',
    )
    for (const condition of [tag, tag.slice(2), `"other", ${tag}`, '*']) {
      const response = await app.request('/shops', {
        headers: { 'If-None-Match': condition },
      })
      expect(response.status).toBe(304)
      expect(await response.text()).toBe('')
      expect(response.headers.get('ETag')).toBe(tag)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('Content-Type')).toBeNull()
    }
  })
  it('uses distinct validators for query and pretty representations', async () => {
    const first = await app.request('/shops')
    const tag = first.headers.get('ETag') ?? ''
    for (const path of ['/shops?pretty', '/shops?perPage=1']) {
      const response = await app.request(path, {
        headers: { 'If-None-Match': tag },
      })
      expect(response.status).toBe(200)
      expect(response.headers.get('ETag')).not.toBe(tag)
    }
  })
  it('returns the GET validator on HEAD', async () => {
    const get = await app.request('/shops')
    const head = await app.request('/shops', { method: 'HEAD' })
    expect(head.headers.get('ETag')).toBe(get.headers.get('ETag'))
    expect(await head.text()).toBe('')
  })
  it.each(['/health', '/shops/random', '/shops?page=0', '/missing'])(
    'never caches %s',
    async (path) => {
      const response = await app.request(path, {
        headers: { 'If-None-Match': '*' },
      })
      expect(response.status).not.toBe(304)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(response.headers.get('ETag')).toBeNull()
    },
  )
  it('answers CORS preflight without consuming the read budget', async () => {
    const limit = vi.fn()
    expect(
      (
        await app.request(
          '/shops',
          { method: 'OPTIONS' },
          { API_RATE_LIMITER: { limit } },
        )
      ).status,
    ).toBe(204)
    expect(limit).not.toHaveBeenCalled()
  })
})
