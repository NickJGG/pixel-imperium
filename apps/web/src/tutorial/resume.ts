/** Where a track picks up: the Lesson and step the player last reached, kept in localStorage. */
import type { Track } from './tracks.ts'

export interface ResumeAt {
  /** The Lesson's id. */
  lesson: string
  step: number
}

/** `null` when nothing valid is saved. */
export function loadResume(track: Track): ResumeAt | null {
  try {
    const { lesson, step } = JSON.parse(localStorage.getItem(track.resumeKey) ?? 'null') as Partial<ResumeAt>
    const steps = track.lessons.find(l => l.id === lesson)?.steps.length
    if (steps === undefined || typeof step !== 'number' || !Number.isInteger(step) || step < 0 || step >= steps) return null
    return { lesson: lesson!, step }
  } catch {
    return null
  }
}

/** `null` forgets the place, so the next visit starts from Lesson 1. */
export function saveResume(track: Track, at: ResumeAt | null): void {
  try {
    if (at === null) localStorage.removeItem(track.resumeKey)
    else localStorage.setItem(track.resumeKey, JSON.stringify(at))
  } catch {}
}
