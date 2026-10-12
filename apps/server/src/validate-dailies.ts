import { checkDailies, generateDaily, readDailiesSource } from './dailies.ts'

const { dailies, reports, problems } = checkDailies(readDailiesSource())
const yes = (b: boolean) => (b ? 'yes' : 'NO')

console.log(`\nDailies from ${dailies.launch}, ${reports.length} authored`)
console.table(
  reports.map(r => ({
    date: r.date,
    title: r.title,
    size: `${r.width}×${r.height}`,
    unique: yes(r.unique),
    logic: yes(r.logicSolvable),
    rating: r.rating,
  })),
)

// Generated Dailies are frozen and checked by the tests; this only proves the next year generates.
const start = Date.parse(`${dailies.launch}T00:00:00Z`)
for (let i = 0; i < 366; i++) {
  const date = new Date(start + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  if (dailies.authored.has(date)) continue
  try {
    generateDaily(date)
  } catch (e) {
    problems.push((e as Error).message)
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n${problems.map(p => `  ${p}`).join('\n')}`)
  process.exit(1)
}
console.log('\nAll Dailies pass.')
