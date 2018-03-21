import CachedBuildFunction from 'cached-build-function'
import { copyFile, ensureDir, readdir } from 'fs-extra'
import sharp from 'sharp'
import os from 'os'
import pLimit from 'p-limit'

const limit = pLimit(os.cpus().length * 4) // Concurrency limit

class ResizeImage extends CachedBuildFunction {
  static get version () { return 1 }

  static hashInput (srcFile, dstFile, { maxWidth, maxHeight }) {
    return [srcFile, maxWidth, maxHeight]
  }

  static run (srcFile, dstFile, { maxWidth, maxHeight }) {
    return limit(async () => {
      const { width, height } = await sharp(this.observeFile(srcFile))
        .resize(maxWidth, maxHeight).max()
        .toFile(this.cachePath('resized-image'))

      console.log(`Resized "${srcFile}"`)

      return { width, height  }
    })
  }

  static async after (srcFile, dstFile, { maxWidth, maxHeight }) {
    await copyFile(this.cachePath('resized-image'), dstFile)
    return this.value
  }
}

;(async function () {
  console.log('Started resizing images')

  const imageOptions = { maxWidth: 200, maxHeight: 200 }

  const resizeImage = new ResizeImage({ cachePath: 'cache/resize-image' })

  await ensureDir('resized-images')

  // Enqueue work
  const fileNames = await readdir('images')
  const imageSizes = new Map()
  const promise = Promise.all(fileNames.map(async fileName => {
    const srcFile = `images/${fileName}`
    const dstFile = `resized-images/${fileName}`
    const size = await resizeImage.enqueue(srcFile, dstFile, imageOptions)
    imageSizes.set(fileName, size)
  }))

  // Flush queue
  resizeImage.flush({ promise: false })
    .on('checkedCache', ({ cacheHitCount, cacheMissCount }) => {
      console.log(`Use cache for ${cacheHitCount}, ` +
                  `need to resize ${cacheMissCount} images`)
    })
  await promise

  // Cache cleanup
  await resizeImage.cleanUnused()

  console.log('Finished resizing images')

  // Print image sizes
  for (let [fileName, { width, height }] of imageSizes.entries()) {
    console.log(`Image "${fileName}" is now ${width}x${height}`)
  }
})().catch(error => {
  console.error(error.stack)
  process.exit(1)
})
