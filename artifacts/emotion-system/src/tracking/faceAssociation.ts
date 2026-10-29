import type { FaceObservation } from './expressionTypes';
import type { PersonTrack } from './types';

interface MatchCandidate {
  faceIndex: number;
  trackId: number;
  quality: number;
}

function overlapRatio(face: FaceObservation, person: PersonTrack): number {
  const left = Math.max(face.x, person.x);
  const top = Math.max(face.y, person.y);
  const right = Math.min(face.x + face.width, person.x + person.width);
  const bottom = Math.min(face.y + face.height, person.y + person.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const faceArea = face.width * face.height;
  return faceArea > 0 ? intersection / faceArea : 0;
}

/** Greedy one-face-to-one-person association, restricted to each person's head region. */
export function associateFacesWithTracks(
  faces: FaceObservation[],
  tracks: PersonTrack[],
): Map<number, FaceObservation> {
  const candidates: MatchCandidate[] = [];
  const visibleTracks = tracks.filter((track) => track.visible);

  faces.forEach((face, faceIndex) => {
    const centerX = face.x + face.width / 2;
    const centerY = face.y + face.height / 2;

    visibleTracks.forEach((track) => {
      const horizontalPadding = track.width * 0.1;
      const topTolerance = track.height * 0.04;
      const headBottom = track.y + track.height * 0.48;
      if (
        centerX < track.x - horizontalPadding ||
        centerX > track.x + track.width + horizontalPadding ||
        centerY < track.y - topTolerance ||
        centerY > headBottom
      ) {
        return;
      }

      const overlap = overlapRatio(face, track);
      if (overlap < 0.45) return;
      const horizontalOffset = Math.abs(centerX - (track.x + track.width / 2))
        / Math.max(track.width / 2, 0.001);
      const headPosition = (centerY - track.y) / Math.max(track.height, 0.001);
      const headCenterOffset = Math.abs(headPosition - 0.14) / 0.34;
      const quality =
        overlap * 0.58 +
        (1 - Math.min(1, horizontalOffset)) * 0.24 +
        (1 - Math.min(1, headCenterOffset)) * 0.18;
      candidates.push({ faceIndex, trackId: track.id, quality });
    });
  });

  candidates.sort((a, b) => b.quality - a.quality);
  const assignedFaces = new Set<number>();
  const assignedTracks = new Set<number>();
  const result = new Map<number, FaceObservation>();

  for (const candidate of candidates) {
    if (assignedFaces.has(candidate.faceIndex) || assignedTracks.has(candidate.trackId)) continue;
    const face = faces[candidate.faceIndex];
    if (!face) continue;
    assignedFaces.add(candidate.faceIndex);
    assignedTracks.add(candidate.trackId);
    result.set(candidate.trackId, face);
  }

  return result;
}
