import { ensureDir, readdir, readFile, remove } from 'fs-extra'
import writeFileAtomic from 'write-file-atomic'
import { join } from 'path'
import fileFingerprint from './utils/file-fingerprint'
import sha1 from './utils/sha1'
import serializeResult from './serialization/serialize-result'
import deserializeResult from './serialization/deserialize-result'

/**
 * @module cached-build-function
 */
export default cachedBuildFunction

const LIBRARY_VERSION = 7

/**
 * Creates a `CachedBuildFunction` class.
 *
 * A CachedBuildFunction is a function that uses a folder on disk as cache.
 * The underlying function that computes the output is only called when the
 * cache on disk has no value for the specified input.
 *
 * Here is an example on how to use it:
 *
 * ```JS
 * import cachedBuildFunction from 'cached-build-function'
 * import resize from './some-image-resize-function'
 * import { writeFile, readFile, copyFile } from 'fs-extra'
 *
 * const MyResize = cachedBuildFunction({
 *   version: 42,
 *   hashInput (srcPath, dstPath, maxSize, logger) {
 *     return [srcPath, maxSize]
 *   },
 *   async run (srcPath, dstPath, maxSize, logger) {
 *    cosnt srcBuffer = await readFile(this.observeFile(path))
 *    const { buffer, size } = await resize(srcBuffer, maxSize) // Slow
 *    await writeFile(this.cachePath('image'), buffer) // Store buffer in cache
 *
 *    logger.info('Resized image') // Only logged if run() actually runs
 *
 *    return { size } // Return value must be a JSON value
 *   }
 *   async after (srcPath, dstPath, maxSize, logger) {
 *     const size = this.value
 *
 *     // Write cached file to final destination
 *     await copyFile(this.cachePath('image'), dstPath)
 *
 *     return { size }
 *   }
 * })
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
 *
 * @alias module:cached-build-function
 * @param {object} options
 * @param {number|string} options.version An integer or string that reflects the
 * current version of your `run()` function. You should change this property
 * whenever you make behavioral changes to the function. This ensures that
 * previously created cache entries, which are now outdated, are not used to
 * produce the output. You can set the `version` to `Math.random()` if you
 * want to temporarily disable caching during development.
 * @param {function} options.hashInput Optional. A function with which you can
 * select the arguments that really determine the output of the `run()`
 * function. The return value of this function must be serializable to JSON. It
 * is what will serve as input to the hash function that generates the cache
 * key. You should use this function if:
 * - you have arguments that cannot be serialized to JSON to transform them
 *   into something that can.
 * - you want to pass in additional arguments that do not determine the
 *   output to the function. (Be careful that this is really the case :)
 * @param {function} options.run The function that produces the output. It will
 * only be executed if no cached output is found. It is called with the
 * arguments that the `CachedBuildFunction` was called with. The return value of
 * this function must be serializable and deserializable to and from JSON
 * because it is written to the cache on disk. If the function throws an error
 * during execution, the error will also be serialized. The `this` inside the
 * function has the following methods:
 * - `this.observeFile(path)`: You should call this function on any file paths
 *   that you're reading from. This ensures that the cached output is only valid
 *   as long as none of the observed files have changed. Changes will be
 *   detected by comparing the creation and modification timestamps and the
 *   file size. For convenience, `observeFile()` returns its input.
 * - `this.cachePath(name)`: Returns a path inside the cache at which you can
 *   create a file or folder that you want to cache. Later inside the `after()`
 *   function, you can access the stored file or folder. The `name` parameter
 *   has to be a string that is valid inside file names. The returned path has
 *   the form `` `${cacheFolder}/${cacheKey}-${name}` ``.
 * @param {function} options.after Optional. This function is called after
 * `run()` or when a cached value has been found, given that no error occured.
 * It is called with the arguments that the `CachedBuildFunction` was called
 * with. Its return value becomes the return value of the `CachedBuildFunction`.
 * This means that you can use it to modify the output which had to be
 * stored as JSON when it was cached. Another use case is to copy files from
 * the cache to their destinations. The `this` inside the function
 * has the following properties and methods:
 * - `this.value`: The value from the cache produced by the `run()` function
 * - `this.cachePath(name)`: Same as `cachePath()` inside the `run()` function.
 *   You can use it to read or copy the file or folder stored at the path in
 *   the cache. It is important that you do not modify the file or folder.
 * @param {boolean} options.outputConsistency Default: `true`. This is an
 * advanced option. You can set it to `false` if you want the promise to
 * settle directly to the values from the `run()` function to gain a little bit
 * of extra performance.
 * Normally the output value is deserialized from JSON to make it always
 * look like it comes from the cache. Setting this option to `false`
 * disables this deserialization which is not striclty necessary for output
 * values that don't come from the cache. You should either always leave this
 * option set to `true` or at least during development. The performance gain
 * is relatively minimal if you're using your `CachedBuildFunction` to perform
 * appropriately expensive operations like hashing, resizing images, etc.
 */
