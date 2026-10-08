import { type Campaign, buildCampaign, campaignProblems, readCampaignSources, solverReport, suggestTierCuts } from './campaigns.ts'

const problems: string[] = []
const campaigns: Campaign[] = []
for (const source of readCampaignSources()) {
  try {
    campaigns.push(buildCampaign(source))
  } catch (e) {
    problems.push((e as Error).message)
  }
}
problems.push(...campaignProblems(campaigns))

const yes = (b: boolean) => (b ? 'yes' : 'NO')
for (const campaign of campaigns) {
  const report = solverReport(campaign)
  problems.push(...report.problems)
  console.log(`\n${campaign.name} (${campaign.id})${campaign.draft ? ' [draft]' : ''}`)
  console.table(
    report.puzzles.map(p => ({
      province: p.provinceId,
      puzzle: p.id,
      size: `${p.width}×${p.height}`,
      unique: yes(p.unique),
      logic: yes(p.logicSolvable),
      rating: p.rating,
      passes: p.passes ?? '-',
    })),
  )
  const cuts = (t: readonly number[] | null | undefined) => (t ? `[${t.join(', ')}]` : '-')
  for (const province of campaign.provinces) {
    const suggested = suggestTierCuts(report.puzzles.filter(p => p.provinceId === province.id))
    console.log(`${province.id.padEnd(10)} tiers ${cuts(province.tiers).padEnd(9)} suggested ${cuts(suggested)}`)
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n${problems.map(p => `  ${p}`).join('\n')}`)
  process.exit(1)
}
console.log('\nAll campaigns pass.')
