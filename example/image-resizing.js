
 * ```JS
 * const processFile = new ProcessFile({ cachePath: 'path/to/my/cache') })
 *
 * await processFile('data1.json') // Cheap if files havn't changed
 * await processFile('data2.json')
 *
 * await myResize.cleanUnused() // Removes unused cache entries
 * ```
 *
 *
 * Here is an example on how to use it:
 *
 * ```JS
 * import cachedBuildFunction from 'cached-build-function'
 * import resize from './some-image-resize-function'
 * import { writeFile, readFile, copyFile } from 'fs-extra'
 *
 * class MyResize extends CachedBuildFunction {
 *   static get version () { return 42 }
 *
 *   static hashInput (srcPath, dstPath, maxSize, logger) {
 *     return [srcPath, maxSize]
 *   }
 *
 *   static async run (srcPath, dstPath, maxSize, logger) {
 *    cosnt srcBuffer = await readFile(this.observeFile(path))
 *    const { buffer, size } = await resize(srcBuffer, maxSize) // Slow
 *    await writeFile(this.cachePath('image'), buffer) // Store buffer in cache
 *
 *    logger.info('Resized image') // Only logged if run() actually runs
 *
 *    return { size } // Return value must be a JSON value
 *   }
 *
 *   static async after (srcPath, dstPath, maxSize, logger) {
 *     const size = this.value
 *
 *     // Write cached file to final destination
 *     await copyFile(this.cachePath('image'), dstPath)
 *
 *     return { size }
 *   }
 * }
 * ```
 *
 * ```JS
 * const myResize = new MyResize({ cachePath: 'path/to/my/cache') })
 *
 * // Slow or fast depeding on whether the result is in the cache
 * const dstSize = await myResize('src.jpg', 'dst.jpg', [200, 300], logger)
 *   .onCheckedCache((hit) => { if (hit) { logger.info('Cache hit!') } })
 *
 * // Remove cache entries that weren't used
 * await myResize.cleanUnused()
 * ```
