import { useEffect, useRef, useState } from 'react';
import type { ExpressionReadout } from '../tracking/expressionTypes';
import type { PersonTrack } from '../tracking/types';
import {
  createEmptyEmotionCounts,
  incrementEmotionCount,
  incrementTrackEmotionCount,
  makeEmotionTrendPoint,
  takeDueTrackSamples,
  validEmotionCount,
  type EmotionCounts,
  type EmotionTrendPoint,
} from './sessionAnalyticsMath';

const SAMPLE_INTERVAL_MS = 1_000;
const DISPLAY_UPDATE_INTERVAL_MS = 10_000;
const MAX_TREND_POINTS = 12;

export interface SessionAnalyticsSnapshot {
  counts: EmotionCounts;
  byTrack: Record<string, EmotionCounts>;
  trend: EmotionTrendPoint[];
  totalSamples: number;
  validSamples: number;
  unknownSamples: number;
  lastUpdatedAt: number | null;
}

interface Accumulator {
  lastSequence: number;
  counts: EmotionCounts;
  byTrack: Record<string, EmotionCounts>;
  intervalCounts: EmotionCounts;
  intervalByTrack: Record<string, EmotionCounts>;
  trend: EmotionTrendPoint[];
}

const emptySnapshot = (): SessionAnalyticsSnapshot => ({
  counts: createEmptyEmotionCounts(),
  byTrack: {},
  trend: [],
  totalSamples: 0,
  validSamples: 0,
  unknownSamples: 0,
  lastUpdatedAt: null,
});

function createAccumulator(lastSequence: number): Accumulator {
  return {
    lastSequence,
    counts: createEmptyEmotionCounts(),
    byTrack: {},
    intervalCounts: createEmptyEmotionCounts(),
    intervalByTrack: {},
    trend: [],
  };
}

function copyCounts(counts: EmotionCounts): EmotionCounts {
  return { ...counts };
}

function snapshotFrom(accumulator: Accumulator, lastUpdatedAt: number): SessionAnalyticsSnapshot {
  const counts = copyCounts(accumulator.counts);
  return {
    counts,
    byTrack: Object.fromEntries(
      Object.entries(accumulator.byTrack).map(([id, trackCounts]) => [id, copyCounts(trackCounts)]),
    ),
    trend: accumulator.trend.slice(),
    totalSamples: Object.values(counts).reduce((sum, value) => sum + value, 0),
    validSamples: validEmotionCount(counts),
    unknownSamples: counts.UNKNOWN,
    lastUpdatedAt,
  };
}

export function useSessionAnalytics(
  running: boolean,
  inferenceSequence: number,
  tracks: PersonTrack[],
  expressions: ExpressionReadout[],
) {
  const [snapshot, setSnapshot] = useState<SessionAnalyticsSnapshot>(emptySnapshot);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const accumulatorRef = useRef<Accumulator>(createAccumulator(0));
  const lastSampleAtRef = useRef(new Map<number, number>());

  useEffect(() => {
    if (!running) return;

    accumulatorRef.current = createAccumulator(inferenceSequence);
    lastSampleAtRef.current.clear();
    setSnapshot(emptySnapshot());
    setDurationSeconds(0);

    const startedAt = performance.now();
    const durationTimer = window.setInterval(() => {
      setDurationSeconds(Math.floor((performance.now() - startedAt) / 1_000));
    }, 1_000);
    const displayTimer = window.setInterval(() => {
      const accumulator = accumulatorRef.current;
      accumulator.trend = [
        ...accumulator.trend,
        makeEmotionTrendPoint(
          Date.now(),
          accumulator.intervalCounts,
          accumulator.intervalByTrack,
        ),
      ].slice(-MAX_TREND_POINTS);
      accumulator.intervalCounts = createEmptyEmotionCounts();
      accumulator.intervalByTrack = {};
      setSnapshot(snapshotFrom(accumulator, Date.now()));
    }, DISPLAY_UPDATE_INTERVAL_MS);

    return () => {
      window.clearInterval(durationTimer);
      window.clearInterval(displayTimer);
    };
  }, [running]);

  useEffect(() => {
    if (!running || inferenceSequence <= 0) return;
    const accumulator = accumulatorRef.current;
    if (inferenceSequence === accumulator.lastSequence) return;
    accumulator.lastSequence = inferenceSequence;

    const dueSamples = takeDueTrackSamples(
      tracks,
      expressions,
      lastSampleAtRef.current,
      performance.now(),
      SAMPLE_INTERVAL_MS,
    );
    for (const expression of dueSamples) {
      accumulator.counts = incrementEmotionCount(accumulator.counts, expression.label);
      accumulator.intervalCounts = incrementEmotionCount(accumulator.intervalCounts, expression.label);
      incrementTrackEmotionCount(accumulator.byTrack, expression.trackId, expression.label);
      incrementTrackEmotionCount(accumulator.intervalByTrack, expression.trackId, expression.label);
    }
  }, [running, inferenceSequence, tracks, expressions]);

  return { ...snapshot, durationSeconds };
}
