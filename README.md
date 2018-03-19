# cached-build-function
Are your build scripts slow? The `cached-build-function` package can help.
It makes it easy to write build functions that use a cache folder on the
file system to only recompute their output in case their input has changed.

How it works:
- Results (values or errors) are stored as JSON in the cache folder
- Function arguments are used as cache keys (i.e. their hashed JSON value)
- Cache entries can be defined to be valid only as long as certain files haven't
  changed
- Files and folders can also be stored inside the cache
- Cleanup mechanism to remove old cache entries
- Queue mode: Schedule multiple function calls and execute them in one go to
  see how many calls have a cache hit in advance.

You can create your `CachedBuildFunction` by inheriting from the class:

```JS
const { readFile } = require('fs-extra')
const CachedBuildFunction = require('cached-build-function')

class ProcessFile extends CachedBuildFunction {
  static get version () { return 1 }

  static async run (srcPath) {
   const srcBuffer = await readFile(this.observeFile(srcPath))
   return someExpensiveOperation(srcBuffer.toString())
  }
}
```

To use it, create an instance and call it like a function:

*Note: Yes, instances of JavaScript classes can be functions :)*

```JS
const processFile = new ProcessFile({ cachePath: 'path/to/my/cache') })

await processFile('data1.json') // Cheap if files havn't changed
await processFile('data2.json')

await myResize.cleanUnused() // Removes unused cache entries
```

Here are some more complex examples:
- Excel file reading example
- Image resizing example

## API

<a name="module_cached-build-function"></a>



