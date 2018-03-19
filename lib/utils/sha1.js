import { createHash } from 'crypto'

export default function sha1 (input) {
  const generator = createHash('sha1')
  generator.update(input)
  return generator.digest('hex')
}
