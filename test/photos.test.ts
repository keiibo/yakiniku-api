import { describe, expect, it } from 'vitest'
import { photoSchema } from '../src/catalog'
import { createApp } from '../src/index'
import { serializeShop } from '../src/photos'
import { fixtures } from './fixtures'

const sampleShop = fixtures.shops[0]
if (!sampleShop) throw new Error('Missing fixture shop.')

const path = `/images/sample-sumibi/${'a'.repeat(64)}.webp`
const photo = {
  url: path,
  authorId: 'yakiniku-api-contributors',
  alt: '焼肉',
  width: 800,
  height: 600,
  license: 'CC-BY-4.0' as const,
}

describe('photo representations', () => {
  it('resolves local photos without changing the stored catalog', () => {
    const shop = {
      ...sampleShop,
      photos: [photo, { ...photo, url: 'https://example.com/a.jpg' }],
    }
    const result = serializeShop(shop, 'https://api.example.com/shops?pretty')
    expect(result.photos.map((item) => item.url)).toEqual([
      `https://api.example.com${path}`,
      'https://example.com/a.jpg',
    ])
    expect(shop.photos[0]?.url).toBe(path)
  })
  it.each([
    '//example.com/x',
    '/images/../secret.webp',
    '/images/a/x.webp',
    'http://example.com/a.jpg',
  ])('rejects unsafe photo paths: %s', (url) => {
    expect(photoSchema.safeParse({ ...photo, url }).success).toBe(false)
  })
  it('accepts content-addressed paths', () => {
    expect(photoSchema.safeParse(photo).success).toBe(true)
  })
  it('exposes photos with attribution in list, detail, and random responses', async () => {
    const app = createApp({
      ...fixtures,
      shops: [{ ...sampleShop, photos: [photo] }],
    })
    for (const endpoint of [
      '/shops',
      '/shops/sample-sumibi',
      '/shops/random',
    ]) {
      const response = await app.request(`https://api.example.com${endpoint}`)
      const body = await response.json()
      expect((body.shop ?? body.shops[0]).photos).toEqual([
        { ...photo, url: `https://api.example.com${path}` },
      ])
    }
  })
})
