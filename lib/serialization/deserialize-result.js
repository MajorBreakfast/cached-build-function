export default function deserializeResult (text) {
  const result = JSON.parse(text)

  // Restore reason
  if (result.reason) {
    if (result.reason.isError) {
      result.reason =
        Object.assign(new Error(), { stack: undefined }, result.reason.data)
    } else {
      result.reason = result.reason.data
    }
  }

  return result
}
