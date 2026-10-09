import { type Clues, cluesFromSolution } from '@pixel-imperium/nonogram'

/** `[row, col]`, zero-based. */
export type CellRef = readonly [number, number]

export interface Placed {
  filled?: CellRef[]
  marked?: CellRef[]
}

/** One line of the grid, zero-based. */
export type LineRef = { row: number; col?: never } | { col: number; row?: never }

/** A drawing on the board. Positions run along the line, zero-based and inclusive. */
export type Draw =
  /** A block of `len` from `at[0]`, sliding to `at[1]` when they differ; `bad` when it doesn't fit. */
  | { ghost: LineRef & { at: readonly [number, number]; len: number; tone?: 'blue' | 'bad' } }
  /** The cells a sliding block covers either way. */
  | { both: LineRef & { from: number; to: number } }
  /** A measured span. */
  | { bracket: LineRef & { from: number; to: number; label: string; tone?: 'bad' } }

/**
 * One thing the coach says. Every beat but a step's last is talk, passed with Next; the last is the
 * step's action, passed when its target is met.
 */
export interface Beat {
  /** With `**bold**`, `_italic_` and `` `key` `` spans. */
  text: string
  draw?: Draw[]
  /** About the whole board, not a line. */
  whole?: true
  /** A control below the board to point at. */
  anchor?: 'assists' | 'hint'
}

export interface LessonStep {
  beats: Beat[]
  /** Lines whose clues and cells are outlined. */
  highlight: { rows?: number[]; cols?: number[] }
  /** Cells that must be right for the step to pass, or the whole picture. */
  target: Placed | 'solved'
}

/**
 * A guided puzzle. `rows` is the picture in the campaign seed format (`.` empty, anything else a
 * `palette` key). A `free` lesson runs on the player's own assists and has a Hint.
 */
export interface Lesson {
  /** A slug, unique within its track, for URLs and completion keys. */
  id: string
  title: string
  picture: string
  palette: Record<string, string>
  rows: string[]
  /** Cells already placed when the grid opens, as ordinary cells the player can clear. */
  given?: Placed
  steps: LessonStep[]
  /** Shown once the picture is revealed. */
  done: string
  free?: boolean
}

export const row = (r: number, cols: number[]): CellRef[] => cols.map(c => [r, c])
export const col = (c: number, rows: number[]): CellRef[] => rows.map(r => [r, c])
const ALL = [0, 1, 2, 3, 4]

