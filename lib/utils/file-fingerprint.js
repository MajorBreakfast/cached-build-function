import { stat } from 'fs-extra'

export default async function fileFingerprint (path) {
  const stats = await stat(path)
  return stats.size + ',' + stats.mtimeMs + ',' + stats.birthtimeMs
}

