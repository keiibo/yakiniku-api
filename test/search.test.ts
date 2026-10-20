import { describe, expect, it } from 'vitest'
import { fixtures as catalog } from './fixtures'
import { filterShops, listQuerySchema, listShops } from '../src/search'

describe('filterShops', () => {
  it('combines prefecture, tag and text filters', () => {
    const shops = filterShops(catalog.shops, {
      prefecture: '東京都',
      tag: 'wagyu',
      q: 'ハラミ',
    })
    expect(shops.map((shop) => shop.id)).toEqual(['sample-sumibi'])
    expect(
      filterShops(catalog.shops, { prefecture: '東京都', tag: 'horumon' }),
    ).toEqual([])
  })
  it('normalizes half-width kana', () => {
    expect(filterShops(catalog.shops, { q: 'ﾊﾗﾐ' })).toHaveLength(1)
  })
  it('filters sample and real data explicitly', () => {
    expect(filterShops(catalog.shops, { isSample: 'false' })).toEqual([])
    expect(filterShops(catalog.shops, { isSample: 'true' })).toHaveLength(3)
  })
  it('sorts by stable IDs without changing the input order', () => {
    const shops = [...catalog.shops].reverse()
    const before = [...shops]
    expect(filterShops(shops, {}).map((shop) => shop.id)).toEqual([
      'sample-horumon',
      'sample-sumibi',
      'sample-table',
    ])
    expect(shops).toEqual(before)
  })
})

describe('listShops', () => {
  it('returns defaults and pagination metadata', () => {
    const result = listShops(catalog.shops, listQuerySchema.parse({}))
    expect(result.totalCount).toBe(3)
    expect(result.pageInfo).toEqual({
      currentPage: 1,
      perPage: 10,
      lastPage: 1,
      nextPage: null,
      prevPage: null,
    })
  })
  it('paginates after filtering', () => {
    const result = listShops(
      catalog.shops,
      listQuerySchema.parse({ perPage: '1', page: '2' }),
    )
    expect(result.shops[0]?.id).toBe('sample-sumibi')
    expect(result.pageInfo).toEqual({
      currentPage: 2,
      perPage: 1,
      lastPage: 3,
      nextPage: 3,
      prevPage: 1,
    })
  })
  it('returns an empty page past the last page', () => {
    const result = listShops(
      catalog.shops,
      listQuerySchema.parse({ page: '50' }),
    )
    expect(result.shops).toEqual([])
    expect(result.pageInfo.nextPage).toBeNull()
    expect(result.pageInfo.prevPage).toBe(1)
  })
  it('defines an empty result as page 1 of 1', () => {
    const result = listShops([], listQuerySchema.parse({}))
    expect(result.totalCount).toBe(0)
    expect(result.pageInfo.lastPage).toBe(1)
  })
})
