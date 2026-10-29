import type { ExpressionReadout } from './expressionTypes';

export function expressionDisplayForTrack(
  trackId: number,
  expressions: ExpressionReadout[],
): { label: string; score: string } {
  const expression = expressions.find((item) => item.trackId === trackId);
  return {
    label: expression?.label ?? 'UNKNOWN',
    score: Number.isFinite(expression?.score) ? (expression?.score as number).toFixed(2) : '—',
  };
}
