/** Controller feel. Times are in milliseconds, deadzones are axis or trigger values in 0–1. */
export const REPEAT_DELAY_MS = 260
export const REPEAT_EVERY_MS = 60
/** How far the left stick tilts before it counts as a d-pad press. */
export const STICK_DEAD = 0.5
export const TRIGGER_DEAD = 0.08
export const PAN_DEAD = 0.2
export const PAN_PX_PER_S = 600
/** Natural-log zoom per second at full trigger. */
export const ZOOM_RATE = 2.2
/** Slack after a Lesson's reveal before A counts again, so a press meant for the board can't skip ahead. */
export const REVEAL_GUARD_MS = 150
