import type { MiddlewareHandler } from 'hono'

export type ApiEnv = {
  Bindings: {
    API_RATE_LIMITER?: {
      limit(options: { key: string }): Promise<{ success: boolean }>
    }
  }
  Variables: { requestId: string }
}

/** Tag requests and enforce a shared per-IP budget before route processing. */
export const protectApi: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const requestId = crypto.randomUUID()
  c.set('requestId', requestId)
  c.header('X-Request-Id', requestId)
  c.header('Cache-Control', 'no-store')
  const limiter = c.env?.API_RATE_LIMITER
  if (limiter) {
    const key = c.req.header('CF-Connecting-IP') || 'unknown'
    const { success } = await limiter.limit({ key: `yakiniku-api:${key}` })
    if (!success) {
      c.header('Retry-After', '60')
      return c.json(
        { errors: [{ message: 'Too many requests. Retry after 60 seconds.' }] },
        429,
      )
    }
  }
  await next()
}

/** Cache successful deterministic GET responses and honor weak conditional requests. */
export const cacheResponse: MiddlewareHandler<ApiEnv> = async (c, next) => {
  await next()
  if (
    !['GET', 'HEAD'].includes(c.req.method) ||
    c.res.status !== 200 ||
    ['/health', '/shops/random'].includes(c.req.path)
  )
    return
  const bytes = await c.res.clone().arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  const tag = `W/"${Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, '0')).join('')}"`
  c.header('Cache-Control', 'public, max-age=60, must-revalidate')
  c.header('ETag', tag)
  const conditions =
    c.req
      .header('If-None-Match')
      ?.split(',')
      .map((value) => value.trim().replace(/^W\//, '')) ?? []
  if (conditions.includes('*') || conditions.includes(tag.slice(2))) {
    const headers = new Headers(c.res.headers)
    headers.delete('Content-Type')
    headers.delete('Content-Length')
    c.res = new Response(null, { status: 304, headers })
  }
}
