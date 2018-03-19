import CachedBuildFunction from 'cached-build-function'
import { copyFile, ensureDir, readdir } from 'fs-extra'
import { join } from 'path'
import os from 'os'
import sharp from 'sharp'
import pLimit from 'p-limit'

const limit = pLimit(os.cpus().length * 4) // Concurrency limit

class ResizeImage extends CachedBuildFunction {
  static get version () { return 1 }

  static hashInput (srcFile, dstFile, { maxWidth, maxHeight }) {
    return [srcFile, maxWidth, maxHeight]
  }

  static run (srcFile, dstFile, { maxWidth, maxHeight }) {
    return limit(async () => {
      const { width, height } = await sharp(this.observePath(srcFile))
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

  // Enqueue work
  const imageSizes = new Map()
  for (let img of await readdir('images')) {
    resizeImage.enqueue(`images/${img}`, `resized-images/${img}`, imageOptions)
      .then((size) => { imageSizes.set(img, size) })
  }

  await ensureDir('resized-images')

  // Flush queue
  const { count, checkedCache, all } = resizeImage.flush()
  const { cacheHitCount } = await checkedCache
  console.log(`Use cache for ${cacheHitCount}, ` +
              `need to resize ${count - cacheHitCount} images`)
  await all

  // Cache cleanup
  await resizeImage.cleanUnused()

  console.log('Finished resizing images')

  // Print image sizes
  for (let [img, { width, height }] of imageSizes.entries()) {
    console.log(`Image "${img}" is now ${width}x${height}`)
  }
})()
