import { useEffect, useRef, useState } from 'react';
import type { ExpressionReadout } from './expressionTypes';
import { averageOfValidScores, getValidDisplayedScores } from './sessionScoreMath';

const SCORE_REFRESH_INTERVAL_MS = 10_000;

export interface SessionAverageScore {
  averageScore: number | null;
  validSamples: number;
  lastUpdatedAt: number | null;
}

const EMPTY_STATS: SessionAverageScore = {
  averageScore: null,
  validSamples: 0,
  lastUpdatedAt: null,
};

interface SessionAccumulator {
  lastSequence: number;
  sum: number;
  count: number;
}

/**
 * Tracks one valid, displayed expression score per person per completed
 * Face Landmarker inference. Detection confidence is deliberately excluded.
 */
export function useSessionAverageScore(
  running: boolean,
  inferenceSequence: number,
  expressions: ExpressionReadout[],
): SessionAverageScore {
  const [stats, setStats] = useState<SessionAverageScore>(EMPTY_STATS);
  const accumulatorRef = useRef<SessionAccumulator>({ lastSequence: 0, sum: 0, count: 0 });

  useEffect(() => {
    if (!running) return;

    accumulatorRef.current = { lastSequence: inferenceSequence, sum: 0, count: 0 };
    setStats(EMPTY_STATS);
    const timer = window.setInterval(() => {
      const { sum, count } = accumulatorRef.current;
      setStats({
        averageScore: averageOfValidScores(sum, count),
        validSamples: count,
        lastUpdatedAt: Date.now(),
      });
    }, SCORE_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!running || inferenceSequence <= 0) return;
    const accumulator = accumulatorRef.current;
    if (inferenceSequence === accumulator.lastSequence) return;
    accumulator.lastSequence = inferenceSequence;

    for (const score of getValidDisplayedScores(expressions)) {
      accumulator.sum += score;
      accumulator.count += 1;
    }
  }, [running, inferenceSequence, expressions]);

  return stats;
}
