import type { ExpressionReadout } from './expressionTypes';

export function getValidDisplayedScores(expressions: ExpressionReadout[]): number[] {
  const seenTracks = new Set<number>();
  return expressions.flatMap((expression) => {
    if (expression.label === 'UNKNOWN' || seenTracks.has(expression.trackId)) return [];
    const score = expression.score;
    if (
      typeof score !== 'number' ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 1
    ) {
      return [];
    }
    seenTracks.add(expression.trackId);
    return [score];
  });
}

export function averageOfValidScores(sum: number, count: number): number | null {
  return Number.isFinite(sum) && Number.isFinite(count) && count > 0 ? sum / count : null;
}
