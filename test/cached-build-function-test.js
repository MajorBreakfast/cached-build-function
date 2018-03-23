import { join } from 'path'
import { remove } from 'fs-extra'
import test from 'ava'
import sinon from 'sinon'
import CachedBuildFunction from '../lib/cached-build-function'

test.before(async t => {
  await remove(join(__dirname, 'cache'))
})

test.after(async t => {
  await remove(join(__dirname, 'cache'))
})

test('executes run() only when necessary', async t => {
  const cachePath = join(__dirname, 'cache/test1')

  // Scenario 1/5 Create build function and run it
  const runSpy1 = sinon.spy()
  class MyBuildFn1 extends CachedBuildFunction {
    static get version () { return 1 }
    static async run (a, b) { runSpy1(a, b); return a + b }
  }
  const myBuildFn1 = new MyBuildFn1({ cachePath })

  t.true(await myBuildFn1(1, 2) === 3)
  t.true(await myBuildFn1(3, 4) === 7)
  t.true(await myBuildFn1(5, 20) === 25)

  t.true(runSpy1.calledWith(1, 2))
  t.true(runSpy1.calledWith(3, 4))
  t.true(runSpy1.calledWith(5, 20))
  t.true(runSpy1.callCount === 3)

  // Scenario 2/5 Run again: Same build function instance
  t.true(await myBuildFn1(1, 2) === 3)
  t.true(await myBuildFn1(3, 4) === 7)
  t.true(await myBuildFn1(5, 20) === 25)

  t.true(runSpy1.callCount === 3) // Still

  // Scenario 3/5 Run again: Same build function class, another instance
  const myBuildFn1b = new MyBuildFn1({ cachePath })

  t.true(await myBuildFn1b(1, 2) === 3)
  t.true(await myBuildFn1b(3, 4) === 7)
  t.true(await myBuildFn1b(5, 20) === 25)

  t.true(runSpy1.callCount === 3) // Still

  // Scenario 4/5 Run again: Same build function another class, another instance
  const runSpy2 = sinon.spy()
  class MyBuildFn2 extends CachedBuildFunction {
    static get version () { return 1 }
    static async run (a, b) { runSpy2(a, b); return a + b }
  }

  const myBuildFn2 = new MyBuildFn2({ cachePath })

  t.true(await myBuildFn2(1, 2) === 3)
  t.true(await myBuildFn2(3, 4) === 7)
  t.true(await myBuildFn2(5, 20) === 25)

  t.true(runSpy2.callCount === 0)

  // Scenario 5/5 Build function with a different version
  const runSpy3 = sinon.spy()
  class MyBuildFn3 extends CachedBuildFunction {
    static get version () { return 2 }
    static async run (a, b) { runSpy3(a, b); return a + b }
  }

  const myBuildFn3 = new MyBuildFn3({ cachePath })

  t.true(await myBuildFn3(1, 2) === 3)
  t.true(await myBuildFn3(3, 4) === 7)
  t.true(await myBuildFn3(5, 20) === 25)

  t.true(runSpy3.calledWith(1, 2))
  t.true(runSpy3.calledWith(3, 4))
  t.true(runSpy3.calledWith(5, 20))
  t.true(runSpy3.callCount === 3)
})

test('returns same promise for same input at the same time', async t => {
  const cachePath = join(__dirname, 'cache/test2')

  const runSpy = sinon.spy()
  class MyBuildFn extends CachedBuildFunction {
    static get version () { return 1 }
    static async run (a, b) { runSpy(a, b); return a + b }
  }
  const myBuildFn = new MyBuildFn({ cachePath })

  const promises = [myBuildFn(3, 4), myBuildFn(3, 4)]

  t.true(promises[0] === promises[1])

  const results = await Promise.all(promises)

  t.true(results[0] === 7)
  t.true(results[1] === 7)

  t.true(runSpy.callCount === 1)
})

test('returned promise has working EventEmitter', async t => {
  const cachePath = join(__dirname, 'cache/test3')

  class MyBuildFn extends CachedBuildFunction {
    static get version () { return 1 }
    static async run (a, b) { return a + b }
  }
  const myBuildFn = new MyBuildFn({ cachePath })

  const cacheHitSpy1 = sinon.spy()
  const cacheMissSpy1 = sinon.spy()
  const checkedCacheSpy1 = sinon.spy()

  const result1 = await myBuildFn(6, 5)
    .on('cacheHit', cacheHitSpy1)
    .on('cacheMiss', cacheMissSpy1)
    .on('checkedCache', checkedCacheSpy1)

  t.true(result1 === 11)
  t.false(cacheHitSpy1.called)
  t.true(cacheMissSpy1.calledOnce)
  t.true(checkedCacheSpy1.calledOnce)
  t.deepEqual(checkedCacheSpy1.getCall(0).args[0], { cacheHit: false })

  // Again
  const cacheHitSpy2 = sinon.spy()
  const cacheMissSpy2 = sinon.spy()
  const checkedCacheSpy2 = sinon.spy()

  const result2 = await myBuildFn(6, 5)
    .on('cacheHit', cacheHitSpy2)
    .on('cacheMiss', cacheMissSpy2)
    .on('checkedCache', checkedCacheSpy2)

  t.true(result2 === 11)
  t.true(cacheHitSpy2.calledOnce)
  t.false(cacheMissSpy2.called)
  t.true(checkedCacheSpy2.calledOnce)
  t.deepEqual(checkedCacheSpy2.getCall(0).args[0], { cacheHit: true })
})
