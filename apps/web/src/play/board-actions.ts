/** Board actions shared by the keyboard and the controller; both keep the cursor in view. */
import type { PlayStore, Tool } from './store.ts'
import type { BoardView } from './viewport.ts'

export function move(store: PlayStore, view: BoardView, dRow: number, dCol: number): void {
  store.moveCursor(dRow, dCol)
  view.follow(store.getState().cursor)
}

export function startStroke(store: PlayStore, view: BoardView, tool: Tool, lockAxis: boolean): void {
  const { cursor } = store.getState()
  store.beginStroke(cursor, tool, { lockAxis })
  view.follow(cursor)
}
