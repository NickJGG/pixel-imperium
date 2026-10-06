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
An **Account**'s public page showing its handle, avatar and **Map**.

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
A single-player journey through a fixed sequence of **Provinces**, each **Campaign** defining its own shape and **Map**.
_Avoid_: Story mode, adventure

**Province**:
A named group of **Puzzles** within the **Campaign**, unlocked one at a time in a fixed order.
_Avoid_: Chapter, world, region, level

**Conquest**:
A **Province** becoming conquered once every one of its **Puzzles** is solved.
_Avoid_: Completion, clear

**Imperium**:
The first **Campaign**: six **Provinces** of 30 **Puzzles** each, marching inward to the **Capital** and **Throne**.

**Capital**:
The second-to-last **Province** of the **Imperium**.

**Throne**:
The final and hardest **Province** of the **Imperium**.
_Avoid_: Finale, boss

**Map**:
The pixel-art picture of a **Campaign**'s territory, divided into **Provinces** shown fogged, monochrome or in colour.
_Avoid_: World map, overworld

## Relationships

- An **Account** has exactly one **Handle** and one **Profile**
- An **Account** has at most one solve per **Puzzle**, either **Verified** or **Unverified**
- An **Unverified solve** becomes a **Verified solve** when its owner solves the **Puzzle** again while signed in
- A **Profile**'s **Map** counts a **Province** as conquered only if all its solves are **Verified**
- A **Campaign** has an ordered list of **Provinces**; the **Imperium**'s is four outer **Provinces**, then the **Capital**, then the **Throne**
- A **Province** has its **Campaign**'s number of **Puzzles** (30 in the **Imperium**), ordered from easiest to hardest
- Each **Province** unlocks on the **Conquest** of the one before it

## Example dialogue

> **Dev:** "I signed in on my sister's laptop. Do her **Signed-out play** solves count for me?"
> **Domain expert:** "Only if you accept the **Import**. Any solve whose finished grid is still there becomes a **Verified solve**. A solve she cleared for a **Replay** comes in as **Unverified**: you see it, nobody else does."

## Flagged ambiguities

- "guest account" from the original stack decision: resolved. There are no server-side guests; signed-out players are **Signed-out play** only.
- "imported solve": resolved. **Import** is the event; **Unverified solve** is the resulting status.
