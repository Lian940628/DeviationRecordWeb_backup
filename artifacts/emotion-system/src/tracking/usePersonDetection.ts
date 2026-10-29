import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { DetectedObject, ObjectDetection } from '@tensorflow-models/coco-ssd';
import { PersonTracker, type PersonObservation } from './personTracker';
import type { PersonDetectionState, TimedPersonTracks } from './types';

const TARGET_DETECTION_INTERVAL_MS = 1000 / 12;
const MINIMUM_PERSON_SCORE = 0.55;

let cachedModel: ObjectDetection | null = null;
let modelPromise: Promise<ObjectDetection> | null = null;
let modelLifecycle = 0;
let activeBackend = 'loading';

async function getCocoSsdModel(): Promise<ObjectDetection> {
  if (cachedModel) return cachedModel;
  if (modelPromise) return modelPromise;

  const lifecycleAtStart = modelLifecycle;
  const pending = (async () => {
    const [tf, cocoSsd] = await Promise.all([
      import('@tensorflow/tfjs'),
      import('@tensorflow-models/coco-ssd'),
    ]);
    await tf.ready();
    const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });

    if (lifecycleAtStart !== modelLifecycle) {
      model.dispose();
      throw new Error('The detection model was released before loading finished.');
    }

    cachedModel = model;
    activeBackend = tf.getBackend() ?? 'unknown';
    return model;
  })();
  modelPromise = pending;

  try {
    return await pending;
  } catch (error) {
    if (modelPromise === pending) modelPromise = null;
    throw error;
  }
}

function seekToVideoTime(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.025) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Could not decode a frame for the local tracking pass.'));
    }, 5000);
    const onSeeked = () => { cleanup(); resolve(); };
    const onError = () => {
      cleanup();
      reject(new Error('Could not decode a frame for the local tracking pass.'));
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.currentTime = time;
  });
}

/** Analyze clip frames before recording, then reuse their short-lived tracks during export. */
export async function analyzeVideoTrackRange(
  video: HTMLVideoElement,
  start: number,
  end: number,
  onProgress: (progress: number) => void,
  isCancelled: () => boolean,
): Promise<TimedPersonTracks[]> {
  const model = await getCocoSsdModel();
  const tracker = new PersonTracker();
  const samples: TimedPersonTracks[] = [];
  let time = start;
  let sampleCount = 0;

  while (time < end && sampleCount < 310) {
    if (isCancelled()) throw new Error('Export cancelled.');
    time = Math.min(end - 0.001, time);
    await seekToVideoTime(video, time);
    if (isCancelled()) throw new Error('Export cancelled.');

    const inferenceStartedAt = performance.now();
    const detections = await model.detect(video, 20, MINIMUM_PERSON_SCORE);
    const inferenceDuration = performance.now() - inferenceStartedAt;
    if (isCancelled()) throw new Error('Export cancelled.');
    const observations = toPersonObservations(detections, video.videoWidth, video.videoHeight);
    samples.push({ time, tracks: tracker.update(observations, time * 1000) });
    const interval = Math.max(0.1, Math.min(0.75, inferenceDuration * 1.15 / 1000));
    time += interval;
    sampleCount += 1;
    onProgress(Math.min(1, (time - start) / (end - start)));
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }

  await seekToVideoTime(video, start);
  return samples;
}

/** Called only when the app itself is leaving; camera stops retain the loaded model for reuse. */
export function releaseCocoSsdModel(): void {
  modelLifecycle += 1;
  cachedModel?.dispose();
  cachedModel = null;
  modelPromise = null;
  activeBackend = 'released';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 180);
  return 'Unknown model error';
}

