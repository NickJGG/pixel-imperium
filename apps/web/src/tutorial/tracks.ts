/** The guided sequences that run on `LessonPage`: the basics Tutorial and the Techniques after it. */
import { LESSONS, type Lesson } from './lessons.ts'
import { TECHNIQUES } from './techniques.ts'

export interface Track {
  id: 'tutorial' | 'techniques'
  path: '/learn' | '/learn/techniques'
  label: string
  lessons: readonly Lesson[]
  /** localStorage key for the place to resume from. */
  resumeKey: string
  doneDymo: string
  skipText: string
}

export const TRACKS: Record<Track['id'], Track> = {
  tutorial: {
    id: 'tutorial',
    path: '/learn',
    label: 'How to play',
    lessons: LESSONS,
    resumeKey: 'pixel-imperium:lesson',
    doneDymo: 'Tutorial complete',
    skipText: 'Skip tutorial',
  },
  techniques: {
    id: 'techniques',
    path: '/learn/techniques',
    label: 'Advanced techniques',
    lessons: TECHNIQUES,
    resumeKey: 'pixel-imperium:techniques',
    doneDymo: 'Techniques complete',
    skipText: 'Skip techniques',
  },
}
