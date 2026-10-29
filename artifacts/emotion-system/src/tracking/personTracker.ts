import type { PersonTrack } from './types';

export interface PersonObservation {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

interface MutableTrack extends PersonObservation {
  id: number;
  velocityX: number;
  velocityY: number;
  lastSeenAt: number;
  consecutiveHits: number;
}

const TRACK_RETENTION_MS = 2000;
const BOX_COAST_MS = 420;
const CONFIRMATION_WINDOW_MS = 1200;
const REQUIRED_CONFIRMATION_HITS = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampBox(box: PersonObservation): PersonObservation {
  const x = clamp(box.x, 0, 1);
  const y = clamp(box.y, 0, 1);
  const right = clamp(box.x + box.width, x, 1);
  const bottom = clamp(box.y + box.height, y, 1);
  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
    confidence: clamp(box.confidence, 0, 1),
  };
}

function predict(track: MutableTrack, now: number): PersonObservation {
  const elapsedSeconds = clamp((now - track.lastSeenAt) / 1000, 0, BOX_COAST_MS / 1000);
  return clampBox({
    x: track.x + track.velocityX * elapsedSeconds,
    y: track.y + track.velocityY * elapsedSeconds,
    width: track.width,
    height: track.height,
    confidence: track.confidence,
  });
}

function intersectionOverUnion(a: PersonObservation, b: PersonObservation): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function centerDistance(a: PersonObservation, b: PersonObservation): number {
  return Math.hypot(
    a.x + a.width / 2 - (b.x + b.width / 2),
    a.y + a.height / 2 - (b.y + b.height / 2),
  );
}

interface MatchCandidate {
  trackId: number;
  detectionIndex: number;
  quality: number;
}

/** Short-lived IoU + motion matching; IDs are session-local, not identities. */
export class PersonTracker {
  private tracks = new Map<number, MutableTrack>();
  private nextId = 1;

  reset(): void {
    this.tracks.clear();
    this.nextId = 1;
  }

  update(observations: PersonObservation[], now: number): PersonTrack[] {
    for (const [id, track] of this.tracks) {
      if (now - track.lastSeenAt > TRACK_RETENTION_MS) this.tracks.delete(id);
    }

    const detections = observations
      .filter((item) =>
        Number.isFinite(item.x) &&
        Number.isFinite(item.y) &&
        Number.isFinite(item.width) &&
        Number.isFinite(item.height) &&
        Number.isFinite(item.confidence) &&
        item.width > 0 &&
        item.height > 0,
      )
      .map(clampBox);

    const candidates: MatchCandidate[] = [];
    for (const track of this.tracks.values()) {
      const predicted = predict(track, now);
      const elapsedSeconds = Math.max(0, (now - track.lastSeenAt) / 1000);
      const distanceGate = Math.min(0.6, 0.16 + elapsedSeconds * 0.28);
      detections.forEach((detection, detectionIndex) => {
        const overlap = intersectionOverUnion(predicted, detection);
        const distance = centerDistance(predicted, detection);
        if (overlap < 0.04 && distance > distanceGate) return;
        const proximity = 1 - Math.min(1, distance / distanceGate);
        candidates.push({
          trackId: track.id,
          detectionIndex,
          quality: overlap * 0.72 + proximity * 0.28,
        });
      });
    }
    candidates.sort((a, b) => b.quality - a.quality);

    const matchedTracks = new Set<number>();
    const matchedDetections = new Set<number>();
    for (const candidate of candidates) {
      if (matchedTracks.has(candidate.trackId) || matchedDetections.has(candidate.detectionIndex)) continue;
      const track = this.tracks.get(candidate.trackId);
      const detection = detections[candidate.detectionIndex];
      if (!track || !detection) continue;

      const elapsedSeconds = Math.max(0.04, (now - track.lastSeenAt) / 1000);
      const predicted = predict(track, now);
      const observedVelocityX = (detection.x - track.x) / elapsedSeconds;
      const observedVelocityY = (detection.y - track.y) / elapsedSeconds;
      const smoothed = clampBox({
        x: detection.x * 0.78 + predicted.x * 0.22,
        y: detection.y * 0.78 + predicted.y * 0.22,
        width: detection.width * 0.76 + track.width * 0.24,
        height: detection.height * 0.76 + track.height * 0.24,
        confidence: detection.confidence,
      });

      track.velocityX = clamp(track.velocityX * 0.55 + observedVelocityX * 0.45, -1.5, 1.5);
      track.velocityY = clamp(track.velocityY * 0.55 + observedVelocityY * 0.45, -1.5, 1.5);
      const consecutiveHits = now - track.lastSeenAt <= CONFIRMATION_WINDOW_MS
        ? track.consecutiveHits + 1
        : 1;
      Object.assign(track, smoothed, { lastSeenAt: now, consecutiveHits });
      matchedTracks.add(track.id);
      matchedDetections.add(candidate.detectionIndex);
    }

    detections.forEach((detection, index) => {
      if (matchedDetections.has(index)) return;
      const id = this.nextId++;
      this.tracks.set(id, {
        ...detection,
        id,
        velocityX: 0,
        velocityY: 0,
        lastSeenAt: now,
        consecutiveHits: 1,
      });
    });

    return [...this.tracks.values()].map((track) => {
      const age = now - track.lastSeenAt;
      const box = predict(track, now);
      return {
        id: track.id,
        ...box,
        visible: track.consecutiveHits >= REQUIRED_CONFIRMATION_HITS && age <= BOX_COAST_MS,
      };
    });
  }
}
