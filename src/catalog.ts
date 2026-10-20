import { z } from 'zod'
import authorsData from '../content/authors.json'
import shopsData from '../content/shops.json'

export const prefectures = [
  '北海道',
  '青森県',
  '岩手県',
  '宮城県',
  '秋田県',
  '山形県',
  '福島県',
  '茨城県',
  '栃木県',
  '群馬県',
  '埼玉県',
  '千葉県',
  '東京都',
  '神奈川県',
  '新潟県',
  '富山県',
  '石川県',
  '福井県',
  '山梨県',
  '長野県',
  '岐阜県',
  '静岡県',
  '愛知県',
  '三重県',
  '滋賀県',
  '京都府',
  '大阪府',
  '兵庫県',
  '奈良県',
  '和歌山県',
  '鳥取県',
  '島根県',
  '岡山県',
  '広島県',
  '山口県',
  '徳島県',
  '香川県',
  '愛媛県',
  '高知県',
  '福岡県',
  '佐賀県',
  '長崎県',
  '熊本県',
  '大分県',
  '宮崎県',
  '鹿児島県',
  '沖縄県',
] as const
export const tags = ['wagyu', 'horumon', 'charcoal', 'all-you-can-eat'] as const
const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const textSchema = z.string().trim().min(1)
const httpsUrl = z.url({ protocol: /^https$/ })

export const authorSchema = z.strictObject({
  id: idSchema,
  name: textSchema,
  url: httpsUrl.optional(),
})
export const photoSchema = z.strictObject({
  url: httpsUrl,
  authorId: idSchema,
  alt: textSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  license: z.literal('CC-BY-4.0'),
})
export const shopSchema = z
  .strictObject({
    id: idSchema.refine((id) => id !== 'random', 'Reserved shop ID.'),
    name: textSchema,
    prefecture: z.enum(prefectures),
    city: textSchema,
    description: textSchema,
    specialtyCuts: z.array(textSchema),
    tags: z.array(z.enum(tags)),
    website: httpsUrl.optional(),
    sourceUrl: httpsUrl.optional(),
    checkedAt: z.iso.date(),
    isSample: z.boolean(),
    photos: z.array(photoSchema),
  })
  .refine((shop) => shop.isSample || shop.sourceUrl !== undefined, {
    message: 'Real shops must include a sourceUrl.',
  })
export type Shop = z.infer<typeof shopSchema>
export type Author = z.infer<typeof authorSchema>
export type Catalog = { shops: Shop[]; authors: Author[] }

/** Validate contributed records, unique IDs, and photo attribution references. */
export function parseCatalog(shops: unknown, authors: unknown): Catalog {
  const catalog = {
    shops: z.array(shopSchema).parse(shops),
    authors: z.array(authorSchema).parse(authors),
  }
  for (const records of [catalog.shops, catalog.authors]) {
    const ids = new Set<string>()
    for (const record of records) {
      if (ids.has(record.id)) throw new Error(`Duplicate ID: ${record.id}`)
      ids.add(record.id)
    }
  }
  const authorIds = new Set(catalog.authors.map((author) => author.id))
  for (const shop of catalog.shops) {
    for (const photo of shop.photos) {
      if (!authorIds.has(photo.authorId)) {
        throw new Error(`Unknown photo author: ${photo.authorId}`)
      }
    }
  }
  return catalog
}

export const catalog = parseCatalog(shopsData, authorsData)
