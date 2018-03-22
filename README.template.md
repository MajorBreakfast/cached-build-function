<a href="https://www.npmjs.com/package/cached-build-function">
  <img alt="npm version" src="https://badge.fury.io/js/cached-build-function.svg">
</a>

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

```javascript
const { readFile } = require('fs-extra')
const CachedBuildFunction = require('cached-build-function')

class ProcessFile extends CachedBuildFunction {
  static get version () { return 1 }

  static async run (srcPath) {
   const srcBuffer = await readFile(this.observe(srcPath))
   return someExpensiveOperation(srcBuffer.toString())
  }
}
```

To use it, create an instance and call it like a function:

*Note: Yes, instances of JavaScript classes can be functions :)*

```javascript
const processFile = new ProcessFile({ cachePath: 'path/to/my/cache') })

await processFile('data1.json') // Cheap if files havn't changed
await processFile('data2.json')

await myResize.cleanUnused() // Removes unused cache entries
```

Here are some more complex examples:
- [Excel file reading example](https://github.com/MajorBreakfast/cached-build-function/blob/master/example/excel-file-reading): Short and easy to understand example
- [Image resizing example](https://github.com/MajorBreakfast/cached-build-function/blob/master/example/image-resizing): Uses `cacheKey()`, `after()`, cache files and "queue mode"

## API

{{api-docs}}
