import jsdoc2md from 'jsdoc-to-markdown'
import { writeFile } from 'fs-extra'
import { join } from 'path'

;(async function () {
  const text = await jsdoc2md.render({
    files: 'lib/*.js'
  })
  await writeFile(join(__dirname, '../README.md'), text)
  console.log('Done')
})()
