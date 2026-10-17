# Pixel Imperium

A nonogram site whose puzzles are hand-authored pixel art, played in monochrome and revealed in color once solved.

## Language

American spelling throughout: product copy, docs, comments and identifiers, e.g. color.

### Puzzles

**Puzzle**:
A pixel-art picture presented as a nonogram, identified by a string id.
_Avoid_: Level, board

**Palette**:
The puzzle's per-cell reveal colors, released only after a server-verified solve.
_Avoid_: Solution, colors

**Reveal**:
Showing a solved puzzle in its palette colors.

**Replay**:
Clearing an already-solved puzzle to play it again; the puzzle stays solved.
_Avoid_: Reset, restart

**Sticker**:
A solved puzzle's revealed picture as it appears in the album, one per solved **Puzzle**.
_Avoid_: Card, badge, trophy

**Foil**:
A **Sticker** earned by solving a **Puzzle** the first time without any **Hint**.
_Avoid_: Shiny, holo, rare, perfect

**Stamp**:
A milestone an **Account** has earned, inked on its **Profile** with the date it was earned.
_Avoid_: Achievement, badge, trophy, medal

**Hint**:
A server-given nudge on a **Puzzle** in progress: one wrong cell pointed out, or one correct cell revealed.
_Avoid_: Assist (assists are the free play settings and never cost **Foil**), clue, help

**Tutorial**:
A short, skippable guided sequence of **Lessons** teaching how to solve nonograms, offered once to a new **Player**; outside any **Campaign**.
_Avoid_: Onboarding, intro, training, guide

**Techniques**:
A second guided sequence of **Lessons** on harder line deductions, always open from **Learn** and offered once, on the first **Puzzle** of the province that flags it; outside any **Campaign**.
_Avoid_: Advanced tutorial, masterclass, Tutorial 2

**Learn**:
The page at `/learn` listing every **Lesson** of the **Tutorial** (labelled "Basics" there) and **Techniques**, with what the **Player** has finished.
_Avoid_: Academy, school, lessons page, hub (in product copy)

**Home**:
The page at `/`: the main menu, one column each for the **Campaign** last played (leading on to **Campaigns**), the **Daily**, **Learn**, the **Workshop**, the **Profile** and Settings (Sign in in place of the last two for **Signed-out play**), plus a temporary column for the newest **Featured** **Campaign**.
_Avoid_: Menu, dashboard, hub (in product copy)

**Lesson**:
One guided picture grid within the **Tutorial** or **Techniques**; it **Reveals** like a **Puzzle** but earns no **Sticker**.
_Avoid_: Drill, step (a step is one prompt within a lesson)

**Beat**:
One callout within a step of a **Lesson**. Talk beats explain and wait for Next; the step's last beat, the do beat, waits for the step's cells.
_Avoid_: Slide, page, tip

**Attempt**:
One run at a **Puzzle** from an empty grid to its solve: it starts on the first move, and a Clear or **Replay** starts a new one.
_Avoid_: Run, try, session

**Solve time**:
How long an **Attempt** took, counting only time the puzzle was open, visible and not paused.
_Avoid_: Score, duration, elapsed

**Best time**:
A **Puzzle**'s fastest **Solve time** for a **Player**, from an **Attempt** with no **Hint**; seen only by that **Player**.
_Avoid_: Record, PB, high score, personal best (in product copy)

### Players

**Player**:
Anyone playing, signed in or not.

**Account**:
A signed-in player's server-side identity, created via Google or Discord sign-in.
_Avoid_: User (in product copy), guest account

**Signed-out play**:
Play without an **Account**; progress and solves live only on that device.
_Avoid_: Guest mode, anonymous user

**Handle**:
An **Account**'s unique, case-insensitive public name, used in its profile URL `/u/<handle>`.
_Avoid_: Username, display name

**Profile**:
An **Account**'s public page: its handle, showcase, stats, calendar and **Stamps**.

### Solves

**Verified solve**:
A solve the server checked against the clues while recording it for an **Account**.

**Unverified solve**:
A solve brought in by **Import** with no grid left to check; visible only to its owner.
_Avoid_: Imported solve (as a status)

