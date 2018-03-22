import { ensureDir, readdir, readFile, remove } from 'fs-extra'
import writeFileAtomic from 'write-file-atomic'
import { join } from 'path'
import EventEmitter from 'events'
import fileFingerprint from './utils/file-fingerprint'
import sha1 from './utils/sha1'
import serializeResult from './serialization/serialize-result'
import deserializeResult from './serialization/deserialize-result'

/**
 * @module cached-build-function
 */

const LIBRARY_VERSION = 7

/**
 * The `CachedBuildFunction` class is abstract. To use it, you need to create
 * a subclass and implement the static properties `version` and `run`.
 *
 * ```javascript
 * class MyBuildFn extends CachedBuildFunction {
 *   static get version () { return 123 }
 *   static async run (...) { ... }
 * }
 * ```
 *
 * Next, you can create an instance with the `new` operator and because
 * instances are functions you can call it.
 *
 * ```javascript
 * const myBuildFn = new MyBuildFn({ cachePath: '...' })
 * const output = await myBuildFn(arg1, arg2, ...)
 * ```
 *
 * `CachedBuildFunction` instances are asynchronouse functions. This means that
 * they return a promise. The promise settles after the result could either be
 * fetched from the cache or has been calculated by the `run()` function.
 *
 * For consistency, the `value` or `reason` to which the promise settles
 * always looks like it comes from the cache, i.e. values are deserialized from
 * JSON even they were just created by the `run()` function.
 *
 * Furthermore, the returned promise has some extra properties:
 * - `eventEmitter` EventEmitter that fires the following events:
 *   - `'checkedCache'`: Fired after the cache check has completed. Its
 *     data is an object with a `cacheHit` boolean property
 *   - `'cacheHit'`: Fired in case of a cache hit
 *   - `'cacheMiss'`: Fired in case of a cache miss
 * - `on()`: Calls `eventEmitter.on()` and is chainable. This means you can do
 *   this:
 *   ```javascript
 *   const output = await myBuildFn()
 *     .on('cacheHit', () => { console.log('Wohoo! Cache hit') })
 *   ```
 *
 * @alias module:cached-build-function
 */
class CachedBuildFunction extends Function () {
  /**
   * The static `version` property returns an integer or string that reflects
   * the current version of your `run()` function. You should change this
   * property whenever you make behavioral changes to the function. This ensures
   * that previously created cache entries, which are now outdated, are not used
   * to produce the output. You can set the `version` to `Math.random()` if you
   * want to temporarily disable caching during development.
   * @abstract
   * @return {string|number}
   */
  static get version () {
    throw new Error(
      'Static property CachedBuildFunction.version not implemented')
  }

  /**
   * The static `run()` method is used to produce the output whenever
   * no valid cache entry can be found. It is called with the arguments that
   * the `CachedBuildFunction` was called with. The return value of this
   * function must be serializable (and deserializable) to (and from) JSON
   * because it is written to the cache on disk. If the function throws an error
   * during execution, the error will also be serialized and cached. The
   * `this` inside the function is special and has the following methods:
   * - `this.observe(path)`: You should call this function on any file paths
   *   that you're reading from. This ensures that the cached output is only
   *   valid as long as none of the observed files have changed. Whenever a
   *   cache entry is found, `CachedBuildFunction` checks whether all observed
   *   files remain unchanged before it decides to use the cache entry. It
   *   does so by comparing the file size and creation and modification
   *   timestamps. For convenience, `observe()` returns its input. It won't
   *   throw an error if it can't find the file.
   * - `this.cachePath(name)`: Returns a path inside the cache folder. You can
   *   use this path to create a file or folder that you want to cache. Later
   *   inside the `after()` function, you can access the stored file or folder.
   *   The `name` parameter has to be a string that is valid inside file names.
   *   The returned path has the form
   *   `` `${cacheFolder}/${cacheKey}-${name}` ``.
   * @abstract
   * @return {Promise}
   */
  static run () {
    throw new Error('Static method CachedBuildFunction.run() not implemented')
  }

