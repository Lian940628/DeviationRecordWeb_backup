import type { ExpressionLabel } from './expressionTypes';

type EmotionLabel = Exclude<ExpressionLabel, 'UNKNOWN'>;
type EmotionSignals = Record<EmotionLabel, number>;

export interface ExpressionClassification {
  label: ExpressionLabel;
  score: number | null;
}

const EMA_ALPHA = 0.42;
const LABEL_CONFIRMATION_FRAMES = 3;
const MAX_AMBIGUOUS_FRAMES = 2;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function averagePair(scores: Record<string, number>, left: string, right: string): number {
  return (clamp(scores[left] ?? 0) + clamp(scores[right] ?? 0)) / 2;
}

function strongestNonNeutral(signals: EmotionSignals): { label: EmotionLabel; score: number; margin: number } {
  const candidates = (Object.entries(signals) as [EmotionLabel, number][])
    .filter(([label]) => label !== 'NEUTRAL')
    .sort((a, b) => b[1] - a[1]);
  const [winner] = candidates;
  const runnerUp = candidates[1];
  return {
    label: winner?.[0] ?? 'NEUTRAL',
    score: winner?.[1] ?? 0,
    margin: (winner?.[1] ?? 0) - (runnerUp?.[1] ?? 0),
  };
}

/** Blendshape-weighted cues; these values are rule-based support, not probabilities. */
export function getEmotionSignals(blendshapes: Record<string, number>): EmotionSignals {
  const smile = averagePair(blendshapes, 'mouthSmileLeft', 'mouthSmileRight');
  const cheekSquint = averagePair(blendshapes, 'cheekSquintLeft', 'cheekSquintRight');
  const frown = averagePair(blendshapes, 'mouthFrownLeft', 'mouthFrownRight');
  const browDown = averagePair(blendshapes, 'browDownLeft', 'browDownRight');
  const eyeSquint = averagePair(blendshapes, 'eyeSquintLeft', 'eyeSquintRight');
  const mouthPress = averagePair(blendshapes, 'mouthPressLeft', 'mouthPressRight');
  const eyeWide = averagePair(blendshapes, 'eyeWideLeft', 'eyeWideRight');
  const browInnerUp = clamp(blendshapes.browInnerUp ?? 0);
  const jawOpen = clamp(blendshapes.jawOpen ?? 0);

  const happy = clamp(smile * 0.76 + cheekSquint * 0.24);
  const sad = clamp(frown * 0.68 + browInnerUp * 0.32);
  const angry = clamp(browDown * 0.46 + eyeSquint * 0.29 + mouthPress * 0.25);
  const surprised = clamp(eyeWide * 0.43 + jawOpen * 0.37 + browInnerUp * 0.20);
  const strongest = Math.max(happy, sad, angry, surprised);

  return {
    HAPPY: happy,
    SAD: sad,
    ANGRY: angry,
    SURPRISED: surprised,
    // Neutrality is defined as the absence of strong non-neutral cues.
    NEUTRAL: 1 - strongest,
  };
}

export function classifyBlendshapes(blendshapes: Record<string, number>): ExpressionClassification {
  const signals = getEmotionSignals(blendshapes);
  const strongest = strongestNonNeutral(signals);

  if (strongest.score <= 0.20) {
    return { label: 'NEUTRAL', score: Math.round(signals.NEUTRAL * 100) / 100 };
  }

  if (strongest.score < 0.35 || strongest.margin < 0.08) {
    return { label: 'UNKNOWN', score: null };
  }

  return {
    label: strongest.label,
    score: Math.round(strongest.score * 100) / 100,
  };
}

interface SmoothingMemory {
  blendshapes: Record<string, number>;
  stableLabel: ExpressionLabel;
  pendingLabel: ExpressionLabel | null;
  pendingFrames: number;
  ambiguousFrames: number;
}

function unknownClassification(): ExpressionClassification {
  return { label: 'UNKNOWN', score: null };
}

function scoreForLabel(label: ExpressionLabel, blendshapes: Record<string, number>): number | null {
  if (label === 'UNKNOWN') return null;
  const signals = getEmotionSignals(blendshapes);
  return Math.round(signals[label] * 100) / 100;
}

/** Keeps separate short-lived temporal state for each person-track ID. */
export class ExpressionSmoother {
  private readonly memories = new Map<number, SmoothingMemory>();

  reset(): void {
    this.memories.clear();
  }

  retain(trackIds: number[]): void {
    const active = new Set(trackIds);
    for (const id of this.memories.keys()) {
      if (!active.has(id)) this.memories.delete(id);
    }
  }

  markUnknown(trackId: number): ExpressionClassification {
    const memory = this.memories.get(trackId);
    if (memory) {
      memory.stableLabel = 'UNKNOWN';
      memory.pendingLabel = null;
      memory.pendingFrames = 0;
      memory.ambiguousFrames = 0;
    }
    return unknownClassification();
  }

  update(trackId: number, blendshapes: Record<string, number>): ExpressionClassification {
    let memory = this.memories.get(trackId);
    if (!memory) {
      memory = {
        blendshapes: {},
        stableLabel: 'UNKNOWN',
        pendingLabel: null,
        pendingFrames: 0,
        ambiguousFrames: 0,
      };
      this.memories.set(trackId, memory);
    }

    const names = new Set([...Object.keys(memory.blendshapes), ...Object.keys(blendshapes)]);
    for (const name of names) {
      const previous = memory.blendshapes[name] ?? 0;
      const current = clamp(blendshapes[name] ?? 0);
      memory.blendshapes[name] = previous * (1 - EMA_ALPHA) + current * EMA_ALPHA;
    }

    const candidate = classifyBlendshapes(memory.blendshapes);
    if (candidate.label === 'UNKNOWN') {
      memory.ambiguousFrames += 1;
      memory.pendingLabel = null;
      memory.pendingFrames = 0;
      if (memory.stableLabel !== 'UNKNOWN' && memory.ambiguousFrames <= MAX_AMBIGUOUS_FRAMES) {
        return {
          label: memory.stableLabel,
          score: scoreForLabel(memory.stableLabel, memory.blendshapes),
        };
      }
      memory.stableLabel = 'UNKNOWN';
      return unknownClassification();
    }

    memory.ambiguousFrames = 0;
    if (candidate.label === memory.stableLabel) {
      memory.pendingLabel = null;
      memory.pendingFrames = 0;
      return candidate;
    }

    if (candidate.label === memory.pendingLabel) {
      memory.pendingFrames += 1;
    } else {
      memory.pendingLabel = candidate.label;
      memory.pendingFrames = 1;
    }

    if (memory.pendingFrames >= LABEL_CONFIRMATION_FRAMES) {
      memory.stableLabel = candidate.label;
      memory.pendingLabel = null;
      memory.pendingFrames = 0;
      return candidate;
    }

    if (memory.stableLabel !== 'UNKNOWN') {
      return {
        label: memory.stableLabel,
        score: scoreForLabel(memory.stableLabel, memory.blendshapes),
      };
    }
    return unknownClassification();
  }
}