**Import**:
Moving a device's **Signed-out play** data into an **Account**, after the player accepts the import prompt.
_Avoid_: Migration, sync

### Campaign

**Campaign**:
A single-player journey through a fixed sequence of **Provinces**.
_Avoid_: Story mode, adventure

**Campaigns**:
The page at `/c/<id>`: every **Campaign** side by side, the one at that address open; a **Player**'s started ones first, then any **Featured** one, then the rest.
_Avoid_: Shelf, library, archive, atlas

**Featured**:
A **Campaign** in the 30 days after its release, badged New for everyone.
_Avoid_: Spotlight, fresh, latest, new (as a term; "New" is the badge's copy)

**Province**:
A named group of **Puzzles** within the **Campaign**, unlocked one at a time in a fixed order.
_Avoid_: Chapter, world, region, level

**Conquest**:
A **Province** becoming conquered once every one of its **Puzzles** is solved, celebrated on the spot when the last **Sticker** lands.
_Avoid_: Completion, clear

**Imperium**:
The first **Campaign**: six **Provinces** of 30 **Puzzles** each, marching inward to the **Capital** and **Throne**.

**Capital**:
The second-to-last **Province** of the **Imperium**.

**Throne**:
The final and hardest **Province** of the **Imperium**.
_Avoid_: Finale, boss

**Voyage**:
The second **Campaign**: six **Provinces** of 30 **Puzzles** each, sailing outward from the Shipyard to the **Edge**.
_Avoid_: Expedition, journey

**Edge**:
The final and hardest **Province** of the **Voyage**, where the maps run out.
_Avoid_: Edge of the Map, finale, boss

**Tier**:
A **Puzzle**'s difficulty relative to the rest of its **Province**: Easy, Medium or Hard, worked out from its puzzles' difficulty and order, never hand-set.
_Avoid_: Difficulty, rating (the solver's campaign-wide score), level, rank

**Crest**:
A **Campaign**'s own hand-authored pixel-art picture, one pixel per **Puzzle**, each pixel revealed when its puzzle is solved; each **Province** owns a region of it.
_Avoid_: Tapestry, mural, map, meta-puzzle

**Daily**:
The one **Puzzle** set for a given date, the same for every **Player**: hand-authored, outside any **Campaign**, or generated when no hand-authored one exists for that date.
_Avoid_: Puzzle of the day, daily challenge

**Year**:
One calendar year of **Dailies**, kept as its own album the way a **Campaign** is, with its twelve **Months** in place of **Provinces**.
_Avoid_: Season, volume, archive

**Month**:
One calendar month of a **Year**'s **Dailies**, a page of date slots the way a **Province** is a page of **Puzzle** slots.

**Streak**:
The run of consecutive days, in the **Player**'s own timezone, each with at least one solve of any **Puzzle**, a **Daily** included.
_Avoid_: Daily streak, chain, combo

### Workshop

**Workshop**:
Where a signed-in **Player** makes their own **Puzzles** and **Campaigns**: a column on **Home** and the page at `/workshop` listing their drafts and published work (Yours), and the player-made work they've opened by link (Played).
_Avoid_: Make, studio, create (as the place's name)

**Author**:
The **Account** that made a player-made **Puzzle** or **Campaign**, shown as a byline ("by @handle"). Player-made work uses the same nouns as official work; "player-made" and "official" are the qualifiers.
_Avoid_: Creator, maker, community, custom, user-generated

**Retired**:
A published player-made **Puzzle** or **Campaign** its **Author** has closed to newcomers; anyone who started it can still finish it. Distinct from removed (taken down by an admin, gone for everyone).
_Avoid_: Unpublished, archived, deleted

### Party

**Party**:
A group of up to four **Players**, started by a signed-in **Host**, that stays together across **Puzzles** and solves them on one live, shared grid. The only way to play with others.
_Avoid_: Co-op (retired), room, lobby, group, squad, multiplayer (in product copy)

**Friend**:
Another **Account** that accepted your friend request, or whose request you accepted; mutual, and either side can remove it.
_Avoid_: Follower, contact, buddy, connection

**Ping**:
A ring a **Player** in a **Party** pulses on one cell, in their seat color, for everyone to see: "look here". Changes no cell.
_Avoid_: Mark (a crossed-out cell), flag, highlight

**Host**:
The signed-in **Player** running a **Party**: whoever started it, until they hand it over or leave, when it passes to the longest-seated signed-in member. The only one who can start a **Puzzle** for the party, Clear, end, Remove a **Player** or make a new link. Any member can invite.
_Avoid_: Owner, leader, admin

## Relationships

- An **Account** has exactly one **Handle** and one **Profile**
- An **Account** has at most one solve per **Puzzle**, either **Verified** or **Unverified**
- An **Unverified solve** becomes a **Verified solve** when its owner solves the **Puzzle** again while signed in
- A **Profile** counts a **Province** as conquered only if all its solves are **Verified**
- A **Campaign** has an ordered list of **Provinces**; the **Imperium**'s is four outer **Provinces**, then the **Capital**, then the **Throne**
- An official **Province** has its **Campaign**'s number of **Puzzles** (30 in the **Imperium**), ordered from easiest to hardest; a player-made **Campaign** has 1–6 **Provinces** of 1–30 **Puzzles** each, in the **Author**'s order
- Each **Province** unlocks on the **Conquest** of the one before it
- Every released **Campaign** is open from the start; **Campaigns** orders them started first, then **Featured**, then the rest, each group by release
- At most one **Featured** **Campaign** has a column on **Home**: the newest; it leaves once the **Player** starts it
- A **Province**'s **Tiers** run Easy, then Medium, then Hard in its order, each covering a contiguous run of its **Puzzles**
- A **Sticker** is **Foil** or not for good once its **Puzzle** is first solved; a **Replay** never changes it
- Using one **Hint** on a **Puzzle** before its first solve rules out **Foil** for that **Puzzle**
- A solve brought in by **Import** is never **Foil**, even once it becomes a **Verified solve**
- A **Campaign** has one **Crest** with exactly as many pixels as it has **Puzzles**; each **Province**'s region holds as many pixels as the **Province** has **Puzzles**. A player-made **Campaign**'s **Crest** is optional and may leave pixels empty; its filled pixels are what must match
- A **Crest** pixel's color is released with its **Puzzle**'s **Palette**, only after a server-verified solve
- A generated **Daily** has a one-color **Palette** and earns a **Sticker** like a hand-authored one, with nothing marking it as generated
- A **Daily** can only be started on its own date; a missed **Daily** is gone for good
- A **Daily** started on its date can still be finished shortly after midnight, and its solve counts for its own date, **Streak** included
- A **Year** always has twelve **Months**; a **Month** has one **Daily** per date
- A **Puzzle** or **Campaign** is official or player-made; a player-made one has exactly one **Author** and is reached only by its link
- A player-made **Puzzle** earns a **Sticker** and **Foil** and counts toward a **Streak**, but never a **Stamp** and never appears on a **Profile**
- An **Author** solving their own **Puzzle** records nothing
- Both sides of a **Friend** pair have an **Account**; **Signed-out play** has no friends
- A **Player** is in at most one **Party** at a time; a **Party** ends once nobody in it has been connected for 10 minutes
- A **Party** solve gives every signed-in **Player** in it a **Verified solve** and **Sticker**, never **Foil** and never a **Best time**
- A **Party** solve on a **Province** a **Player** hasn't unlocked stays hidden until they reach it
- Today's **Daily** can't be played in a **Party**
- An **Author** hosting a **Party** on their own **Puzzle** records nothing; the other **Players** record as usual
- Only **Players** who already started a **Retired** **Puzzle** can join a **Party** on it
- A player-made **Puzzle** is in at most one **Campaign**, and keeps its own link once it is; a solve counts in both places

## Example dialogue

> **Dev:** "I signed in on my sister's laptop. Do her **Signed-out play** solves count for me?"
> **Domain expert:** "Only if you accept the **Import**. Any solve whose finished grid is still there becomes a **Verified solve**. A solve she cleared for a **Replay** comes in as **Unverified**: you see it, nobody else does."

## Flagged ambiguities

- "guest account" from the original stack decision: resolved. There are no server-side guests; signed-out players are **Signed-out play** only.
- "imported solve": resolved. **Import** is the event; **Unverified solve** is the resulting status.
