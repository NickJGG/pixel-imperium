/** The guided sequences that run on `LessonPage`: the basics Tutorial and the Techniques after it. */
import { LESSONS, type Lesson } from './lessons.ts'
import { TECHNIQUES } from './techniques.ts'

export interface Track {
  id: 'tutorial' | 'techniques'
  label: string
  /** Its section on Learn. */
  name: string
  blurb: string
  /** Its paper, as `paperStyle`'s index: Learn's column and its Lessons' screen. */
  paper: number
  lessons: readonly Lesson[]
  /** localStorage key for the place to resume from, as `ResumeAt`. */
  resumeKey: string
  doneDymo: string
  skipText: string
}

export const TRACKS: Record<Track['id'], Track> = {
  tutorial: {
    id: 'tutorial',
    label: 'How to play',
    name: 'Basics',
    blurb: 'How to read clues, rule cells out and find overlaps. About two minutes.',
    paper: 0,
    lessons: LESSONS,
    resumeKey: 'pixel-imperium:tutorial-at',
    doneDymo: 'Tutorial complete',
    skipText: 'Skip tutorial',
  },
  techniques: {
    id: 'techniques',
    label: 'Advanced techniques',
    name: 'Techniques',
    blurb: 'Edges, joins, telling blocks apart and what-ifs, for the bigger pictures.',
    paper: 1,
    lessons: TECHNIQUES,
    resumeKey: 'pixel-imperium:techniques-at',
    doneDymo: 'Techniques complete',
    skipText: 'Skip techniques',
  },
}

/** The key a finished Lesson is recorded under, here and on the server. */
export const lessonKey = (track: Track, lesson: Lesson): string => `${track.id}:${lesson.id}`

export const trackOf = (id: string): Track | undefined => (Object.hasOwn(TRACKS, id) ? TRACKS[id as Track['id']] : undefined)

/** Some Lesson of `track` is in `done`. */
export const startedTrack = (track: Track, done: ReadonlySet<string>): boolean =>
  track.lessons.some(l => done.has(lessonKey(track, l)))

/** The first Lesson not in `done`, or `undefined` once the whole track is. */
export const firstUnfinished = (track: Track, done: ReadonlySet<string>): Lesson | undefined =>
  track.lessons.find(l => !done.has(lessonKey(track, l)))
