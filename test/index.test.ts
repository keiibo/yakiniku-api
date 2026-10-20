import { describe, expect, it } from 'vitest'
import type { Shop } from '../src/catalog'
import { createApp } from '../src/index'
import { fixtures } from './fixtures'

const app = createApp(fixtures)

describe('Yakiniku API', () => {
  it('describes the sample dataset', async () => {
    const response = await app.request('/')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      name: 'Yakiniku API',
      sampleOnly: true,
    })
  })
  it('reports liveness', async () => {
    expect(await (await app.request('/health')).json()).toEqual({
      status: 'ok',
    })
  })
  it('lists shops and preserves content metadata', async () => {
    const response = await app.request('/shops?perPage=1')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      totalCount: 3,
      shops: [{ id: 'sample-horumon', isSample: true, photos: [] }],
      pageInfo: { nextPage: 2 },
    })
  })
  it('exposes search filters over HTTP', async () => {
    const params = new URLSearchParams({
      prefecture: '東京都',
      tag: 'wagyu',
      q: 'ﾊﾗﾐ',
    })
    const response = await app.request(`/shops?${params}`)
    expect(await response.json()).toMatchObject({
      totalCount: 1,
      shops: [{ id: 'sample-sumibi' }],
    })
  })
  it.each([
    'page=0',
    'page=-1',
    'page=1.5',
    'page=1abc',
    'page=',
    'page=9007199254740992',
    'perPage=101',
    'perPage=0',
    'perPage=abc',
    'q=',
    'prefecture=unknown',
    'tag=unknown',
    'isSample=yes',
    'unknown=true',
  ])('rejects invalid queries: %s', async (query) => {
    const response = await app.request(`/shops?${query}`)
    expect(response.status).toBe(400)
    expect(await response.json()).toHaveProperty('errors')
  })
  it('returns an empty set for real shops before contributions exist', async () => {
    expect(
      await (await app.request('/shops?isSample=false')).json(),
    ).toMatchObject({ totalCount: 0, shops: [] })
  })
  it('retrieves one shop', async () => {
    expect(
      await (await app.request('/shops/sample-sumibi')).json(),
    ).toMatchObject({ shop: { id: 'sample-sumibi' } })
  })
  it('resolves author credits', async () => {
    expect(
      await (await app.request('/authors/yakiniku-api-contributors')).json(),
    ).toMatchObject({ author: { name: 'Yakiniku API contributors' } })
  })
  it.each(['/shops/missing', '/authors/missing', '/missing'])(
    'returns JSON 404 errors for %s',
    async (path) => {
      const response = await app.request(path)
      expect(response.status).toBe(404)
      expect(await response.json()).toHaveProperty('errors')
    },
  )
  it('chooses a random shop from the filtered set', async () => {
    const response = await app.request('/shops/random?tag=horumon')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({
      shop: { id: 'sample-horumon' },
    })
  })
  it('returns 404 for an empty random selection', async () => {
    expect((await app.request('/shops/random?isSample=false')).status).toBe(404)
    expect(
      (await createApp({ shops: [], authors: [] }).request('/shops/random'))
        .status,
    ).toBe(404)
  })
  it('validates random filters', async () => {
    expect((await app.request('/shops/random?tag=unknown')).status).toBe(400)
  })
  it('supports pretty JSON', async () => {
    expect(await (await app.request('/shops?pretty')).text()).toContain(
      '\n  "shops"',
    )
  })
  it.each([
    '/shops',
    '/shops?pretty',
    '/shops/sample-sumibi',
    '/shops/sample-sumibi?pretty',
  ])('declares UTF-8 and preserves Japanese bytes for %s', async (path) => {
    const response = await app.request(path)
    expect(response.headers.get('content-type')).toBe(
      'application/json; charset=UTF-8',
    )
    const text = new TextDecoder('utf-8', { fatal: true }).decode(
      await response.arrayBuffer(),
    )
    expect(text).toContain('サンプル焼肉')
    expect(text).toContain('東京都')
    expect(text).not.toContain('\uFFFD')
    expect(() => JSON.parse(text)).not.toThrow()
  })
  it.each(['/shops?page=0', '/shops/missing', '/missing?pretty'])(
    'declares UTF-8 for JSON errors at %s',
    async (path) => {
      const response = await app.request(path)
      expect(response.headers.get('content-type')).toBe(
        'application/json; charset=UTF-8',
      )
    },
  )
  it('does not add a JSON content type to an empty preflight response', async () => {
    const response = await app.request('/shops', { method: 'OPTIONS' })
    expect(response.status).toBe(204)
    expect(response.headers.get('content-type')).toBeNull()
  })
  it('allows browser read requests', async () => {
    const response = await app.request('/shops', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Method': 'GET',
      },
    })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('access-control-allow-methods')).toContain(
      'GET',
    )
  })
  it('supports HEAD without a body', async () => {
    const response = await app.request('/shops', { method: 'HEAD' })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
  })
  it('does not expose write routes', async () => {
    expect((await app.request('/shops', { method: 'POST' })).status).toBe(404)
  })
  it('does not leak internal errors', async () => {
    const broken = createApp({
      get shops(): Shop[] {
        throw new Error('private detail')
      },
      authors: [],
    })
    const response = await broken.request('/shops')
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      errors: [{ message: 'Internal server error.' }],
    })
  })
})