  /**
   * The static `after()` method can be used to transform the output produced
   * by `run()` (given that no error occured). Just like `run()`, it is called
   * with the arguments that the `CachedBuildFunction` was called with. Its
   * return value becomes the return value of the `CachedBuildFunction`.
   * This means that you can use it to transform the output which had to be
   * stored as JSON when it was cached into something else. Or, you can use it
   * to copy files from the cache to their final destinations. The `this`
   * inside the function has the following properties and methods:
   * - `this.value`: The value from the cache produced by the `run()` function
   * - `this.cachePath(name)`: Same as `cachePath()` inside the `run()` function.
   *   You can use it to read or copy the file or folder stored at the path in
   *   the cache. It is important that you do not modify the file or folder
   *   because it has to be there exactly the same the next time the
   *   `CachedBuildFunction` is called with the same input.
   * @static
   * @method after
   * @return {Promise}
   */
  // static after () { return this.value }

  /**
   * The `cacheKey` static method selects the arguments that determine the
   * cache key. The cache key will be created by serializing the return value
   * to JSON and then hashing it. You should override this function if:
   * - you have parameters that cannot be serialized to JSON and you want to
   *   transform them into something that can.
   * - you have parameters that do not influence the behavior of the `run()`
   *   function, e.g. a parameter that is only used in the `after()` function.
   * @static
   * @method cacheKey
   * @return {*}
   */
  // static cacheKey (...args) { return args }

  /**
   * The static `outputConsistency` property is intended for advanced users
   * only. Normally the output value is always deserialized from JSON to make
   * the output look like it comes from the cache whether or not it actually
   * did. Setting this property to `false` disables this deserialization which
   * is not striclty necessary for output values that were just created by
   * executing `run()`. You should either always leave this option set to
   * `true` or at least during development. The performance gain is relatively
   *  minimal if you're using your `CachedBuildFunction` to perform
   * appropriately expensive operations because deserialization from JSON is
   * cheap compared to operations like hashing large files, resizing images,
   * reading excel files etc. If you set this property to `false`, you can run
   * into problems where your output looks different depending on whether it
   * came from the cache. To prevent bugs in your code, it is recommended to
   * leave it to `true`.
   * @default true
   * @return {boolean}
   */
  static get outputConsistency () { return true }

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