* [cached-build-function](#module_cached-build-function)
    * [CachedBuildFunction](#exp_module_cached-build-function--CachedBuildFunction) ⏏
        * [new CachedBuildFunction(options)](#new_module_cached-build-function--CachedBuildFunction_new)
        * _instance_
            * [.enqueue(...args)](#module_cached-build-function--CachedBuildFunction+enqueue)
            * [.flush()](#module_cached-build-function--CachedBuildFunction+flush) ⇒ <code>object</code>
            * [.cleanUnused()](#module_cached-build-function--CachedBuildFunction+cleanUnused)
        * _static_
            * *[.version](#module_cached-build-function--CachedBuildFunction.version)*
            * [.outputConsistency](#module_cached-build-function--CachedBuildFunction.outputConsistency)
            * *[.run()](#module_cached-build-function--CachedBuildFunction.run)*
            * [.after()](#module_cached-build-function--CachedBuildFunction.after)
            * [.hashInput()](#module_cached-build-function--CachedBuildFunction.hashInput)

<a name="exp_module_cached-build-function--CachedBuildFunction"></a>

### CachedBuildFunction ⏏
The `CachedBuildFunction` class is abstract. To use it, you need to create
a subclass and implement the static properties `version` and `run`.

```JS
class MyBuildFn extends CachedBuildFunction {
  static get version () { return 123 }
  static async run (...) { ... }
}
```

Next, you can create an instance with the `new` operator and because
instances are functions you can call it.

```JS
const myBuildFn = new MyBuildFn({ cachePath: '...' })
const output = await myBuildFn(arg1, arg2, ...)
```

`CachedBuildFunction` instances are asynchronouse functions. This means that
they return a promise. The promise settles after the result could either be
fetched from the cache or has been calculated by the `run()` function.

For consistency, the `value` or `reason` to which the promise settles
always looks like it comes from the cache, i.e. values are deserialized from
JSON even they were just created by the `run()` function.

Additionally, the returned promise is a bit special because it has a
chainable function tacked onto it which can optionally be used to gain
insight about whether or not a cache hit occured:
- `onCheckedCache((cacheHit) => {})`: `cacheHit` is `true ` if
  there exists an up-to-date value in the cache

```JS
const output = await myBuildFn()
  .onCheckedCache((hit) => { if (hit) { console.log('Wohoo! Cache hit') } })
```

**Kind**: Exported class  
<a name="new_module_cached-build-function--CachedBuildFunction_new"></a>

#### new CachedBuildFunction(options)

| Param | Type | Description |
| --- | --- | --- |
| options | <code>object</code> |  |
| options.cachePath | <code>boolean</code> | The path to the folder you intend to use for the cache. The `CachedBuildFunction` will create the folder if it does not already exist (and if necessary also its anchestors). The function expects the cache folder to only contain files it created. You should also refrain from modifying any of the cache files. You may, however, delete the folder or any of the files within it while the function is not running. |

<a name="module_cached-build-function--CachedBuildFunction+enqueue"></a>

#### cachedBuildFunction.enqueue(...args)
This function lets you enqueue a function call. Only the cache check
will be performed immediately asynchronously, the call to `run()` (if
needed) is delayed until you call `flush()`.

**Kind**: instance method of [<code>CachedBuildFunction</code>](#exp_module_cached-build-function--CachedBuildFunction)  

| Param | Type |
| --- | --- |
| ...args | <code>\*</code> | 

<a name="module_cached-build-function--CachedBuildFunction+flush"></a>

#### cachedBuildFunction.flush() ⇒ <code>object</code>
This function lets you flush the queue.

**Kind**: instance method of [<code>CachedBuildFunction</code>](#exp_module_cached-build-function--CachedBuildFunction)  
**Returns**: <code>object</code> - Object with the following properties:
- `count`: The number of items in the queue
- `checkedCache`: A promise that resolves to a `{ cacheHits, total }`
  object once all cache checks have been performed.
- `all`: A promise that resolves to an array of the output values. If
  an error is encountered the promise will be rejected with that error.
  It does not wait for all functions to complete their execution in that
  case.
- `allSettled`: A promise that settles once all function calls have
  completed their execution. Each array item has either the form
  `{ value, state: 'fulfilled' }` or `{ reason, state: 'rejected' }`.  
<a name="module_cached-build-function--CachedBuildFunction+cleanUnused"></a>

#### cachedBuildFunction.cleanUnused()
The `CachedBuildFunction` internally keeps track of which cache entries
have been accessed since it was created. The `cleanUnused()` function
removes any cache entries on disk that haven't been accessed.

**Kind**: instance method of [<code>CachedBuildFunction</code>](#exp_module_cached-build-function--CachedBuildFunction)  
<a name="module_cached-build-function--CachedBuildFunction.version"></a>

#### *CachedBuildFunction.version*
The static `version` property returns an integer or string that reflects
the current version of your `run()` function. You should change this
property whenever you make behavioral changes to the function. This ensures
that previously created cache entries, which are now outdated, are not used
to produce the output. You can set the `version` to `Math.random()` if you
want to temporarily disable caching during development.

**Kind**: static abstract property of [<code>CachedBuildFunction</code>](#exp_module_cached-build-function--CachedBuildFunction)  
<a name="module_cached-build-function--CachedBuildFunction.outputConsistency"></a>

#### CachedBuildFunction.outputConsistency
The static `outputConsistency` property is intended for advanced users
only. Normally the output value is always deserialized from JSON to make
the output look like it comes from the cache whether or not it actually
did. Setting this property to `false` disables this deserialization which
is not striclty necessary for output values that were just created by
executing `run()`. You should either always leave this option set to
`true` or at least during development. The performance gain is relatively
 minimal if you're using your `CachedBuildFunction` to perform
appropriately expensive operations because deserialization from JSON is
cheap compared to operations like hashing large files, resizing images,
reading excel files etc. If you set this property to `false`, you can run
into problems where your output looks different depending on whether it
came from the cache. To prevent bugs in your code, it is recommended to
leave it to `true`.

**Kind**: static property of [<code>CachedBuildFunction</code>](#exp_module_cached-build-function--CachedBuildFunction)  
**Default**: <code>true</code>  
<a name="module_cached-build-function--CachedBuildFunction.run"></a>

#### *CachedBuildFunction.run()*
The static `run()` method is used to produce the output whenever
no valid cache entry can be found. It is called with the arguments that
the `CachedBuildFunction` was called with. The return value of this
function must be serializable (and deserializable) to (and from) JSON
because it is written to the cache on disk. If the function throws an error
during execution, the error will also be serialized and cached. The
`this` inside the function is special and has the following methods:
- `this.observeFile(path)`: You should call this function on any file paths
  that you're reading from. This ensures that the cached output is only
  valid as long as none of the observed files have changed. Changes will be
  detected by comparing the creation and modification timestamps and the
  file size. For convenience, `observeFile()` returns its input.
- `this.cachePath(name)`: Returns a path inside the cache folder. You can
  use this path to create a file or folder that you want to cache. Later
  inside the `after()` function, you can access the stored file or folder.
  The `name` parameter has to be a string that is valid inside file names.
  The returned path has the form
  `` `${cacheFolder}/${cacheKey}-${name}` ``.

**Kind**: static abstract method of [<code>CachedBuildFunction</code>](#exp_module_cached-build-function--CachedBuildFunction)  
<a name="module_cached-build-function--CachedBuildFunction.after"></a>

#### CachedBuildFunction.after()
The static `after()` method can be used to transform the output produced
by `run()` (given that no error occured). Just like `run()`, it is called
with the arguments that the `CachedBuildFunction` was called with. Its
return value becomes the return value of the `CachedBuildFunction`.
This means that you can use it to transform the output which had to be
stored as JSON when it was cached into something else. Or, you can use it
to copy files from the cache to their final destinations. The `this`
inside the function has the following properties and methods:
- `this.value`: The value from the cache produced by the `run()` function
- `this.cachePath(name)`: Same as `cachePath()` inside the `run()` function.
  You can use it to read or copy the file or folder stored at the path in
  the cache. It is important that you do not modify the file or folder
  because it has to be there exactly the same the next time the
  `CachedBuildFunction` is called with the same input.

**Kind**: static method of [<code>CachedBuildFunction</code>](#exp_module_cached-build-function--CachedBuildFunction)  
<a name="module_cached-build-function--CachedBuildFunction.hashInput"></a>

#### CachedBuildFunction.hashInput()
The `hashInput` static method selects the arguments that determine the
cache key. The cache key will be created by serializing the return value
to JSON and then hashing it. You should override this function if:
- you have parameters that cannot be serialized to JSON and you want to
  transform them into something that can.
- you have parameters that do not influence the behavior of the `run()`
  function, e.g. a parameter that is only used in the `after()` function.

**Kind**: static method of [<code>CachedBuildFunction</code>](#exp_module_cached-build-function--CachedBuildFunction)  

