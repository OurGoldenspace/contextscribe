import xss from 'xss'

export function sanitizeInput(input: string): string {
  return xss(input, {
    whiteList: {},
    stripIgnoredTag: true
  })
}