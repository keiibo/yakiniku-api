import { createHash, randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
  readdir,
} from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import {
  type Catalog,
  localPhotoPattern,
  parseCatalog,
  photoSchema,
} from '../src/catalog'

const maxInputBytes = 20 * 1024 * 1024
const maxOutputBytes = 1024 * 1024
export type PhotoOptions = {
  shop: string
  author: string
  alt: string
  file: string
  license: string
}

/** Convert bounded raster input to an oriented, metadata-free WebP for public delivery. */
export async function preparePhoto(input: Buffer) {
  if (input.length > maxInputBytes)
    throw new Error('Input image must be at most 20 MiB.')
  const image = sharp(input, {
    limitInputPixels: 40_000_000,
    failOn: 'warning',
  })
  const metadata = await image.metadata()
  if (
    !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
    (metadata.pages ?? 1) !== 1
  ) {
    throw new Error('Use a single-frame JPEG, PNG, or WebP image.')
  }
  const { data, info } = await image
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true })
  if (data.length > maxOutputBytes)
    throw new Error('Compressed image exceeds 1 MiB. Use a smaller image.')
  return {
    data,
    width: info.width,
    height: info.height,
    hash: createHash('sha256').update(data).digest('hex'),
  }
}

/** Register a photo only after checking attribution and image validity; keep originals outside the repository. */
export async function registerPhoto(root: string, options: PhotoOptions) {
  const shopsPath = join(root, 'content/shops.json')
  const before = await readFile(shopsPath, 'utf8')
  const catalog = parseCatalog(
    JSON.parse(before),
    JSON.parse(await readFile(join(root, 'content/authors.json'), 'utf8')),
  )
  const shop = catalog.shops.find((record) => record.id === options.shop)
  if (!shop) throw new Error('Unknown shop ID.')
  if (!catalog.authors.some((record) => record.id === options.author))
    throw new Error('Unknown author ID.')
  if (options.license !== 'CC-BY-4.0')
    throw new Error('Confirm the photo license with --license CC-BY-4.0.')
  if ((await stat(options.file)).size > maxInputBytes)
    throw new Error('Input image must be at most 20 MiB.')
  const image = await preparePhoto(await readFile(options.file))
  const photo = photoSchema.parse({
    url: `/images/${shop.id}/${image.hash}.webp`,
    authorId: options.author,
    alt: options.alt,
    width: image.width,
    height: image.height,
    license: options.license,
  })
  if (shop.photos.some((item) => item.url === photo.url))
    throw new Error('This photo is already registered for the shop.')
  shop.photos.push(photo)
  parseCatalog(catalog.shops, catalog.authors)
  // Check for concurrent edits before touching the catalog. Run this local command serially.
  if ((await readFile(shopsPath, 'utf8')) !== before)
    throw new Error('Catalog changed; retry the command.')
  const directory = join(root, 'public/images', shop.id)
  await mkdir(directory, { recursive: true })
  const destination = join(directory, `${image.hash}.webp`)
  const temporary = `${shopsPath}.${randomUUID()}.photo-tmp`
  await writeFile(destination, image.data, { flag: 'wx' })
  try {
    await writeFile(temporary, `${JSON.stringify(catalog.shops, null, 2)}\n`, {
      flag: 'wx',
    })
    await rename(temporary, shopsPath)
  } catch (error) {
    await rm(destination, { force: true })
    throw error
  } finally {
    await rm(temporary, { force: true })
  }
  return photo
}

/** Reject missing, unregistered, oversized, altered, or metadata-bearing files before deployment. */
export async function validatePhotos(root: string, catalog: Catalog) {
  const registered = new Set<string>()
  for (const shop of catalog.shops) {
    for (const photo of shop.photos) {
      if (!photo.url.startsWith('/')) continue
      if (
        !localPhotoPattern.test(photo.url) ||
        !photo.url.startsWith(`/images/${shop.id}/`)
      )
        throw new Error('Invalid local photo path.')
      const file = join(root, 'public', photo.url)
      const data = await readFile(file)
      const metadata = await sharp(data).metadata()
      const hash = createHash('sha256').update(data).digest('hex')
      if (
        !photo.url.endsWith(`/${hash}.webp`) ||
        data.length > maxOutputBytes ||
        metadata.format !== 'webp' ||
        metadata.width !== photo.width ||
        metadata.height !== photo.height ||
        Math.max(photo.width, photo.height) > 1600 ||
        (metadata.pages ?? 1) !== 1 ||
        metadata.exif ||
        metadata.xmp ||
        metadata.iptc ||
        metadata.icc
      )
        throw new Error(`Invalid image: ${photo.url}`)
      registered.add(photo.url.slice(1))
    }
  }
  for (const entry of await readdir(join(root, 'public'), {
    recursive: true,
    withFileTypes: true,
  })) {
    const name = join(entry.parentPath, entry.name).slice(
      join(root, 'public').length + 1,
    )
    if (entry.isSymbolicLink())
      throw new Error('Symlinks are not permitted in public assets.')
    if (
      entry.isFile() &&
      name !== '_headers' &&
      name !== 'robots.txt' &&
      !registered.has(name)
    ) {
      throw new Error(`Unregistered public file: ${name}`)
    }
  }
}
