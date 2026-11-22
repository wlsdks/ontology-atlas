import { useCallback, useMemo, useState } from 'react';
import type { RoomEntry } from '@/shared/lib/work-status/work-tracks';
import { castRooms, moruCharacter, roomLook, type CastRoom, type MoruCharacter } from './room-look';
import { stableOrder } from './use-stable-order';

/** A room at work or at rest shows its Moru; a folder nobody holds, and one stuck behind a lock or gone, show none on a mini room. */
const showsMoru = (room: RoomEntry) => {
  const look = roomLook(room.state);
  return look.cast !== 'none' && !look.monitorOff;
};

/**
 * Each room's Moru for as long as the board is open. A room joins the cast when it first shows a Moru
 * and keeps its place until it leaves the building, so a folder nobody holds or one stuck behind a
 * lock takes no character from the rooms at work; drawn large meanwhile, it wears the one its branch
 * prefers. Rooms that join together go by their key, so the same worktrees get the same
 * cast each time the board opens.
 */
export function useRoomCast(rooms: readonly RoomEntry[]): (room: RoomEntry) => MoruCharacter {
  const [order, setOrder] = useState<readonly string[]>([]);
  const known = new Set(order);
  const keys = rooms.filter(room => known.has(room.key) || showsMoru(room)).map(room => room.key).sort();
  const next = stableOrder(order, keys);
  if (next !== order) setOrder(next);
  const byKey = new Map(rooms.map(room => [room.key, room]));
  const ordered: CastRoom[] = next.flatMap(key => {
    const room = byKey.get(key);
    return room ? [{ key, branch: room.track.branch, base: room.track.standing === 'base' }] : [];
  });
  // A plan builds every entry afresh; the cast changes only when a room, its branch or its order does.
  const signature = JSON.stringify(ordered);
  const cast = useMemo(() => castRooms(JSON.parse(signature) as CastRoom[]), [signature]);
  return useCallback(
    (room: RoomEntry) => cast.get(room.key) ?? (room.track.standing === 'base' ? 'grey' : moruCharacter(room.track.branch ?? room.key)),
    [cast],
  );
}
