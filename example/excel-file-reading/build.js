import CachedBuildFunction from 'cached-build-function'
import { readFile } from 'fs-extra'
import XLSX from 'xlsx'

class ReadExcelFile extends CachedBuildFunction {
  static get version () { return 1 }

  static async run (srcFile) {
    const workbook = XLSX.read(await readFile(this.observeFile(srcFile)))
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    return XLSX.utils.sheet_to_json(worksheet)
  }
}

;(async function () {
  console.log('Started reading Excel file')

  const readExcelFile = new ReadExcelFile({ cachePath: 'cache/read-xlsx' })

  // Read Excel file
  const content = await readExcelFile('excel-file.xlsx')
    .on('cacheHit', () => { console.log('Used cache') })

  // Cache cleanup
  await readExcelFile.cleanUnused()

  console.log('Finished reading Excel file')
  console.log(content)
})().catch(error => {
  console.error(error.stack)
  process.exit(1)
})
