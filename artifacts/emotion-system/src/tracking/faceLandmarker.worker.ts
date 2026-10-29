import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import type {
  FaceObservation,
  FaceRegion,
  FaceWorkerRequest,
  FaceWorkerResponse,
} from './expressionTypes';
import { deduplicateFaces, mapCropPoint } from './faceRegions';

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
let cropCanvas: OffscreenCanvas | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message.slice(0, 180)
    : 'Unknown MediaPipe error';
}

async function getLandmarker(): Promise<FaceLandmarker> {
  if (landmarker) return landmarker;
  if (loadingLandmarker) return loadingLandmarker;

  const pending = (async () => {
    // Module workers cannot publish a classic script's top-level `var ModuleFactory`
    // to self. Use MediaPipe's ES-module loader, which explicitly sets globalThis.
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL, true);
    const taskCanvas = typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(1, 1)
      : undefined;
    return FaceLandmarker.createFromOptions(vision, {
      canvas: taskCanvas,
      baseOptions: {
        modelAssetPath: FACE_MODEL_URL,
        delegate: 'CPU',
      },
      // Independent head crops are separate images, not one continuous video.
      // IMAGE avoids carrying MediaPipe's internal ROI state between people;
      // our person tracker and per-ID expression smoother retain temporal state.
      runningMode: 'IMAGE',
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
  analysisSource: FaceObservation['analysisSource'],
  cropContained: boolean,
): FaceObservation {
  const finite = landmarks.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (finite.length < 264) {
    return {
      x: 0, y: 0, width: 0, height: 0, poseReliable: false,
      qualityReason: 'UNRELIABLE_POSE', faceWidthPx: 0, faceHeightPx: 0, analysisSource,
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
  // Use actual source pixels, not the resized crop's apparent size.
  const largeEnough = faceWidthPx >= 32 && faceHeightPx >= 32 && eyeDistance * frameWidth >= 10;
  const frontal =
    landmarks.length >= 468 &&
    inFrame && cropContained &&
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
    analysisSource,
    blendshapeCount,
    invalidBlendshapeCount,
    blendshapes,
  };
}

function getFaces(
  result: ReturnType<FaceLandmarker['detect']>,
  region: FaceRegion,
  frameWidth: number,
  frameHeight: number,
  analysisSource: FaceObservation['analysisSource'],
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
    const cropContained = landmarks.every((point) =>
      point.x >= -0.03 && point.x <= 1.03 && point.y >= -0.03 && point.y <= 1.03);
    return summarizeFace(
      landmarks.map((point) => mapCropPoint(point, region)),
      blendshapes, categories.length, categories.length - validCategories.length,
      frameWidth, frameHeight, analysisSource, cropContained,
    );
  });
}

function analyzeFrame(model: FaceLandmarker, frame: ImageBitmap, regions: FaceRegion[]): FaceObservation[] {
  const faces: FaceObservation[] = [];
  if (regions.length > 0) {
    if (typeof OffscreenCanvas !== 'function') {
      throw new Error('Head-region analysis requires OffscreenCanvas support in this browser.');
    }
    cropCanvas ??= new OffscreenCanvas(1, 1);
    for (const region of regions.slice(0, 5)) {
      const left = Math.max(0, Math.floor(region.x * frame.width));
      const top = Math.max(0, Math.floor(region.y * frame.height));
      const width = Math.min(frame.width - left, Math.ceil(region.width * frame.width));
      const height = Math.min(frame.height - top, Math.ceil(region.height * frame.height));
      if (width <= 0 || height <= 0) continue;
      const scale = Math.min(1, 640 / Math.max(width, height));
      cropCanvas.width = Math.max(1, Math.round(width * scale));
      cropCanvas.height = Math.max(1, Math.round(height * scale));
      const context = cropCanvas.getContext('2d');
      if (!context) throw new Error('Could not create the local head-region canvas.');
      context.drawImage(frame, left, top, width, height, 0, 0, cropCanvas.width, cropCanvas.height);
      const actualRegion = {
        x: left / frame.width, y: top / frame.height,
        width: width / frame.width, height: height / frame.height,
      };
      faces.push(...getFaces(model.detect(cropCanvas), actualRegion, frame.width, frame.height, 'PERSON_CROP'));
    }
  }
  // A real full-frame scan is still available before any person is tracked or
  // when no crop contains a detectable face. No synthetic result is substituted.
  if (faces.length === 0) {
    faces.push(...getFaces(
      model.detect(frame), { x: 0, y: 0, width: 1, height: 1 },
      frame.width, frame.height, 'FULL_FRAME',
    ));
  }
  return deduplicateFaces(faces);
}

workerScope.onmessage = async (event) => {
  const message = event.data;
  if (message.type === 'dispose') {
    landmarker?.close();
    landmarker = null;
    loadingLandmarker = null;
    cropCanvas = null;
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
      const faces = analyzeFrame(model, message.frame, message.regions);
      workerScope.postMessage({
        type: 'frame',
        requestId: message.requestId,
        faces,
        inferenceTimeMs: performance.now() - startedAt,
      });
    } catch (error) {
      workerScope.postMessage({ type: 'error', message: errorMessage(error) });
    } finally {
      message.frame.close();
    }
  }
};
