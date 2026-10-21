import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  unlink,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { preparePhoto, registerPhoto, validatePhotos } from '../scripts/photos'
import { parseCatalog } from '../src/catalog'
import { fixtures } from './fixtures'

let root: string
let input: string
const options = {
  shop: 'sample-sumibi',
  author: 'yakiniku-api-contributors',
  alt: '網の上のカルビ',
  license: 'CC-BY-4.0',
}

/** Read isolated fixture data after a registration operation. */
async function readCatalog() {
  return parseCatalog(
    JSON.parse(await readFile(join(root, 'content/shops.json'), 'utf8')),
    fixtures.authors,
  )
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'yakiniku-photo-'))
  await mkdir(join(root, 'content'))
  await mkdir(join(root, 'public'))
  await writeFile(
    join(root, 'content/shops.json'),
    JSON.stringify(fixtures.shops),
  )
  await writeFile(
    join(root, 'content/authors.json'),
    JSON.stringify(fixtures.authors),
  )
  input = join(root, 'input.jpg')
  await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: '#c08040' },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toFile(input)
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('local photo registration', () => {
  it('rotates, downsizes, strips metadata, and writes a verifiable catalog entry', async () => {
    const original = await readFile(input)
    const photo = await registerPhoto(root, { ...options, file: input })
    expect(photo).toMatchObject({
      width: 800,
      height: 1600,
      alt: options.alt,
      authorId: options.author,
    })
    const output = await readFile(join(root, 'public', photo.url))
    const metadata = await sharp(output).metadata()
    expect(metadata.format).toBe('webp')
    expect(metadata.exif).toBeUndefined()
    expect(metadata.icc).toBeUndefined()
    expect(metadata.orientation).toBeUndefined()
    expect(await readFile(input)).toEqual(original)
    expect((await readCatalog()).shops[0]?.photos).toEqual([photo])
    await expect(
      validatePhotos(root, await readCatalog()),
    ).resolves.toBeUndefined()
    await expect(
      registerPhoto(root, { ...options, file: input }),
    ).rejects.toThrow('already registered')
  })
  it('does not enlarge small images', async () => {
    const data = await sharp({
      create: { width: 2, height: 3, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer()
    expect(await preparePhoto(data)).toMatchObject({ width: 2, height: 3 })
  })
  it.each([
    { shop: '../outside' },
    { author: 'missing' },
    { license: 'MIT' },
    { alt: '' },
  ])(
    'rejects invalid attribution or input before changing the catalog: %j',
    async (change) => {
      const before = await readFile(join(root, 'content/shops.json'))
      await expect(
        registerPhoto(root, { ...options, file: input, ...change }),
      ).rejects.toThrow()
      expect(await readFile(join(root, 'content/shops.json'))).toEqual(before)
    },
  )
  it('rejects SVG, invalid images, and excessive input size', async () => {
    await expect(
      preparePhoto(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
        ),
      ),
    ).rejects.toThrow('single-frame')
    await expect(preparePhoto(Buffer.from('not an image'))).rejects.toThrow()
    await expect(
      preparePhoto(Buffer.alloc(20 * 1024 * 1024 + 1)),
    ).rejects.toThrow('20 MiB')
  })
  it('rejects missing assets, mismatched dimensions, and changed bytes', async () => {
    const photo = await registerPhoto(root, { ...options, file: input })
    const catalog = await readCatalog()
    const registeredPhoto = catalog.shops[0]?.photos[0]
    if (!registeredPhoto) throw new Error('Missing registered photo.')
    registeredPhoto.width += 1
    await expect(validatePhotos(root, catalog)).rejects.toThrow('Invalid image')
    const file = join(root, 'public', photo.url)
    const changed = await sharp(file).resize(20, 20).webp().toBuffer()
    await writeFile(file, changed)
    await expect(validatePhotos(root, await readCatalog())).rejects.toThrow(
      'Invalid image',
    )
    await unlink(file)
    await expect(validatePhotos(root, await readCatalog())).rejects.toThrow()
  })
  it('refuses unregistered public files to prevent accidental publication', async () => {
    await writeFile(join(root, 'public/private.txt'), 'private')
    await expect(validatePhotos(root, await readCatalog())).rejects.toThrow(
      'Unregistered',
    )
  })
})
