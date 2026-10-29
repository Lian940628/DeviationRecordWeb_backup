import type { ExpressionLabel } from './expressionTypes';

type EmotionLabel = Exclude<ExpressionLabel, 'UNKNOWN'>;
type EmotionSignals = Record<EmotionLabel, number>;
type NonNeutralLabel = Exclude<EmotionLabel, 'NEUTRAL'>;

export interface ExpressionClassification {
  label: ExpressionLabel;
  score: number | null;
}

const EMA_ALPHA = 0.55;
const LABEL_CONFIRMATION_FRAMES = 2;
const MAX_AMBIGUOUS_FRAMES = 6;
const MIN_SUPPORT: Record<NonNeutralLabel, number> = {
  HAPPY: 0.24,
  SAD: 0.12,
  ANGRY: 0.14,
  SURPRISED: 0.25,
};
const MIN_CLASS_MARGIN = 0.04;

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
  const noseSneer = averagePair(blendshapes, 'noseSneerLeft', 'noseSneerRight');
  const browInnerUp = clamp(blendshapes.browInnerUp ?? 0);
  const jawOpen = clamp(blendshapes.jawOpen ?? 0);

  const happy = clamp(smile * 0.76 + cheekSquint * 0.24);
  const sad = clamp(frown * 0.55 + browInnerUp * 0.45);
  // Anger-looking faces do not necessarily activate all three secondary
  // actions. Require brow lowering + one corroborating action instead.
  const angry = clamp(browDown * 0.60 + Math.max(eyeSquint, mouthPress, noseSneer) * 0.40);
  const surprised = clamp(eyeWide * 0.43 + jawOpen * 0.37 + browInnerUp * 0.20);
  const strongestAction = Math.max(
    smile,
    cheekSquint,
    frown,
    browDown,
    eyeSquint,
    mouthPress,
    eyeWide,
    noseSneer,
    browInnerUp,
    jawOpen,
  );

  return {
    HAPPY: happy,
    SAD: sad,
    ANGRY: angry,
    SURPRISED: surprised,
    // Neutral support is based on the strongest raw facial-action cue, not a
    // complement of the weighted expression score shown for other labels.
    NEUTRAL: 1 - strongestAction,
  };
}

/** A relative display index with a fixed boundary at 0.50, not a probability. */
function displayRuleIndex(label: EmotionLabel, signals: EmotionSignals): number {
  return label === 'NEUTRAL'
    ? signals.NEUTRAL * 0.5
    : 0.5 + signals[label] * 0.5;
}

function hasSadCues(blendshapes: Record<string, number>): boolean {
  const frown = averagePair(blendshapes, 'mouthFrownLeft', 'mouthFrownRight');
  const innerBrow = clamp(blendshapes.browInnerUp ?? 0);
  const bilateralFrown = Math.min(clamp(blendshapes.mouthFrownLeft), clamp(blendshapes.mouthFrownRight));
  return (frown >= 0.07 && innerBrow >= 0.07) ||
    (bilateralFrown >= 0.27 && averagePair(blendshapes, 'browDownLeft', 'browDownRight') < 0.35);
}

function hasAngryCues(blendshapes: Record<string, number>): boolean {
  const browDown = averagePair(blendshapes, 'browDownLeft', 'browDownRight');
  const otherCues = [
    averagePair(blendshapes, 'eyeSquintLeft', 'eyeSquintRight'),
    averagePair(blendshapes, 'mouthPressLeft', 'mouthPressRight'),
    averagePair(blendshapes, 'noseSneerLeft', 'noseSneerRight'),
  ];
  return browDown >= 0.12 && otherCues.some((score) => score >= 0.06);
}

export function getCandidateSupports(blendshapes: Record<string, number>) {
  const signals = getEmotionSignals(blendshapes);
  return (['SAD', 'ANGRY'] as const).map((label) => ({
    label,
    score: signals[label],
    minimum: MIN_SUPPORT[label],
    cuesSatisfied: label === 'SAD' ? hasSadCues(blendshapes) : hasAngryCues(blendshapes),
    cues: label === 'SAD'
      ? [
        { name: 'frown', score: averagePair(blendshapes, 'mouthFrownLeft', 'mouthFrownRight') },
        { name: 'inner brow', score: clamp(blendshapes.browInnerUp) },
      ]
      : [
        { name: 'brow down', score: averagePair(blendshapes, 'browDownLeft', 'browDownRight') },
        { name: 'squint', score: averagePair(blendshapes, 'eyeSquintLeft', 'eyeSquintRight') },
        { name: 'press', score: averagePair(blendshapes, 'mouthPressLeft', 'mouthPressRight') },
        { name: 'sneer', score: averagePair(blendshapes, 'noseSneerLeft', 'noseSneerRight') },
      ],
  }));
}

export function classifyBlendshapes(blendshapes: Record<string, number>): ExpressionClassification {
  const signals = getEmotionSignals(blendshapes);
  const strongest = strongestNonNeutral(signals);

  const minimumSupport = MIN_SUPPORT[strongest.label as NonNeutralLabel];
  const hasRequiredCues =
    (strongest.label !== 'SAD' || hasSadCues(blendshapes)) &&
    (strongest.label !== 'ANGRY' || hasAngryCues(blendshapes));

  if (strongest.score >= minimumSupport && strongest.margin >= MIN_CLASS_MARGIN && hasRequiredCues) {
    return {
      label: strongest.label,
      score: Math.round(displayRuleIndex(strongest.label, signals) * 100) / 100,
    };
  }

  // Keep the previously working low-activity neutral path. Only expressions
  // that pass their explicit cue checks can override this neutral fallback.
  if (strongest.score <= 0.20) {
    return { label: 'NEUTRAL', score: Math.round(displayRuleIndex('NEUTRAL', signals) * 100) / 100 };
  }
  return { label: 'UNKNOWN', score: null };
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
  return Math.round(displayRuleIndex(label, signals) * 100) / 100;
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
