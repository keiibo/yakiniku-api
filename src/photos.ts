import type { Shop } from './catalog'

/** Resolve repository image paths against the serving origin without changing source records. */
export function serializeShop(shop: Shop, requestUrl: string): Shop {
  return {
    ...shop,
    photos: shop.photos.map((photo) => ({
      ...photo,
      url: new URL(photo.url, new URL(requestUrl).origin).href,
    })),
  }
}
