import { catalog } from '../src/catalog'
import { validatePhotos } from './photos'

await validatePhotos(process.cwd(), catalog)
console.log('Photo files and attribution validated.')
