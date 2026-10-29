import type { ExpressionLabel, ExpressionReadout } from '../tracking/expressionTypes';
import type { PersonTrack } from '../tracking/types';

export const KNOWN_EMOTIONS = ['NEUTRAL', 'HAPPY', 'SAD', 'ANGRY', 'SURPRISED'] as const;
export type KnownEmotion = (typeof KNOWN_EMOTIONS)[number];
export type EmotionCounts = Record<ExpressionLabel, number>;
export type EmotionShares = Record<KnownEmotion, number | null>;

export interface EmotionTrendPoint {
  at: number;
  session: EmotionShares;
  byTrack: Record<string, EmotionShares>;
  validSamples: number;
  unknownSamples: number;
}

export const createEmptyEmotionCounts = (): EmotionCounts => ({
  NEUTRAL: 0,
  HAPPY: 0,
  SAD: 0,
  ANGRY: 0,
  SURPRISED: 0,
  UNKNOWN: 0,
});

export function incrementEmotionCount(counts: EmotionCounts, label: ExpressionLabel): EmotionCounts {
  return { ...counts, [label]: counts[label] + 1 };
}

export function incrementTrackEmotionCount(
  byTrack: Record<string, EmotionCounts>,
  trackId: number,
  label: ExpressionLabel,
): void {
  const key = String(trackId);
  byTrack[key] = incrementEmotionCount(byTrack[key] ?? createEmptyEmotionCounts(), label);
}

export function validEmotionCount(counts: EmotionCounts): number {
  return KNOWN_EMOTIONS.reduce((total, label) => {
    const count = counts[label];
    return total + (Number.isFinite(count) && count > 0 ? count : 0);
  }, 0);
}

export function emotionShares(counts: EmotionCounts): EmotionShares {
  const denominator = validEmotionCount(counts);
  return Object.fromEntries(KNOWN_EMOTIONS.map((label) => [
    label,
    denominator > 0 ? (Math.max(0, counts[label]) / denominator) * 100 : null,
  ])) as EmotionShares;
}

/** Integer display values use the largest-remainder method and sum to exactly 100. */
export function integerEmotionPercentages(counts: EmotionCounts): Record<KnownEmotion, number | null> {
  const shares = emotionShares(counts);
  if (validEmotionCount(counts) === 0) {
    return Object.fromEntries(KNOWN_EMOTIONS.map((label) => [label, null])) as Record<KnownEmotion, null>;
  }
  const values = KNOWN_EMOTIONS.map((label) => ({
    label,
    value: shares[label] ?? 0,
    whole: Math.floor(shares[label] ?? 0),
  }));
  let remainder = 100 - values.reduce((sum, item) => sum + item.whole, 0);
  values
    .slice()
    .sort((a, b) => (b.value - b.whole) - (a.value - a.whole))
    .slice(0, remainder)
    .forEach((item) => {
      const original = values.find((value) => value.label === item.label);
      if (original) original.whole += 1;
    });
  return Object.fromEntries(values.map((item) => [item.label, item.whole])) as Record<KnownEmotion, number>;
}

export function makeEmotionTrendPoint(
  at: number,
  counts: EmotionCounts,
  byTrackCounts: Record<string, EmotionCounts>,
): EmotionTrendPoint {
  return {
    at,
    session: emotionShares(counts),
    byTrack: Object.fromEntries(
      Object.entries(byTrackCounts).map(([trackId, trackCounts]) => [trackId, emotionShares(trackCounts)]),
    ),
    validSamples: validEmotionCount(counts),
    unknownSamples: Number.isFinite(counts.UNKNOWN) ? Math.max(0, counts.UNKNOWN) : 0,
  };
}

/** Select at most one current expression per visible track in each sample interval. */
export function takeDueTrackSamples(
  tracks: PersonTrack[],
  expressions: ExpressionReadout[],
  lastSampleAt: Map<number, number>,
  now: number,
  intervalMs = 1_000,
): ExpressionReadout[] {
  const existingIds = new Set(tracks.map((track) => track.id));
  for (const id of lastSampleAt.keys()) {
    if (!existingIds.has(id)) lastSampleAt.delete(id);
  }

  const visibleIds = new Set(tracks.filter((track) => track.visible).map((track) => track.id));
  const due: ExpressionReadout[] = [];
  for (const expression of expressions) {
    if (!visibleIds.has(expression.trackId)) continue;
    const previous = lastSampleAt.get(expression.trackId);
    if (previous !== undefined && now - previous < intervalMs) continue;
    lastSampleAt.set(expression.trackId, now);
    due.push(expression);
  }
  return due;
}

export function formatPersonId(id: number): string {
  return String(Math.max(0, Math.trunc(id))).padStart(3, '0');
}

export function formatSessionDuration(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}
