import { type CheckRequest, check } from './checks.ts'

addEventListener('message', (e: MessageEvent<CheckRequest>) => {
  const { seq, width, height, filled } = e.data
  postMessage({ seq, checks: check(width, height, filled) })
})
