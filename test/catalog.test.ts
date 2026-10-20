import { describe, expect, it } from 'vitest'
import { catalog, parseCatalog } from '../src/catalog'

import { fixtures } from './fixtures'

const shop = fixtures.shops[0]
const author = fixtures.authors[0]
if (!shop || !author) throw new Error('Sample fixtures are missing.')
const photo = {
  url: 'https://example.com/photo.jpg',
  authorId: author.id,
  alt: '焼肉の写真',
  width: 800,
  height: 600,
  license: 'CC-BY-4.0',
}

describe('parseCatalog', () => {
  it('validates every committed record', () => {
    expect(parseCatalog(catalog.shops, catalog.authors)).toEqual(catalog)
  })
  it('accepts an empty catalog', () => {
    expect(parseCatalog([], [])).toEqual({ shops: [], authors: [] })
  })
  it('accepts attributed photos and sourced real shops', () => {
    expect(
      parseCatalog(
        [
          {
            ...shop,
            isSample: false,
            sourceUrl: 'https://example.com/shop',
            photos: [photo],
          },
        ],
        [author],
      ).shops[0]?.photos,
    ).toHaveLength(1)
  })
  it('rejects duplicate shop IDs', () => {
    expect(() => parseCatalog([shop, shop], [])).toThrow('Duplicate ID')
  })
  it('rejects duplicate author IDs', () => {
    expect(() => parseCatalog([], [author, author])).toThrow('Duplicate ID')
  })
  it('rejects unresolved photo authors', () => {
    expect(() => parseCatalog([{ ...shop, photos: [photo] }], [])).toThrow(
      'Unknown photo author',
    )
  })
  it.each([
    { id: 'Invalid ID' },
    { id: 'random' },
    { name: ' ' },
    { prefecture: '架空県' },
    { checkedAt: '2026-02-30' },
    { isSample: false },
    { tags: ['unknown'] },
    { website: 'javascript:alert(1)' },
    { sourceUrl: 'http://example.com' },
    { unexpected: true },
    { photos: [{ ...photo, width: 0 }] },
    { photos: [{ ...photo, license: 'unknown' }] },
  ])('rejects invalid content: %j', (change) => {
    expect(() => parseCatalog([{ ...shop, ...change }], [author])).toThrow()
  })
})
