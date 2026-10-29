import type { ModelStatus } from './types';

export type ExpressionLabel =
  | 'HAPPY'
  | 'SAD'
  | 'ANGRY'
  | 'SURPRISED'
  | 'NEUTRAL'
  | 'UNKNOWN';

export type UnknownReason =
  | 'MODEL_NOT_READY'
  | 'NO_FACE'
  | 'NO_BLENDSHAPES'
  | 'INVALID_BLENDSHAPES'
  | 'NO_PERSON_MATCH'
  | 'FACE_TOO_SMALL'
  | 'UNRELIABLE_POSE'
  | 'LOW_CLASSIFICATION_CONFIDENCE'
  | 'RESULT_EXPIRED'
  | 'CLASSIFIER_ERROR'
  | 'SMOOTHING_PENDING';

export interface BlendshapeSummary {
  name: string;
  score: number;
}

export interface ExpressionReadout {
  trackId: number;
  label: ExpressionLabel;
  rawLabel: ExpressionLabel;
  /** Relative heuristic rule index; 0.50 separates neutral from an active expression. Not a probability. */
  score: number | null;
  rawScore: number | null;
  matchedPersonId: number | null;
  blendshapeCount: number;
  topBlendshapes: BlendshapeSummary[];
  unknownReason: UnknownReason | null;
}

export interface FaceDebugRecord {
  faceNumber: number;
  blendshapeCount: number;
  invalidBlendshapeCount: number;
  poseReliable: boolean;
  faceWidthPx: number;
  faceHeightPx: number;
  analysisSource: 'FULL_FRAME';
  candidateSupports: {
    label: string;
    score: number;
    minimum: number;
    cuesSatisfied: boolean;
    cues: BlendshapeSummary[];
  }[];
  topBlendshapes: BlendshapeSummary[];
  rawExpression: ExpressionLabel;
  rawScore: number | null;
  smoothedExpression: ExpressionLabel;
  matchedPersonId: number | null;
  score: number | null;
  unknownReason: UnknownReason | null;
}

export interface FaceObservation {
  x: number;
  y: number;
  width: number;
  height: number;
  poseReliable: boolean;
  qualityReason: 'FACE_TOO_SMALL' | 'UNRELIABLE_POSE' | null;
  faceWidthPx: number;
  faceHeightPx: number;
  analysisSource: 'FULL_FRAME';
  blendshapeCount: number;
  invalidBlendshapeCount: number;
  blendshapes: Record<string, number>;
}

export interface FaceExpressionState {
  modelStatus: ModelStatus;
  modelMessage: string;
  detectedFaces: number;
  inferenceTimeMs: number;
  lastSuccessfulFaceAt: number | null;
  unknownReason: UnknownReason | null;
  expressions: ExpressionReadout[];
  faceDiagnostics: FaceDebugRecord[];
}

export interface FaceWorkerInitializeMessage {
  type: 'initialize';
}

export interface FaceWorkerFrameMessage {
  type: 'frame';
  requestId: number;
  timestamp: number;
  frame: ImageBitmap;
}

export interface FaceWorkerDisposeMessage {
  type: 'dispose';
}

export type FaceWorkerRequest =
  | FaceWorkerInitializeMessage
  | FaceWorkerFrameMessage
  | FaceWorkerDisposeMessage;

export type FaceWorkerResponse =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | {
      type: 'frame';
      requestId: number;
      faces: FaceObservation[];
      inferenceTimeMs: number;
    };
