import jsdoc2md from 'jsdoc-to-markdown'
import { readFile, writeFile } from 'fs-extra'
import { join } from 'path'

;(async function () {
  let apiDocs = await jsdoc2md.render({
    files: 'lib/*.js'
  })
  apiDocs = apiDocs.replace('## cached-build-function', '')

  let template = await readFile(join(__dirname, '../README.template.md'))
  template = template.toString()
  template = template.replace('{{api-docs}}', apiDocs)
  await writeFile(join(__dirname, '../README.md'), template)
  console.log('Done')
})()
