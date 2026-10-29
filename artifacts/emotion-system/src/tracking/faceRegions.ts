import type { FaceObservation, FaceRegion } from './expressionTypes';
import type { PersonTrack } from './types';

/** Crop actual camera pixels around each tracked head; never synthesize face detail. */
export function getHeadRegions(tracks: PersonTrack[]): FaceRegion[] {
  return tracks.filter((track) => track.visible).slice(0, 5).map((track) => {
    const x = Math.max(0, track.x - track.width * 0.2);
    const y = Math.max(0, track.y - track.height * 0.08);
    const right = Math.min(1, track.x + track.width * 1.2);
    const bottom = Math.min(1, track.y + track.height * 0.55);
    return { x, y, width: right - x, height: bottom - y };
  }).filter((region) => region.width > 0 && region.height > 0);
}

export function mapCropPoint<T extends { x: number; y: number }>(point: T, region: FaceRegion): T {
  return {
    ...point,
    x: region.x + point.x * region.width,
    y: region.y + point.y * region.height,
  };
}

/** Overlapping head crops can find the same face; count and associate it only once. */
export function deduplicateFaces(faces: FaceObservation[]): FaceObservation[] {
  const unique: FaceObservation[] = [];
  const ordered = faces.slice().sort((a, b) =>
    Number(b.poseReliable) - Number(a.poseReliable) || b.width * b.height - a.width * a.height);
  for (const face of ordered) {
    const duplicate = unique.some((other) => {
      const intersection =
        Math.max(0, Math.min(face.x + face.width, other.x + other.width) - Math.max(face.x, other.x)) *
        Math.max(0, Math.min(face.y + face.height, other.y + other.height) - Math.max(face.y, other.y));
      const smallerArea = Math.min(face.width * face.height, other.width * other.height);
      return smallerArea > 0 && intersection / smallerArea > 0.65;
    });
    if (!duplicate) unique.push(face);
  }
  return unique;
}
