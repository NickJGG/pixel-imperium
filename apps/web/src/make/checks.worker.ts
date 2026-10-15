import { check } from '@pixel-imperium/nonogram'

interface CheckRequest {
  seq: number
  width: number
  height: number
  filled: boolean[]
}

addEventListener('message', (e: MessageEvent<CheckRequest>) => {
  const { seq, width, height, filled } = e.data
  postMessage({ seq, checks: check(width, height, filled) })
})
