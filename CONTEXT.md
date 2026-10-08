# Pixel Imperium

A nonogram site whose puzzles are hand-authored pixel art, played in monochrome and revealed in colour once solved.

## Language

### Puzzles

**Puzzle**:
A pixel-art picture presented as a nonogram, identified by a string id.
_Avoid_: Level, board

**Palette**:
The puzzle's per-cell reveal colours, released only after a server-verified solve.
_Avoid_: Solution, colours

**Reveal**:
Showing a solved puzzle in its palette colours.

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
An **Account**'s public page: its handle, showcase, province index, stats, activity and latest **Stickers**.

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

## Relationships

- An **Account** has exactly one **Handle** and one **Profile**
- An **Account** has at most one solve per **Puzzle**, either **Verified** or **Unverified**
- An **Unverified solve** becomes a **Verified solve** when its owner solves the **Puzzle** again while signed in
- A **Profile** counts a **Province** as conquered only if all its solves are **Verified**
- A **Campaign** has an ordered list of **Provinces**; the **Imperium**'s is four outer **Provinces**, then the **Capital**, then the **Throne**
- A **Province** has its **Campaign**'s number of **Puzzles** (30 in the **Imperium**), ordered from easiest to hardest
- Each **Province** unlocks on the **Conquest** of the one before it
- A **Sticker** is **Foil** or not for good once its **Puzzle** is first solved; a **Replay** never changes it
- Using one **Hint** on a **Puzzle** before its first solve rules out **Foil** for that **Puzzle**
- A solve brought in by **Import** is never **Foil**, even once it becomes a **Verified solve**

## Example dialogue

> **Dev:** "I signed in on my sister's laptop. Do her **Signed-out play** solves count for me?"
> **Domain expert:** "Only if you accept the **Import**. Any solve whose finished grid is still there becomes a **Verified solve**. A solve she cleared for a **Replay** comes in as **Unverified**: you see it, nobody else does."

## Flagged ambiguities

- "guest account" from the original stack decision: resolved. There are no server-side guests; signed-out players are **Signed-out play** only.
- "imported solve": resolved. **Import** is the event; **Unverified solve** is the resulting status.
