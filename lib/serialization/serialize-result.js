import serializeError from 'serialize-error'

export default function serializeResult (result) {
  const { value, state, observedFiles } = result

  // Store reason
  let reason
  if (result.reason) {
    if (result.reason instanceof Error) {
      reason = { isError: true, data: serializeError(result.reason) }
    } else {
      reason = { isError: false, data: result.reason }
    }
  }

  // Write cache file
  return JSON.stringify({ value, reason, state, observedFiles })
}