function cachedBuildFunction (options) {
  const {
    version,
    hashInput: hashInputFn,
    run: runFn,
    after: afterFn,
    outputConsistency = true
  } = options || {}

  if (!version) {
    throw new Error('options.version must be defined')
  }
  if (hashInputFn && typeof hashInputFn !== 'function') {
    throw new Error('options.hashInput (optional) must be a function')
  }
  if (typeof runFn !== 'function') {
    throw new Error('options.run must be a function')
  }
  if (typeof outputConsistency !== 'boolean') {
    throw new Error('outputConsistency must be a boolean')
  }

  /**
   * `CachedBuildFunction` instances are functions. This means that they
   * can be called like any other JavaScript function. The function is
   * asynchronous, so it returns a promise. For consistency, the result or
   * reason to which the promise settles always looks like it comes from
   * the cache, i.e. values are deserialized from JSON even they were just
   * created by the `run()` function. Additionally, the promise is a bit
   * special because it has a chainable function tacked onto it which can
   * optionally be used to gain insight about whether or not a cache hit
   * occured:
   * - `onCheckedCache(function (cacheHit) {})`: `cacheHit` is `true ` if
   *   there exists an up-to-date value in the cache
   */
  class CachedBuildFunction extends Function () {
    /**

     *
     * @param {object} options
     * @param {boolean} options.cachePath The path to the folder you intend to
     * use for the cache. The `CachedBuildFunction` will create the folder if
     * it does not already exist (and if necessary also its anchestors). The
     * function expects the cache folder to only contain files it created.
     * You should also refrain from modifying any of the cache files. You
     * may, however, delete the folder or any of the files within it while
     * the function is not running.
     */
    constructor (options) {
      const { cachePath } = options || {}
      if (typeof cachePath !== 'string') {
        throw 'options.cachePath must be a string'
      }

      function self (...args) { return self._run(args) }
      Object.setPrototypeOf(self, new.target.prototype)

      self._cachePath = cachePath
      self._dirEnsured = false
      self._dirEnsuredPromise =
        ensureDir(cachePath).then(() => self._dirEnsured = true)
      self._usedCacheKeys = new Set()
      self._currentlyRunningMap = new Map()
      self._queue = []

      return self
    }

    _run (args) {
      // Hash the input
      let hashInput = hashInputFn ? hashInputFn(...args) : args
      if (typeof hashInput !== 'string') {
        hashInput = JSON.stringify(hashInput)
      }
      const cacheKey = sha1(LIBRARY_VERSION + ',' + version + ',' + hashInput)
      this._usedCacheKeys.add(cacheKey)

      // Return existing promise if an operation with the same input is
      // already in progress to avoid unnecessary work
      const currentlyRunningPromise = this._currentlyRunningMap.get(cacheKey)
      if (currentlyRunningPromise) { return currentlyRunningPromise }

      const checkedCacheCallbacks = []

      const promise = (async () => {
        if (!this._dirEnsured) { await this._dirEnsuredPromise }

        const path = join(this._cachePath, cacheKey)

        let result
        {
          let text
          try {
            text = (await readFile(path + '.json')).toString()
          } catch (e) {}

          if (text) {
            result = deserializeResult(text)

            // Ensure observed files are unchanged
            if (await detectChanges(result.observedFiles)) {
              result = undefined
            }
          }
        }

        for (let cb of checkedCacheCallbacks) { // onCheckedCache
          const ret = cb(!!result); if (ret && ret.then) { await ret }
        }

        if (result) { // Cache hit
          if (result.state === 'fulfilled' && afterFn) {
            result = await callAfterFn(afterFn, args, path, result.value)
          }

          this._currentlyRunningMap.delete(cacheKey)
          return result.state === 'fulfilled' ? result.value
                                              : Promise.reject(result.reason)
        }

        result = await callRunFn(runFn, args, path) // run()

        // Write to cache
        const text = serializeResult(result)
        const wroteToCache = new Promise ((resolve, reject) => {
          writeFileAtomic(path + '.json', text, (err) => {
            if (err) { reject(err) } else { resolve(err) }
          })
        })

        if (outputConsistency) { result = deserializeResult(text) }

        if (result.state === 'fulfilled' && afterFn) {
          result = await callAfterFn(afterFn, args, path, result.value)
        }

        await wroteToCache // Ran in the background

        this._currentlyRunningMap.delete(cacheKey)
        return result.state === 'fulfilled' ? result.value
                                            : Promise.reject(result.reason)
      })()

      this._currentlyRunningMap.set(cacheKey, promise)

      Object.assign(promise, {
        onCheckedCache (cb) { checkedCacheCallbacks.push(cb); return this }
      })

      return promise
    }

    /**
     * This function lets you enqueue a function call. Only the cache check
     * will be performed immediately asynchronously, the call to `run()` (if
     * needed) is delayed until you call `flush()`.
     *
     * @param {*} args
     */
    enqueue (...args) {
      let continueRunning
      const blockRun = new Promise(x => { continueRunning = x })

      let setCacheCheckResult
      const checkedCache = new Promise(x => { setCacheCheckResult = x })

      const promise = this(...args)
        .onCheckedCache((x) => { setCacheCheckResult(x); return blockRun })

      this._queue.push({ promise, checkedCache, continueRunning })

      return promise
    }

    /**
     * This function lets you flush the queue.
     *
     * @return {object} Object with the following properties:
     * - `count`: The number of items in the queue
     * - `checkedCache`: A promise that resolves to a `{ cacheHits, total }`
     *   object once all cache checks have been performed.
     * - `all`: A promise that resolves to an array of the output values. If
     *   an error is encountered the promise will be rejected with that error.
     *   It does not wait for all functions to complete their execution in that
     *   case.
     * - `allSettled`: A promise that settles once all function calls have
     *   completed their execution. Each array item has either the form
     *   `{ value, state: 'fulfilled' }` or `{ reason, state: 'rejected' }`.
     */
    flush () {
      const queue = this._queue
      this._queue = []

      const count = queue.length

      const checkedCache = Promise.all(queue.map(x => x.checkedCache))
        .then(cacheResults => {
          return {
            cacheHitCount: cacheResults.filter(x => x).length
          }
        })

      checkedCache.then(() => {
        for (let item of queue) { item.continueRunning() }
      })

      const all = Promise.all(queue.map(x => x.promise))

      const allSettled = Promise.all(queue.map(x => x.promise.then(
        value => { return { value, state: 'fulfilled' } },
        reason => { return { reason, state: 'rejected' } }
      )))

      return { count, checkedCache, all, allSettled }
    }

    /**
     * The `CachedBuildFunction` internally keeps track of which cache entries
     * have been accessed since it was created. The `cleanUnused()` function
     * removes any cache entries on disk that haven't been accessed.
    */
    async cleanUnused () {
      await Promise.all((await readdir(this._cachePath)).map(entry => {
        if (!this._usedCacheKeys.has(entry.split(/\.|-/, 1)[0])) {
          return remove(join(this._cachePath, entry))
        }
      }))
    }
  }

  return CachedBuildFunction
}

async function detectChanges (observedFiles) {
  let changed = false
  await Promise.all(observedFiles.map(async (x) => {
    if (await fileFingerprint(x.path) !== x.fingerprint) { changed = true }
  }))
  return changed
}

async function callRunFn (runFn, args, path) {
  const observedFilePromises = []

  const context = {
    observeFile (path) {
      const promise = fileFingerprint(path)
        .then(fingerprint => { return { path, fingerprint } })
      observedFilePromises.push(promise)
      return path
    },
    cachePath (name) { return path + '-' + name }
  }

  // Execute
  let value, reason, state
  try {
    value = await runFn.apply(context, args)
    state = 'fulfilled'
  } catch (err) {
    reason = err
    state = 'rejected'
  }

  const observedFiles = await Promise.all(observedFilePromises)

  return { value, reason, state, observedFiles }
}

async function callAfterFn (afterFn, args, path, inputValue) {
  const context = {
    value: inputValue,
    cachePath (name) { return path + '-' + name }
  }

  // Execute
  let value, reason, state
  try {
    value = await afterFn.apply(context, args)
    state = 'fulfilled'
  } catch (err) {
    reason = err
    state = 'rejected'
  }

  return { value, reason, state, }
}
