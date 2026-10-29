import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import type {
  FaceObservation,
  FaceWorkerRequest,
  FaceWorkerResponse,
} from './expressionTypes';

const TASKS_VISION_VERSION = '1.2.0';
const WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';

interface FaceWorkerScope {
  onmessage: ((event: MessageEvent<FaceWorkerRequest>) => void) | null;
  postMessage(message: FaceWorkerResponse): void;
  close(): void;
}

const workerScope = self as unknown as FaceWorkerScope;
let landmarker: FaceLandmarker | null = null;
let loadingLandmarker: Promise<FaceLandmarker> | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message.slice(0, 180)
    : 'Unknown MediaPipe error';
}

async function getLandmarker(): Promise<FaceLandmarker> {
  if (landmarker) return landmarker;
  if (loadingLandmarker) return loadingLandmarker;
  const pending = (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL, true);
    const taskCanvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1) : undefined;
    return FaceLandmarker.createFromOptions(vision, {
      canvas: taskCanvas,
      baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numFaces: 5,
      minFaceDetectionConfidence: 0.45,
      minFacePresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
      outputFaceBlendshapes: true,
    });
  })();
  loadingLandmarker = pending;
  try {
    landmarker = await pending;
    return landmarker;
  } catch (error) {
    if (loadingLandmarker === pending) loadingLandmarker = null;
    throw error;
  }
}

function summarizeFace(
  landmarks: NormalizedLandmark[],
  blendshapes: Record<string, number>,
  blendshapeCount: number,
  invalidBlendshapeCount: number,
  frameWidth: number,
  frameHeight: number,
): FaceObservation {
  const finite = landmarks.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (finite.length < 264) {
    return {
      x: 0, y: 0, width: 0, height: 0, poseReliable: false,
      qualityReason: 'UNRELIABLE_POSE', faceWidthPx: 0, faceHeightPx: 0, analysisSource: 'FULL_FRAME',
      blendshapeCount, invalidBlendshapeCount, blendshapes,
    };
  }

  const minX = Math.min(...finite.map((point) => point.x));
  const minY = Math.min(...finite.map((point) => point.y));
  const maxX = Math.max(...finite.map((point) => point.x));
  const maxY = Math.max(...finite.map((point) => point.y));
  const width = Math.max(0, maxX - minX);
  const height = Math.max(0, maxY - minY);
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const nose = landmarks[1];
  const eyeDelta = (rightEye?.x ?? 0) - (leftEye?.x ?? 0);
  const eyeDistance = Math.abs(eyeDelta);
  const noseRatio = Math.abs(eyeDelta) > 0.0001 && nose
    ? (nose.x - leftEye.x) / eyeDelta
    : -1;
  const eyeSpanToFaceWidth = width > 0 ? eyeDistance / width : 0;
  const inFrame = minX >= -0.015 && minY >= -0.015 && maxX <= 1.015 && maxY <= 1.015;
  const faceWidthPx = Math.round(width * frameWidth);
  const faceHeightPx = Math.round(height * frameHeight);
  const largeEnough = width >= 0.02 && height >= 0.02 && eyeDistance >= 0.008;
  const frontal =
    landmarks.length >= 468 &&
    inFrame &&
    eyeSpanToFaceWidth >= 0.22 &&
    noseRatio >= 0.18 &&
    noseRatio <= 0.82;
  const qualityReason = !largeEnough ? 'FACE_TOO_SMALL' : !frontal ? 'UNRELIABLE_POSE' : null;

  return {
    x: Math.max(0, Math.min(1, minX)),
    y: Math.max(0, Math.min(1, minY)),
    width: Math.max(0, Math.min(1, maxX) - Math.max(0, minX)),
    height: Math.max(0, Math.min(1, maxY) - Math.max(0, minY)),
    poseReliable: qualityReason === null,
    qualityReason,
    faceWidthPx,
    faceHeightPx,
    analysisSource: 'FULL_FRAME',
    blendshapeCount,
    invalidBlendshapeCount,
    blendshapes,
  };
}

function getFaces(
  result: ReturnType<FaceLandmarker['detectForVideo']>,
  frameWidth: number,
  frameHeight: number,
): FaceObservation[] {
  return result.faceLandmarks.map((landmarks, index) => {
    const categories = result.faceBlendshapes[index]?.categories ?? [];
    const validCategories = categories.filter((category) =>
      Boolean(category.categoryName) && Number.isFinite(category.score));
    const blendshapes = Object.fromEntries(
      validCategories.map((category) => [
        category.categoryName,
        Math.max(0, Math.min(1, category.score)),
      ]),
    );
    return summarizeFace(
      landmarks,
      blendshapes,
      categories.length,
      categories.length - validCategories.length,
      frameWidth,
      frameHeight,
    );
  });
}

workerScope.onmessage = async (event) => {
  const message = event.data;
  if (message.type === 'dispose') {
    landmarker?.close();
    landmarker = null;
    loadingLandmarker = null;
    workerScope.close();
    return;
  }
  if (message.type === 'initialize') {
    try {
      await getLandmarker();
      workerScope.postMessage({ type: 'ready' });
    } catch (error) {
      workerScope.postMessage({ type: 'error', message: errorMessage(error) });
    }
    return;
  }
  if (message.type === 'frame') {
    const startedAt = performance.now();
    try {
      const model = await getLandmarker();
      const result = model.detectForVideo(message.frame, message.timestamp);
      workerScope.postMessage({
        type: 'frame',
        requestId: message.requestId,
        faces: getFaces(result, message.frame.width, message.frame.height),
        inferenceTimeMs: performance.now() - startedAt,
      });
    } catch (error) {
      workerScope.postMessage({ type: 'error', message: errorMessage(error) });
    } finally {
      message.frame.close();
    }
  }
};
