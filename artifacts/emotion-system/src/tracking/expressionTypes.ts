import type { ModelStatus } from './types';

export type ExpressionLabel =
  | 'HAPPY'
  | 'SAD'
  | 'ANGRY'
  | 'SURPRISED'
  | 'NEUTRAL'
  | 'UNKNOWN';

export interface ExpressionReadout {
  trackId: number;
  label: ExpressionLabel;
  /** Weighted blendshape support in [0, 1], not a calibrated emotion probability. */
  score: number | null;
}

export interface FaceObservation {
  x: number;
  y: number;
  width: number;
  height: number;
  poseReliable: boolean;
  blendshapes: Record<string, number>;
}

export interface FaceExpressionState {
  modelStatus: ModelStatus;
  modelMessage: string;
  detectedFaces: number;
  inferenceTimeMs: number;
  expressions: ExpressionReadout[];
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
