import { type RefObject, useLayoutEffect, useRef, useState } from 'react'

/** 0 lists Controls and Assists, 1 folds Assists into a button, 2 folds Controls too. */
export type Fold = 0 | 1 | 2

/**
 * How far the rail folds so it never scrolls, from its real content: `rail` is the column and `body` the
 * part that folds, ending in the group pinned by an auto top margin, which is the slack. Each fold's
 * saving is learnt as it happens, so a rail that grows back unfolds only into room it has.
 */
export function useRailFold(rail: RefObject<HTMLElement | null>, body: RefObject<HTMLElement | null>, active: boolean): Fold {
  const [fold, setFold] = useState<Fold>(0)
  const saving = useRef<Partial<Record<Fold, number>>>({})
  const last = useRef<{ fold: Fold; natural: number } | null>(null)

  useLayoutEffect(() => {
    const column = rail.current
    const folding = body.current
    if (!active || !column || !folding) return
    const measure = () => {
      const foot = folding.lastElementChild
      const slack = foot ? parseFloat(getComputedStyle(foot).marginTop) || 0 : 0
      const natural = column.scrollHeight - slack
      const prev = last.current
      if (prev?.fold === fold - 1) saving.current[fold] = prev.natural - natural
      else if (prev?.fold === fold + 1) saving.current[(fold + 1) as Fold] = natural - prev.natural
      last.current = { fold, natural }
      const room = column.clientHeight
      const back = saving.current[fold]
      if (natural > room + 0.5 && fold < 2) setFold((fold + 1) as Fold)
      else if (fold > 0 && back !== undefined && natural + back <= room) setFold((fold - 1) as Fold)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(column)
    for (const child of folding.children) observer.observe(child)
    return () => observer.disconnect()
  }, [rail, body, active, fold])

  return fold
}
