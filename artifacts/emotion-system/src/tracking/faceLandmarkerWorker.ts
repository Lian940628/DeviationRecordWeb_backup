import type { FaceWorkerRequest } from './expressionTypes';

let faceWorker: Worker | null = null;

export function getFaceLandmarkerWorker(): Worker {
  if (!faceWorker) {
    faceWorker = new Worker(new URL('./faceLandmarker.worker.ts', import.meta.url), {
      type: 'module',
      name: 'emotion-system-face-landmarker',
    });
  }
  return faceWorker;
}

export function releaseFaceLandmarkerWorker(): void {
  if (!faceWorker) return;
  faceWorker.postMessage({ type: 'dispose' } satisfies FaceWorkerRequest);
  faceWorker = null;
}