function toPersonObservations(
  predictions: DetectedObject[],
  frameWidth: number,
  frameHeight: number,
): PersonObservation[] {
  return predictions
    .filter((prediction) => prediction.class === 'person' && prediction.score >= MINIMUM_PERSON_SCORE)
    .map((prediction) => {
      const [left, top, width, height] = prediction.bbox;
      const x = Math.max(0, Math.min(1, left / frameWidth));
      const y = Math.max(0, Math.min(1, top / frameHeight));
      const right = Math.max(x, Math.min(1, (left + width) / frameWidth));
      const bottom = Math.max(y, Math.min(1, (top + height) / frameHeight));
      return {
        x,
        y,
        width: right - x,
        height: bottom - y,
        confidence: prediction.score,
      };
    })
    .filter((person) => person.width > 0 && person.height > 0);
}

function idleState(): PersonDetectionState {
  return {
    tracks: [],
    modelStatus: 'idle',
    modelMessage: 'Start the camera to load the local detection model.',
    personCount: 0,
    detectionFps: 0,
    activeTrackIds: [],
  };
}

export function usePersonDetection(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  requireNewFrame = false,
): PersonDetectionState {
  const [state, setState] = useState<PersonDetectionState>(idleState);

  useEffect(() => {
    if (!enabled) {
      setState(idleState());
      return;
    }

    let cancelled = false;
    let timer: number | null = null;
    const tracker = new PersonTracker();
    setState({
      ...idleState(),
      modelStatus: 'loading',
      modelMessage: 'Loading COCO-SSD · MobileNet V2…',
    });

    const run = async () => {
      try {
        const model = await getCocoSsdModel();
        if (cancelled) return;
        setState((previous) => ({
          ...previous,
          modelStatus: 'ready',
          modelMessage: `COCO-SSD ready · TensorFlow.js ${activeBackend.toUpperCase()} backend`,
        }));

        let fpsWindowStartedAt = performance.now();
        let inferenceCount = 0;
        let lastDetectedMediaTime = -1;

        const inferNextFrame = async () => {
          if (cancelled) return;
          const video = videoRef.current;
          if (
            !video ||
            video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
            video.videoWidth <= 0 ||
            video.videoHeight <= 0
          ) {
            timer = window.setTimeout(() => void inferNextFrame(), 100);
            return;
          }

          const mediaTime = video.currentTime;
          if (requireNewFrame && Math.abs(mediaTime - lastDetectedMediaTime) < 0.001) {
            timer = window.setTimeout(() => void inferNextFrame(), 50);
            return;
          }

          const inferenceStartedAt = performance.now();
          try {
            const predictions = await model.detect(video, 20, MINIMUM_PERSON_SCORE);
            const completedAt = performance.now();
            if (cancelled) return;
            lastDetectedMediaTime = mediaTime;

            const observations = toPersonObservations(predictions, video.videoWidth, video.videoHeight);
            const tracks = tracker.update(observations, completedAt);
            inferenceCount += 1;
            let detectionFps = 0;
            if (completedAt - fpsWindowStartedAt >= 500) {
              detectionFps = inferenceCount * 1000 / (completedAt - fpsWindowStartedAt);
              inferenceCount = 0;
              fpsWindowStartedAt = completedAt;
            }

            setState((previous) => ({
              ...previous,
              tracks,
              personCount: tracks.filter((track) => track.visible).length,
              activeTrackIds: tracks.map((track) => track.id).sort((a, b) => a - b),
              detectionFps: detectionFps || previous.detectionFps,
              modelStatus: 'ready',
            }));

            const duration = completedAt - inferenceStartedAt;
            timer = window.setTimeout(
              () => void inferNextFrame(),
              Math.max(0, TARGET_DETECTION_INTERVAL_MS - duration),
            );
          } catch (error) {
            if (cancelled) return;
            setState({
              ...idleState(),
              modelStatus: 'error',
              modelMessage: `Detection stopped: ${getErrorMessage(error)}`,
            });
          }
        };

        void inferNextFrame();
      } catch (error) {
        if (cancelled) return;
        setState({
          ...idleState(),
          modelStatus: 'error',
          modelMessage: `Could not load COCO-SSD. Check your connection and try starting the camera again. ${getErrorMessage(error)}`,
        });
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      tracker.reset();
    };
  }, [enabled, requireNewFrame, videoRef]);

  return state;
}