  _run (args, blockRun) {
    // Hash the input
    const cacheKeyFn = this.constructor.cacheKey
    let hashInput = cacheKeyFn ? cacheKeyFn(...args) : args
    if (typeof hashInput !== 'string') { hashInput = JSON.stringify(hashInput) }
    let version = this.constructor.version
    if (typeof version === 'function') { version = version() }
    if (typeof version !== 'string' && typeof version !== 'number') {
      throw new Error('CachedBuildFunction.version must be a string or number')
    }
    const cacheKey = sha1(LIBRARY_VERSION + ',' + version + ',' + hashInput)
    this._usedCacheKeys.add(cacheKey)

    // Return existing promise if an operation with the same input is
    // already in progress to avoid unnecessary work
    const currentlyRunningPromise = this._currentlyRunningMap.get(cacheKey)
    if (currentlyRunningPromise) { return currentlyRunningPromise }

    const eventEmitter = new EventEmitter()

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

      const cacheHit = !!result
      eventEmitter.emit('checkedCache', { cacheHit })
      eventEmitter.emit(cacheHit ? 'cacheHit' : 'cacheMiss')

      if (blockRun) { await blockRun } // For queue mode

      if (result) { // Cache hit
        const afterFn = this.constructor.after
        if (result.state === 'fulfilled' && afterFn) {
          result = await callAfterFn(afterFn, args, path, result.value)
        }

        this._currentlyRunningMap.delete(cacheKey)
        return result.state === 'fulfilled' ? result.value
                                            : Promise.reject(result.reason)
      }

      result = await callRunFn(this.constructor.run, args, path) // run()

      // Write to cache
      const text = serializeResult(result)
      const wroteToCache = new Promise ((resolve, reject) => {
        writeFileAtomic(path + '.json', text, (err) => {
          if (err) { reject(err) } else { resolve(err) }
        })
      })

      if (this.constructor.outputConsistency) {
        result = deserializeResult(text)
      }

      const afterFn = this.constructor.after
      if (result.state === 'fulfilled' && afterFn) {
        result = await callAfterFn(afterFn, args, path, result.value)
      }

      await wroteToCache // Ran in the background

      this._currentlyRunningMap.delete(cacheKey)
      return result.state === 'fulfilled' ? result.value
                                          : Promise.reject(result.reason)
    })()

    this._currentlyRunningMap.set(cacheKey, promise)

    return Object.assign(promise, {
      eventEmitter,
      on(...args) { eventEmitter.on(...args); return this }
    })
  }

  /**
   * This function lets you enqueue a function call. Only the cache check
   * will be performed immediately asynchronously, the call to `run()` (if
   * needed) is delayed until you call `flush()`.
   *
   * @param {*} args
   * @return {Promise} Same promise as if you call the `CachedBuildFunction`
   */
  enqueue (...args) {
    let continueRunning
    const blockRun = new Promise(x => { continueRunning = x })

    let setCacheCheckResult
    const checkedCache = new Promise(x => { setCacheCheckResult = x })

    const promise = this._run(args, blockRun)
      .on('checkedCache', ({ cacheHit }) => { setCacheCheckResult(cacheHit) })

    this._queue.push({ promise, checkedCache, continueRunning })

    return promise
  }

  /**
   * This function lets you flush the queue.
   *
   * @param {object} options
   * @param {boolean} options.promise Defines what kind of promise should
   * be returned:
   * <ul>
   * <li>
   *   `'all'` (Default): The retruned promise resolves to an array containing
   *   the result values. If an error occurs, the promise rejects with the first
   *   error as soon as it happens.
   * </li>
   * <li>
   *   `'allSettled'`: The returned promise resolves once all operations have
   *   completed (instead of rejecting immediately after the first error).
   *   It resolves to an array of objects of either the form
   *   `{ value, state: 'fulfilled' }` or `{ reason, state: 'rejected' }`.
   *   Note, it will always resolve (even if errors happen).
   * </li>
   * <li>
   *   `false`: Return no promise at all. Instead return a plain object with
   *   the extra properties `on` and `eventEmitter`. Use this if you're already
   *   handling the promise returned by `enqueue()`.
   * </li>
   * <ul>
   * @return {Promise} Promise with some extra properties:
   * - `eventEmitter` EventEmitter that fires the following event:
   *   - `'checkedCache'`: Fired after the cache checks have completed. Its
   *     data is an object with the properties:
   *     - `count`: Total number of items
   *     - `cacheHitCount`: Number of items that had a cache hit
   *     - `cacheMissCount`: Number of items that had a cache miss
   * - `on()`: Calls `eventEmitter.on()` and is chainable. This means you can do
   *   this:
   *   ```javascript
   *   await myFn.flush()
   *     .on('checkedCache', ({ cacheHitCount, cacheMissCount }) => {
   *        console.log(`Found ${cacheHitCount} items in the cache, ` +
   *                    `need to compute ${cacheHitCount} items`)
   *     })
   *   ```
   */
  flush (options) {
    const { promise: promiseType = 'all' } = options || {}
    const queue = this._queue
    this._queue = []

    const eventEmitter = new EventEmitter()

    Promise.all(queue.map(item => item.checkedCache))
      .then(cacheResults => {
        const count = queue.length
        const cacheHitCount = cacheResults.filter(x => x).length
        const cacheMissCount = count - cacheHitCount
        const eventData = { count, cacheHitCount, cacheMissCount }
        eventEmitter.emit('checkedCache', eventData)
        for (let item of queue) { item.continueRunning() }
      })

    let promise = {}
    switch (promiseType) {
      case 'all':
        promise = Promise.all(queue.map(item => item.promise))
        break
      case 'allSettled':
        promise = Promise.all(queue.map(item => item.promise.then(
          value => { return { value, state: 'fulfilled' } },
          reason => { return { reason, state: 'rejected' } }
        )))
        break
    }

    return Object.assign(promise, {
      eventEmitter,
      on(...args) { eventEmitter.on(...args); return this }
    })
  }

  /**
   * Number of queued operations
   * @return {number}
   */
  get queuedCount () { return this._queue.length }

  /**
   * Clears the queue
   */
  clearQueue () { this._queue = [] }

  /**
   * The `CachedBuildFunction` internally keeps track of which cache entries
   * have been accessed since it was created. The `cleanUnused()` function
   * removes any cache entries on disk that haven't been accessed.
   * @return {Promise}
   */
  async cleanUnused () {
    await Promise.all((await readdir(this._cachePath)).map(entry => {
      if (!this._usedCacheKeys.has(entry.split(/\.|-/, 1)[0])) {
        return remove(join(this._cachePath, entry))
      }
    }))
  }
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
    observe (path) {
      const promise = fileFingerprint(path)
        .then(fingerprint => { return { path, fingerprint } })
        .catch(() => {}) // Doesn't exist? Fine
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

  const observedFiles = (await Promise.all(observedFilePromises)).filter(x => x)

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

export default CachedBuildFunction
