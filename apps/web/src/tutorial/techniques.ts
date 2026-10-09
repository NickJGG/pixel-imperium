/** The Techniques: line deductions past the Tutorial's basics, for the bigger grids of the campaign. */
import { type Lesson, type Placed, col, row } from './lessons.ts'

/** A partly worked grid, drawn a row per string: `#` filled, `x` crossed out, anything else open. */
function board(rows: string[]): Placed {
  const where = (ch: string) => rows.flatMap((cells, r) => [...cells].flatMap((c, k) => (c === ch ? [[r, k] as const] : [])))
  return { filled: where('#'), marked: where('x') }
}

export const TECHNIQUES: readonly Lesson[] = [
  {
    id: 'edges',
    title: 'Edges',
    picture: 'Spruce',
    palette: { g: '#2f6b34', h: '#5a9e4b', k: '#7a4f2a', s: '#e9eef0' },
    rows: [
      '....g.....',
      '...ggg....',
      '..ggggg...',
      '...ggg....',
      '.ggggggg..',
      '..ggggg...',
      'ggggggggg.',
      '....k...h.',
      '....k..hhh',
      'ssssssssss',
    ],
    given: board([
      'xxxx#xxxxx',
      '....#.....',
      '...###....',
      'xxx###xxxx',
      '...####...',
      '...###....',
      '.########.',
      '....#.....',
      '....#.....',
      '##########',
    ]),
    steps: [
      {
        beats: [
          {
            text: "Some of this grid is already worked out: everything the tutorial's tricks give. From here they've run dry, so it's time for new ones.",
            whole: true,
          },
          {
            text: 'Column 10 says **2**, and its bottom cell is filled. That cell touches the edge of the grid, so the 2 can only grow **up**.',
            draw: [{ ghost: { col: 9, at: [8, 8], len: 2, tone: 'blue' } }],
          },
          { text: 'Fill the cell above it, and cross out the rest of the column.' },
        ],
        highlight: { cols: [9] },
        target: { filled: [[8, 9]], marked: col(9, [1, 2, 4, 5, 6, 7]) },
      },
      {
        beats: [
          {
            text: 'A cross works just like the edge. Row 5 says **7**, and its last cell is now crossed out, so the 7 has **9 cells** to sit in.',
            draw: [{ bracket: { row: 4, from: 0, to: 8, label: '9 cells' } }],
          },
          {
            text: 'Pushed left it covers cells 1–7. Pushed right, 3–9. Cells 3–7 are covered either way.',
            draw: [{ ghost: { row: 4, at: [0, 2], len: 7 } }, { both: { row: 4, from: 2, to: 6 } }],
          },
          { text: 'Cell 3 is the only one of those still open. Fill it.' },
        ],
        highlight: { rows: [4] },
        target: { filled: [[4, 2]] },
      },
      {
        beats: [
          { text: "The ground is filled, so each column's **last** block sits against the bottom edge." },
          {
            text: 'In columns 1–4, 6 and 7 that last block is a **1**: the ground cell is the whole of it.',
            draw: [0, 1, 2, 3, 5, 6].map(c => ({ ghost: { col: c, at: [9, 9], len: 1, tone: 'blue' } }) as const),
          },
          { text: 'Cross out the cell above the ground in each of those columns.' },
        ],
        highlight: { cols: [0, 1, 2, 3, 5, 6] },
        target: { marked: row(8, [0, 1, 2, 3, 5, 6]) },
      },
      {
        beats: [
          {
            text: 'Row 9 says **1 3**. The trunk is the 1, and the crosses leave a gap of exactly **3** cells at the right.',
            draw: [{ bracket: { row: 8, from: 7, to: 9, label: '3 cells' } }],
          },
          { text: 'Only one place for the 3.', draw: [{ ghost: { row: 8, at: [7, 7], len: 3, tone: 'blue' } }] },
          { text: 'Fill the rest of the 3.' },
        ],
        highlight: { rows: [8] },
        target: { filled: row(8, [7, 8]) },
      },
      {
        beats: [
          {
            text: 'Column 9 says **4**. Rows 2 and 3 sit between two crosses: a gap of only **2**.',
            draw: [{ bracket: { col: 8, from: 1, to: 2, label: '2' } }],
          },
          {
            text: "The 4 doesn't fit in a gap of 2, so nothing can go there.",
            draw: [{ ghost: { col: 8, at: [1, 1], len: 4, tone: 'bad' } }, { bracket: { col: 8, from: 1, to: 2, label: 'too small', tone: 'bad' } }],
          },
          { text: 'Cross out rows 2 and 3.' },
        ],
        highlight: { cols: [8] },
        target: { marked: col(8, [1, 2]) },
      },
      {
        beats: [{ text: 'Edges, crosses and gaps that are too small. Use them to finish the spruce.', whole: true }],
        highlight: {},
        target: 'solved',
      },
    ],
    done: "A block can't cross the edge of the grid or a cross, so a filled cell near one tells you which way its block runs. When a line seems stuck, look at its ends and its crosses first.",
  },
  {
    id: 'joining-splitting',
    title: 'Joining and splitting',
    picture: 'Mushrooms',
    palette: { r: '#c8312b', w: '#f2ede0', c: '#e3d3b0', g: '#5a9e4b' },
    rows: [
      '..rrrr....',
      '.rwrrwr...',
      'rrrrrrrr..',
      'r.rwrr.r..',
      '...cc.....',
      '...cc.rrr.',
      '...cc.rwrr',
      '..cccc.cc.',
      '.gggggggcg',
      'gggggggggg',
    ],
    given: board([
      '...##.....',
      '...###....',
      '..######..',
      '..####....',
      'xxx##xxxxx',
      '...##..#..',
      '...##.##..',
      '..####.#..',
      '.########.',
      '##########',
    ]),
    steps: [
      {
        beats: [
          { text: 'Some of the grid is already worked out. Row 7 says **2 4**, and it has two filled pairs with one open cell between them.' },
          {
            text: 'Fill that cell and cells 4–8 become one run of **5**, longer than any block in the row.',
            draw: [{ ghost: { row: 6, at: [3, 3], len: 5, tone: 'bad' } }, { bracket: { row: 6, from: 3, to: 7, label: 'too long', tone: 'bad' } }],
          },
          { text: 'So the pairs are **different blocks**, and the cell between them is empty. Cross it out.' },
        ],
        highlight: { rows: [6] },
        target: { marked: [[6, 5]] },
      },
      {
        beats: [
          { text: 'The pair on the right is part of the **4**, and the new cross walls it in on the left.' },
          { text: 'It can only grow **right**.', draw: [{ ghost: { row: 6, at: [6, 6], len: 4, tone: 'blue' } }] },
          { text: 'Fill the last two cells of the row.' },
        ],
        highlight: { rows: [6] },
        target: { filled: row(6, [8, 9]) },
      },
      {
        beats: [
          {
            text: 'Column 9 says **5**, a single block. Rows 7 and 9 are both filled, so they belong to the same 5.',
            draw: [{ bracket: { col: 8, from: 6, to: 8, label: 'one block' } }],
          },
          { text: 'So does every cell **between** them. Fill row 8.' },
        ],
        highlight: { cols: [8] },
        target: { filled: [[7, 8]] },
      },
      {
        beats: [
          {
            text: 'Row 8 says **4 2**. Cells 3–6 are a run of 4, as long as the longest block.',
            draw: [{ ghost: { row: 7, at: [2, 2], len: 4, tone: 'blue' } }],
          },
          { text: "A run that long is finished: it can't grow at either end." },
          { text: 'Cap it with a cross on **each side**.' },
        ],
        highlight: { rows: [7] },
        target: { marked: row(7, [1, 6]) },
      },
      {
        beats: [{ text: 'Join what belongs together, split what would be too long, and cap what is finished. Finish the mushrooms.', whole: true }],
        highlight: {},
        target: 'solved',
      },
    ],
    done: "Two filled cells in a line are the same block when only one block can reach both, and different blocks when joining them would be too long. A run as long as the biggest clue is complete, so both its ends are empty.",
  },
  {
    id: 'which-block',
    title: 'Which block is which',
    picture: 'Buck',
    palette: { a: '#d9c7a1', b: '#8a5a33', e: '#6e4526', k: '#2e2a26', n: '#2e2a26' },
    rows: [
      'a..a..a..a',
      'a.a....a.a',
      '.aa....aa.',
      '..a....a..',
      '..aabbaa..',
      'ee.bbbb.ee',
      '..bkbbkb..',
      '...bbbb...',
      '....bb....',
      '....nn....',
    ],
    given: board([
      '..........',
      '..........',
      '..........',
      '..........',
      '....##....',
      '##x####x##',
      '....##....',
      '..........',
      '..........',
      '..........',
    ]),
    steps: [
      {
        beats: [
          { text: 'Only a little of this grid is worked out. Clues are in order: in column 3, **4 1** means the 4 comes first, then the 1.' },
          {
            text: 'Could the 4 sit below the cross in row 6? Then the 1 would need room after it, and rows 7–10 are only 4 cells.',
            draw: [{ ghost: { col: 2, at: [6, 6], len: 4, tone: 'bad' } }, { bracket: { col: 2, from: 6, to: 9, label: 'no room for the 1', tone: 'bad' } }],
          },
          {
            text: 'So the 4 is **above** the cross, in rows 1–5. Rows 2–4 are covered either way.',
            draw: [{ ghost: { col: 2, at: [0, 1], len: 4 } }, { both: { col: 2, from: 1, to: 3 } }],
          },
          { text: 'Column 8 is the same. Fill the overlap in both columns.' },
        ],
        highlight: { cols: [2, 7] },
        target: { filled: [...col(2, [1, 2, 3]), ...col(7, [1, 2, 3])] },
      },
      {
        beats: [
          {
            text: "Row 3 says **2 2**. One 2 can't cover both filled cells, so the left one belongs to the **first** 2 and the right one to the **second**.",
          },
          {
            text: 'Each 2 can reach just one cell past its filled cell.',
            draw: [{ ghost: { row: 2, at: [1, 2], len: 2 } }, { ghost: { row: 2, at: [6, 7], len: 2 } }],
          },
          { text: 'Cross out the four cells neither 2 can reach.' },
        ],
        highlight: { rows: [2] },
        target: { marked: row(2, [0, 4, 5, 9]) },
      },
      {
        beats: [
          { text: 'Column 4 says **1 4**, and row 6 is filled. Which block is it?' },
          {
            text: 'If it were the 1, the 4 would have to fit in rows 8–10: only 3 cells.',
            draw: [{ ghost: { col: 3, at: [7, 7], len: 4, tone: 'bad' } }, { bracket: { col: 3, from: 7, to: 9, label: '3 cells', tone: 'bad' } }],
          },
          {
            text: "So it's part of the **4**. However the 4 sits, it can't stretch down to row 10.",
            draw: [{ ghost: { col: 3, at: [2, 5], len: 4 } }],
          },
          { text: 'Cross out row 10 here, and in column 7, which is the same.' },
        ],
        highlight: { cols: [3, 6] },
        target: { marked: [[9, 3], [9, 6]] },
      },
      {
        beats: [{ text: 'Work out which block each filled cell belongs to, then keep the others out of its way. Finish the buck.', whole: true }],
        highlight: {},
        target: 'solved',
      },
    ],
    done: "Clues are in order, so a filled cell can only belong to blocks that have room on both sides of it. Once you know whose cell it is, every other block has to fit around it.",
  },
  {
    id: 'what-if',
    title: 'What if',
    picture: 'Bonfire',
    palette: { f: '#e8692c', y: '#ffc92e', k: '#6b4226' },
    rows: [
      '....f.....',
      '...ff..f..',
      '..fff.ff..',
      '.ffyfffyf.',
      '.fyyyffyf.',
      '..fyyyyf..',
      'k..ffff..k',
      '.kk....kk.',
      '...kkkk...',
      '.kk....kk.',
    ],
    given: board([
      '..........',
      '....#..#..',
      '..###.##..',
      '..######..',
      '..######..',
      '...###....',
      '....###...',
      '.#......#.',
      '..........',
      '..........',
    ]),
    steps: [
      {
        beats: [
          { text: 'Some of the grid is already worked out. Column 2 says **2 1 1**, and row 8 is filled.' },
          { text: "**What if** row 7 were filled too? Rows 7–8 would be a run of 2, so they'd be the 2." },
          {
            text: "Then both 1s would have to fit in rows 9–10, with a gap between them. They can't.",
            draw: [{ ghost: { col: 1, at: [6, 6], len: 2, tone: 'bad' } }, { bracket: { col: 1, from: 8, to: 9, label: 'no room for 1 1', tone: 'bad' } }],
          },
          { text: 'So row 7 is empty. So is row 9: rows 8–9 would be the 2, leaving only row 10 for both 1s.' },
          { text: 'Column 9 is the mirror image. Cross out rows 7 and 9 in both columns.' },
        ],
        highlight: { cols: [1, 8] },
        target: { marked: [[6, 1], [8, 1], [6, 8], [8, 8]] },
      },
      {
        beats: [
          { text: 'Column 7 says **5 1**. **What if** row 8 were filled?' },
          { text: 'Rows 7–8 would be a run of at least 2, too long for the 1. So it would be part of the 5.' },
          {
            text: "But the 5 also has to cover rows 3–5, and rows 3 to 8 is **6** cells. It doesn't fit.",
            draw: [{ bracket: { col: 6, from: 2, to: 7, label: '6 cells', tone: 'bad' } }],
          },
          { text: 'So row 8 is empty. Cross it out.' },
        ],
        highlight: { cols: [6] },
        target: { marked: [[7, 6]] },
      },
      {
        beats: [{ text: 'When nothing else works, pick a cell, suppose it, and follow the line until it breaks. Finish the bonfire.', whole: true }],
        highlight: {},
        target: 'solved',
      },
    ],
    done: "That's the last trick: suppose, and see if the line still fits. Keep it to one line at a time. Every puzzle in the Imperium can be solved line by line, so you never need to guess across the whole grid.",
  },
  {
    id: 'putting-it-together',
    title: 'Putting it together',
    picture: 'Lynx',
    palette: { t: '#b5833f', w: '#f2ede0', k: '#2e2a26' },
    rows: [
      '.k...........k.',
      '.k...........k.',
      '.tt.........tt.',
      '.ttt.......ttt.',
      '.tttt.....tttt.',
      '.ttttttttttttt.',
      'ttt...ttt...ttt',
      'tt..k.ttt.k..tt',
      'ttt...ttt...ttt',
      'tttttwwwwwttttt',
      'tw.twwkkkwwt.wt',
      '.ttww..k..wwtt.',
      '..twww.w.wwwt..',
      '...twwkwkwwt...',
      '.....wwwww.....',
    ],
    steps: [
      {
        beats: [
          {
            text: 'Your turn, on a 15×15 like the edge of the Wildwood. Start with the basics, then use edges, joins and splits, which block is which, and what if.',
            whole: true,
          },
          { text: 'The **assists** are your own settings again.', whole: true, anchor: 'assists' },
          { text: '**Hint** is free here, as in the tutorial.', whole: true, anchor: 'hint' },
          { text: 'Solve the lynx.', whole: true },
        ],
        highlight: {},
        target: 'solved',
      },
    ],
    done: "That's the lynx, and the techniques. The Wildwood is waiting.",
    free: true,
  },
]
