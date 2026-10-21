import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { prettyJSON } from 'hono/pretty-json'
import { secureHeaders } from 'hono/secure-headers'
import { type Catalog, catalog } from './catalog'
import { type ApiEnv, cacheResponse, protectApi } from './operations'
import { serializeShop } from './photos'
import { filterSchema, filterShops, listQuerySchema, listShops } from './search'

/** Build the read-only API; inject a catalog to test isolated datasets. */
export function createApp(data: Catalog = catalog) {
  const app = new Hono<ApiEnv>()
  /** Declare UTF-8 after response formatting so browsers decode Japanese JSON correctly. */
  app.use('*', async (c, next) => {
    await next()
    if (c.res.headers.get('Content-Type')?.startsWith('application/json')) {
      c.header('Content-Type', 'application/json; charset=UTF-8')
    }
  })
  app.use('*', secureHeaders())
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'HEAD', 'OPTIONS'],
      exposeHeaders: ['ETag', 'Retry-After', 'X-Request-Id'],
    }),
  )
  app.use('*', protectApi)
  app.use('*', cacheResponse)
  app.use('*', prettyJSON())

  /** Describe the available endpoints and sample-data status. */
  app.get('/', (c) =>
    c.json({
      name: 'Yakiniku API',
      version: '0.1.0',
      description: 'An open-source API for yakiniku shops.',
      sampleOnly:
        data.shops.length > 0 && data.shops.every((shop) => shop.isSample),
      endpoints: [
        '/health',
        '/shops',
        '/shops/random',
        '/shops/:shopId',
        '/authors/:authorId',
      ],
      licenses: { code: 'MIT', content: 'CC-BY-4.0' },
    }),
  )

  /** Return liveness without calling external services. */
  app.get('/health', (c) => c.json({ status: 'ok' }))

  /** Return validated, filtered, paginated shop records. */
  app.get('/shops', (c) => {
    const parsed = listQuerySchema.safeParse(c.req.query())
    if (!parsed.success) {
      return c.json(
        {
          errors: parsed.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
        400,
      )
    }
    const result = listShops(data.shops, parsed.data)
    return c.json({
      ...result,
      shops: result.shops.map((shop) => serializeShop(shop, c.req.url)),
    })
  })

  /** Pick one matching shop and disable caching so each request can vary. */
  app.get('/shops/random', (c) => {
    c.header('Cache-Control', 'no-store')
    const parsed = filterSchema.safeParse(c.req.query())
    if (!parsed.success) {
      return c.json(
        {
          errors: parsed.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
        400,
      )
    }
    const shops = filterShops(data.shops, parsed.data)
    const shop = shops[Math.floor(Math.random() * shops.length)]
    if (!shop)
      return c.json({ errors: [{ message: 'No matching shop found.' }] }, 404)
    return c.json({ shop: serializeShop(shop, c.req.url) })
  })

  /** Look up one shop by its permanent contribution ID. */
  app.get('/shops/:shopId', (c) => {
    const shop = data.shops.find((item) => item.id === c.req.param('shopId'))
    if (!shop) return c.json({ errors: [{ message: 'Shop not found.' }] }, 404)
    return c.json({ shop: serializeShop(shop, c.req.url) })
  })

  /** Resolve photographer attribution from an author ID. */
  app.get('/authors/:authorId', (c) => {
    const author = data.authors.find(
      (item) => item.id === c.req.param('authorId'),
    )
    if (!author)
      return c.json({ errors: [{ message: 'Author not found.' }] }, 404)
    return c.json({ author })
  })

  /** Keep unsupported routes consistent with the API error envelope. */
  app.notFound((c) =>
    c.json({ errors: [{ message: 'Route not found.' }] }, 404),
  )
  /** Avoid returning internal exception details to callers. */
  app.onError((_error, c) => {
    // Do not persist exception messages, URLs, IPs, or headers that may contain personal data.
    console.error(
      JSON.stringify({
        event: 'api_error',
        requestId: c.get('requestId'),
        code: 'INTERNAL_ERROR',
      }),
    )
    c.header('Cache-Control', 'no-store')
    return c.json({ errors: [{ message: 'Internal server error.' }] }, 500)
  })
  return app
}

export default createApp()
