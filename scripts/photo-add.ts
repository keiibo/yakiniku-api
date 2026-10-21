import { parseArgs } from 'node:util'
import { registerPhoto } from './photos'

try {
  const { values } = parseArgs({
    options: {
      shop: { type: 'string' },
      author: { type: 'string' },
      alt: { type: 'string' },
      file: { type: 'string' },
      license: { type: 'string' },
    },
  })
  if (
    !values.shop ||
    !values.author ||
    !values.alt ||
    !values.file ||
    !values.license
  ) {
    throw new Error(
      'Usage: npm run photo:add -- --shop ID --author ID --file PATH --alt DESCRIPTION --license CC-BY-4.0',
    )
  }
  const photo = await registerPhoto(process.cwd(), {
    shop: values.shop,
    author: values.author,
    alt: values.alt,
    file: values.file,
    license: values.license,
  })
  console.log(
    `写真を登録しました: ${photo.url}\n確認後、npm run format と npm run deploy で公開できます。`,
  )
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Photo registration failed.',
  )
  process.exitCode = 1
}
