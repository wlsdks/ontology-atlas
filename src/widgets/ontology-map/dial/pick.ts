import type { DialPick, DialRowPick, DialRowAction } from "./types";

export function pickDial(picks: readonly DialPick[], rows: readonly DialRowPick[], x: number, y: number, slackPx: number): string | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const { id, box, action } = rows[i]!;
    if (x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY) return action ? null : id;
  }
  let slackId: string | null = null;
  let slackDistance = Infinity;
  for (let i = picks.length - 1; i >= 0; i--) {
    const pick = picks[i]!;
    const distance = Math.hypot(x - pick.x, y - pick.y);
    if (distance <= pick.r) return pick.id;
    if (distance <= pick.r + slackPx && distance < slackDistance) {
      slackId = pick.id;
      slackDistance = distance;
    }
  }
  return slackId;
}

export function pickDialAction(rows: readonly DialRowPick[], x: number, y: number): DialRowAction | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const { box, action } = rows[i]!;
    if (x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY) return action ?? null;
  }
  return null;
}
