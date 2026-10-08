/** Where "How to play" picks up: the Lesson and step the player last reached, kept in localStorage. */
import { LESSONS } from './lessons.ts'

const KEY = 'pixel-imperium:lesson'

export interface ResumeAt {
  lesson: number
  step: number
}

const START: ResumeAt = { lesson: 0, step: 0 }

export function loadResume(): ResumeAt {
  try {
    const { lesson, step } = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ResumeAt>
    const steps = typeof lesson === 'number' ? LESSONS[lesson]?.steps.length : undefined
    if (steps === undefined || typeof step !== 'number' || !Number.isInteger(step) || step < 0 || step >= steps) return START
    return { lesson: lesson!, step }
  } catch {
    return START
  }
}

/** `null` forgets the place, so the next visit starts from Lesson 1. */
export function saveResume(at: ResumeAt | null): void {
  try {
    if (at === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(at))
  } catch {}
}
