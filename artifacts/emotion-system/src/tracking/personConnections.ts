import type { PersonTrack } from './types';

export interface PersonConnection {
  fromId: number;
  toId: number;
}

/** Return a deterministic minimum-spanning tree over visible person centers. */
export function buildPersonConnectionTree(tracks: PersonTrack[]): PersonConnection[] {
  const visible = tracks
    .filter((track) => track.visible && [track.x, track.y, track.width, track.height].every(Number.isFinite))
    .slice()
    .sort((left, right) => left.id - right.id);
  if (visible.length < 2) return [];

  const visited = new Set<number>([visible[0]!.id]);
  const edges: PersonConnection[] = [];

  while (visited.size < visible.length) {
    let best: { fromId: number; toId: number; distance: number } | null = null;
    for (const from of visible) {
      if (!visited.has(from.id)) continue;
      const fromX = from.x + from.width / 2;
      const fromY = from.y + from.height / 2;
      for (const to of visible) {
        if (visited.has(to.id)) continue;
        const dx = fromX - (to.x + to.width / 2);
        const dy = fromY - (to.y + to.height / 2);
        const distance = dx * dx + dy * dy;
        if (
          !best ||
          distance < best.distance ||
          (distance === best.distance && (from.id < best.fromId || (from.id === best.fromId && to.id < best.toId)))
        ) {
          best = { fromId: from.id, toId: to.id, distance };
        }
      }
    }
    if (!best) break;
    edges.push({ fromId: best.fromId, toId: best.toId });
    visited.add(best.toId);
  }

  return edges;
}
