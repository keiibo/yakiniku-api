import { z } from 'zod'
import { type Shop, prefectures, tags } from './catalog'

const positiveInteger = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .transform(Number)
  .pipe(z.number().int().max(Number.MAX_SAFE_INTEGER))
export const filterSchema = z.strictObject({
  q: z.string().trim().min(1).max(100).optional(),
  prefecture: z.enum(prefectures).optional(),
  tag: z.enum(tags).optional(),
  isSample: z.enum(['true', 'false']).optional(),
  pretty: z.string().optional(),
})
export const listQuerySchema = filterSchema.extend({
  page: positiveInteger.default(1),
  perPage: positiveInteger.pipe(z.number().max(100)).default(10),
})
export type Filters = z.infer<typeof filterSchema>
export type ListQuery = z.infer<typeof listQuerySchema>

/** Filter records with AND semantics and normalize free text for Japanese input. */
export function filterShops(shops: Shop[], filters: Filters): Shop[] {
  const query = filters.q?.normalize('NFKC').toLocaleLowerCase('ja')
  return shops
    .filter((shop) => {
      const text = [
        shop.name,
        shop.city,
        shop.description,
        ...shop.specialtyCuts,
      ]
        .join(' ')
        .normalize('NFKC')
        .toLocaleLowerCase('ja')
      return (
        (!query || text.includes(query)) &&
        (!filters.prefecture || shop.prefecture === filters.prefecture) &&
        (!filters.tag || shop.tags.includes(filters.tag)) &&
        (!filters.isSample || shop.isSample === (filters.isSample === 'true'))
      )
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** Slice filtered records and provide stable, explicit pagination metadata. */
export function listShops(shops: Shop[], query: ListQuery) {
  const filtered = filterShops(shops, query)
  const lastPage = Math.max(1, Math.ceil(filtered.length / query.perPage))
  const start = (query.page - 1) * query.perPage
  return {
    shops: filtered.slice(start, start + query.perPage),
    totalCount: filtered.length,
    pageInfo: {
      currentPage: query.page,
      perPage: query.perPage,
      lastPage,
      nextPage: query.page < lastPage ? query.page + 1 : null,
      prevPage: query.page > 1 ? Math.min(query.page - 1, lastPage) : null,
    },
  }
}
