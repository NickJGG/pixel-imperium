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
        text: [
          "Some of this grid is already worked out: everything the tutorial's tricks give. From here they've run dry, so it's time for new ones.",
          'Column 10 says **2**, and its bottom cell is filled. That cell touches the edge of the grid, so the 2 has nowhere to go but **up**. Fill the cell above it, and cross out the rest of the column.',
        ],
        highlight: { cols: [9] },
        target: { filled: [[8, 9]], marked: col(9, [1, 2, 4, 5, 6, 7]) },
      },
      {
        text: [
          'A cross works just like the edge. Row 5 says **7**, and its last cell is now crossed out, so the 7 ends at cell 9 at the latest.',
          'Push it as far right as it can go: it still covers cell 3. Fill it.',
        ],
        highlight: { rows: [4] },
        target: { filled: [[4, 2]] },
      },
      {
        text: [
          "The ground is filled, so each column's **last** block sits against the bottom edge. In columns 1–4, 6 and 7 that last block is a **1**: the ground cell is the whole of it.",
          'Cross out the cell above the ground in each of those columns.',
        ],
        highlight: { cols: [0, 1, 2, 3, 5, 6] },
        target: { marked: row(8, [0, 1, 2, 3, 5, 6]) },
      },
      {
        text: [
          'Row 9 says **1 3**. The trunk is the 1, and the crosses leave a gap of exactly **3** cells at the right. Only one place for the 3.',
        ],
        highlight: { rows: [8] },
        target: { filled: row(8, [7, 8]) },
      },
      {
        text: [
          'Column 9 says **4**. Rows 2 and 3 sit between two crosses: a gap of 2, too small for the 4. Nothing fits there, so cross them out.',
        ],
        highlight: { cols: [8] },
        target: { marked: col(8, [1, 2]) },
      },
      {
        text: ['Edges, crosses and gaps that are too small. Use them to finish the spruce.'],
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
        text: [
          'Some of the grid is already worked out. Row 7 says **2 4**, and it has two filled pairs with a single gap between them.',
          'Fill that gap and cells 4–8 become one run of 5, longer than any block in the row. So the pairs are **different blocks**, and the gap stays empty. Cross it out.',
        ],
        highlight: { rows: [6] },
        target: { marked: [[6, 5]] },
      },
      {
        text: ['The pair on the right is part of the 4, and the new cross walls it in on the left. It can only grow **right**.'],
        highlight: { rows: [6] },
        target: { filled: row(6, [8, 9]) },
      },
      {
        text: [
          'Column 9 says **5**, a single block. Rows 7 and 9 are both filled, so they belong to the same 5, and so does every cell **between** them. Fill row 8.',
        ],
        highlight: { cols: [8] },
        target: { filled: [[7, 8]] },
      },
      {
        text: [
          'Row 8 says **4 2**. Cells 3–6 are a run of 4, as long as the longest block. A run that long is finished: cap it with a cross on **each side**.',
        ],
        highlight: { rows: [7] },
        target: { marked: row(7, [1, 6]) },
      },
      {
        text: ['Join what belongs together, split what would be too long, and cap what is finished. Finish the mushrooms.'],
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
        text: [
          'Only a little of this grid is worked out. Clues are in order: in column 3, **4 1** means the 4 comes first, then the 1.',
          'Row 6 is crossed out. Could the 4 sit below it? Then the 1 would need room after it, and rows 7–10 are only 4 cells. So the 4 is **above** the cross, in rows 1–5, and overlap pins its middle. Column 8 is the same.',
        ],
        highlight: { cols: [2, 7] },
        target: { filled: [...col(2, [1, 2, 3]), ...col(7, [1, 2, 3])] },
      },
      {
        text: [
          "Row 3 says **2 2**. One 2 can't cover both filled cells, so the left one belongs to the **first** 2 and the right one to the **second**.",
          'Each 2 can reach just one cell past its filled cell. Cross out everything neither can reach.',
        ],
        highlight: { rows: [2] },
        target: { marked: row(2, [0, 4, 5, 9]) },
      },
      {
        text: [
          "Column 4 says **1 4**, and row 6 is filled. Which block is it? If it were the 1, the 4 would have to fit in rows 8–10: only 3 cells. So it's part of the **4**, and the 4 can't stretch down to row 10.",
          'Cross out row 10 here, and in column 7, which is the same.',
        ],
        highlight: { cols: [3, 6] },
        target: { marked: [[9, 3], [9, 6]] },
      },
      {
        text: ['Work out which block each filled cell belongs to, then keep the others out of its way. Finish the buck.'],
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
        text: [
          'Some of the grid is already worked out. Column 2 says **2 1 1**, and row 8 is filled.',
          "**What if** row 7 were filled too? Rows 7–8 would make a run of 2, so they'd be the 2, and both 1s would have to fit below. Rows 9–10 can't hold two 1s with a gap between them. Impossible, so row 7 is empty, and row 9 too, by the same argument.",
          'Column 9 is the mirror image. Cross out all four.',
        ],
        highlight: { cols: [1, 8] },
        target: { marked: [[6, 1], [8, 1], [6, 8], [8, 8]] },
      },
      {
        text: [
          'Column 7 says **5 1**. **What if** row 8 were filled? Rows 7–8 would make a run of at least 2, too long for the 1, so it would be part of the 5.',
          "But the 5 also has to cover rows 3–5, and rows 3 to 8 is 6 cells. It doesn't fit, so row 8 is empty.",
        ],
        highlight: { cols: [6] },
        target: { marked: [[7, 6]] },
      },
      {
        text: ['When nothing else works, pick a cell, suppose it, and follow the line until it breaks. Finish the bonfire.'],
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
        text: [
          'Your turn, on a 15×15 like the edge of the Wildwood. Start with the basics, then use edges, joins and splits, which block is which, and what if.',
          'The **assists** are your own settings again, and **Hint** is free here.',
        ],
        highlight: {},
        target: 'solved',
      },
    ],
    done: "That's the lynx, and the techniques. The Wildwood is waiting.",
    free: true,
  },
]