export const LESSONS: readonly Lesson[] = [
  {
    id: 'reading-clues',
    title: 'Reading clues',
    picture: 'Gate',
    palette: { t: '#8f8a80', w: '#efe3c8' },
    rows: ['ttttt', 'w...w', 'w...w', 'w...w', '.....'],
    steps: [
      {
        beats: [
          {
            text: 'Each number is a run of filled cells in that line. Row 1 says **5**, and the row is 5 cells wide, so **every cell is filled**. Fill them: `left-click`, or tap in Fill mode.',
          },
        ],
        highlight: { rows: [0] },
        target: { filled: row(0, ALL) },
      },
      {
        beats: [
          {
            text: 'Row 5 has a **0**: nothing in it is filled. Cross its cells out with `right-click`, or switch to ✕ Cross. Crosses are your notes: _this cell is definitely empty._',
          },
        ],
        highlight: { rows: [4] },
        target: { marked: row(4, ALL) },
      },
      {
        beats: [
          {
            text: 'Columns 1 and 5 say **4**. The bottom cell is crossed out, so there are exactly 4 cells left. Fill them all.',
          },
        ],
        highlight: { cols: [0, 4] },
        target: { filled: [...col(0, [1, 2, 3]), ...col(4, [1, 2, 3])] },
      },
    ],
    done: "Every clue is satisfied, so the puzzle is solved and its colours are revealed. That's the whole game. The next lessons are about working out cells when it isn't this obvious.",
  },
  {
    id: 'ruling-out',
    title: 'Ruling cells out',
    picture: 'Circlet',
    palette: { g: '#ffc92e', G: '#c78a00', p: '#ff4fa3', u: '#5b7cff' },
    rows: ['g.p.g', 'g.g.g', 'ggggg', 'Gu.uG', 'GGGGG'],
    steps: [
      {
        beats: [
          {
            text: "Row 1 says **1 1 1**: three blocks, and there must be at least one empty cell between each pair. 1+1+1 plus 2 gaps = **5**, exactly the width. There's only one way to fit it.",
          },
        ],
        highlight: { rows: [0] },
        target: { filled: row(0, [0, 2, 4]) },
      },
      {
        beats: [
          {
            text: 'The gaps must be empty. **Cross them out** (`right-click` or ✕ Cross). Crossed cells make the next deductions easier.',
          },
        ],
        highlight: { rows: [0] },
        target: { marked: row(0, [1, 3]) },
      },
      {
        beats: [
          {
            text: 'Row 4 says **2 2**: 2 + gap + 2 = 5. Another exact fit. Fill the blocks and cross out the gap.',
          },
        ],
        highlight: { rows: [3] },
        target: { filled: row(3, [0, 1, 3, 4]), marked: row(3, [2]) },
      },
      {
        beats: [
          {
            text: 'Rows 3 and 5 say **5**. You know what to do.',
          },
        ],
        highlight: { rows: [2, 4] },
        target: { filled: [...row(2, ALL), ...row(4, ALL)] },
      },
      {
        beats: [
          {
            text: 'Row 2 is another **1 1 1**. Finish the picture, and check that every column agrees.',
            whole: true,
          },
        ],
        highlight: {},
        target: 'solved',
      },
    ],
    done: "Whenever the blocks plus their gaps add up to the line's length, the line is fully determined. Look for these first in every puzzle.",
  },
  {
    id: 'overlap',
    title: 'Overlap',
    picture: 'Banner',
    palette: { k: '#5b3a1e', f: '#c8312b', s: '#8f8a80' },
    rows: ['kfff.', 'kfff.', 'k....', 'k....', 'sss..'],
    steps: [
      {
        beats: [
          {
            text: "Row 1 says **4** in 5 cells. You don't know where it starts, but slide it both ways: some cells are covered **either way**.",
          },
        ],
        highlight: { rows: [0] },
        target: { filled: row(0, [1, 2, 3]) },
      },
      {
        beats: [
          {
            text: 'Row 2 is the same: **4** in 5. Fill the overlap.',
          },
        ],
        highlight: { rows: [1] },
        target: { filled: row(1, [1, 2, 3]) },
      },
      {
        beats: [
          {
            text: 'Row 5 says **3**. Pushed left it covers 1–3, pushed right 3–5. Only the **middle** cell is certain.',
          },
        ],
        highlight: { rows: [4] },
        target: { filled: row(4, [2]) },
      },
      {
        beats: [
          {
            text: 'Column 5 has a **0**. Cross it out. Now the 4s in rows 1 and 2 have only one place left to go.',
          },
        ],
        highlight: { cols: [4] },
        target: { marked: col(4, ALL) },
      },
      {
        beats: [
          {
            text: 'Column 1 says **5**. From here you have everything you need. Finish the banner.',
            whole: true,
          },
        ],
        highlight: {},
        target: 'solved',
      },
    ],
    done: "Overlap is the workhorse: a long block in a short line always pins down its middle. You'll use it on almost every big puzzle.",
  },
  {
    id: 'putting-it-together',
    title: 'Putting it together',
    picture: 'Crown',
    palette: { g: '#ffc92e', G: '#c78a00', p: '#ff4fa3', u: '#5b7cff' },
    rows: [
      'g...gg...g',
      'g..gggg..g',
      'gg.gggg.gg',
      'gggggggggg',
      'gpggugggpg',
      'g.gg..gg.g',
      'gggggggggg',
      'GGGGGGGGGG',
      '.GGGGGGGG.',
      '..........',
    ],
    steps: [
      {
        beats: [
          {
            text: "Your turn, on a 10×10 like the end of the Marches. Use everything: full lines, exact fits, overlap and crosses. The **assists** under the board are now your own settings, so toggle them however you like. Stuck? Try **Hint**. In the Imperium a hint costs the puzzle its **Foil**. Here it's free.",
            whole: true,
          },
        ],
        highlight: {},
        target: 'solved',
      },
    ],
    done: "That's the crown, and the tutorial.",
    free: true,
  },
]

export interface LessonPuzzle {
  width: number
  height: number
  clues: Clues
  /** Row-major colours, `null` for empty cells, as a solve's reveal palette. */
  palette: (string | null)[]
}

export function lessonPuzzle({ rows, palette }: Lesson): LessonPuzzle {
  const colours = rows.flatMap(r => [...r].map(ch => (ch === '.' ? null : palette[ch]!)))
  const width = rows[0]!.length
  const height = rows.length
  return { width, height, clues: cluesFromSolution(width, height, colours.map(c => c !== null)), palette: colours }
}
