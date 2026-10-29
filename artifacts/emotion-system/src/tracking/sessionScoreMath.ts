import type { ExpressionReadout } from './expressionTypes';

export function getValidDisplayedScores(expressions: ExpressionReadout[]): number[] {
  return expressions.flatMap((expression) => {
    const score = expression.score;
    return typeof score === 'number' && Number.isFinite(score) ? [score] : [];
  });
}

export function averageOfValidScores(sum: number, count: number): number | null {
  return Number.isFinite(sum) && Number.isFinite(count) && count > 0 ? sum / count : null;
}
