/** Where a track picks up: the Lesson and step the player last reached, kept in localStorage. */
import type { Track } from './tracks.ts'

export interface ResumeAt {
  lesson: number
  step: number
}

const START: ResumeAt = { lesson: 0, step: 0 }

export function loadResume(track: Track): ResumeAt {
  try {
    const { lesson, step } = JSON.parse(localStorage.getItem(track.resumeKey) ?? 'null') as Partial<ResumeAt>
    const steps = typeof lesson === 'number' ? track.lessons[lesson]?.steps.length : undefined
    if (steps === undefined || typeof step !== 'number' || !Number.isInteger(step) || step < 0 || step >= steps) return START
    return { lesson: lesson!, step }
  } catch {
    return START
  }
}

/** `null` forgets the place, so the next visit starts from Lesson 1. */
export function saveResume(track: Track, at: ResumeAt | null): void {
  try {
    if (at === null) localStorage.removeItem(track.resumeKey)
    else localStorage.setItem(track.resumeKey, JSON.stringify(at))
  } catch {}
}
