import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { ExpressionSmoother } from './expressionClassifier';
import { associateFacesWithTracks } from './faceAssociation';
import { getFaceLandmarkerWorker } from './faceLandmarkerWorker';
import type {
  FaceExpressionState,
  FaceWorkerRequest,
  FaceWorkerResponse,
} from './expressionTypes';
import type { PersonTrack } from './types';

const FACE_INFERENCE_INTERVAL_MS = 1000 / 8;
const MINIMUM_BLENDSHAPE_COUNT = 30;

function idleFaceState(): FaceExpressionState {
  return {
    modelStatus: 'idle',
    modelMessage: 'Start the camera to load MediaPipe Face Landmarker.',
    detectedFaces: 0,
    inferenceTimeMs: 0,
    expressions: [],
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 180);
  return 'Unknown face model error';
}

export function useFaceExpressions(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  tracks: PersonTrack[],
): FaceExpressionState {
  const [state, setState] = useState<FaceExpressionState>(idleFaceState);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;

  useEffect(() => {
    if (!enabled) {
      setState(idleFaceState());
      return;
    }

    let worker: Worker;
    try {
      worker = getFaceLandmarkerWorker();
    } catch (error) {
      setState({
        ...idleFaceState(),
        modelStatus: 'error',
        modelMessage: `Could not start face worker: ${errorMessage(error)}`,
      });
      return;
    }

    let cancelled = false;
    let ready = false;
    let busy = false;
    let timer: number | null = null;
    let requestId = 0;
    let pendingRequestId = 0;
    let lastTimestamp = 0;
    let requestStartedAt = 0;
    const smoother = new ExpressionSmoother();

    setState({
      ...idleFaceState(),
      modelStatus: 'loading',
      modelMessage: 'Loading MediaPipe Face Landmarker · local processing…',
    });

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const setError = (message: string) => {
      if (cancelled) return;
      ready = false;
      busy = false;
      clearTimer();
      setState((previous) => ({
        ...previous,
        modelStatus: 'error',
        modelMessage: message,
      }));
    };

    const schedule = (delay = FACE_INFERENCE_INTERVAL_MS) => {
      clearTimer();
      if (!cancelled && ready) {
        timer = window.setTimeout(() => void requestFrame(), Math.max(0, delay));
      }
    };

    const requestFrame = async () => {
      if (cancelled || !ready || busy) return;
      const video = videoRef.current;
      if (
        !video ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth <= 0 ||
        video.videoHeight <= 0
      ) {
        schedule(100);
        return;
      }

      if (typeof createImageBitmap !== 'function') {
        setError('This browser does not support local face-frame transfer.');
        return;
      }

      busy = true;
      requestStartedAt = performance.now();
      try {
        const frame = await createImageBitmap(video);
        if (cancelled) {
          frame.close();
          busy = false;
          return;
        }
        requestId += 1;
        pendingRequestId = requestId;
        lastTimestamp = Math.max(lastTimestamp + 1, performance.now());
        worker.postMessage(
          {
            type: 'frame',
            requestId,
            timestamp: lastTimestamp,
            frame,
          } satisfies FaceWorkerRequest,
          [frame],
        );
      } catch (error) {
        setError(`Could not prepare a local video frame: ${errorMessage(error)}`);
      }
    };

    const handleMessage = (event: MessageEvent<FaceWorkerResponse>) => {
      if (cancelled) return;
      const message = event.data;

      if (message.type === 'ready') {
        ready = true;
        setState((previous) => ({
          ...previous,
          modelStatus: 'ready',
          modelMessage: 'MediaPipe Face Landmarker ready · CPU Worker · heuristic expressions',
        }));
        schedule(0);
        return;
      }

      if (message.type === 'error') {
        setError(`Face analysis stopped: ${message.message}`);
        return;
      }

      if (message.requestId !== pendingRequestId) return;
      busy = false;
      const currentTracks = tracksRef.current;
      const activeIds = currentTracks.map((track) => track.id);
      smoother.retain(activeIds);
      const assignments = associateFacesWithTracks(message.faces, currentTracks);
      const expressions = currentTracks
        .slice()
        .sort((a, b) => a.id - b.id)
        .map((track) => {
          const face = track.visible ? assignments.get(track.id) : undefined;
          if (!face?.poseReliable || Object.keys(face.blendshapes).length < MINIMUM_BLENDSHAPE_COUNT) {
            return smoother.markUnknown(track.id);
          }
          return smoother.update(track.id, face.blendshapes);
        });

      setState((previous) => ({
        ...previous,
        modelStatus: 'ready',
        detectedFaces: message.faces.length,
        inferenceTimeMs: message.inferenceTimeMs,
        expressions,
      }));

      schedule(Math.max(0, FACE_INFERENCE_INTERVAL_MS - (performance.now() - requestStartedAt)));
    };

    const handleWorkerError = (event: ErrorEvent) => {
      setError(`Face worker error: ${event.message || 'The worker stopped unexpectedly.'}`);
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleWorkerError);
    worker.postMessage({ type: 'initialize' } satisfies FaceWorkerRequest);

    return () => {
      cancelled = true;
      ready = false;
      clearTimer();
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleWorkerError);
      smoother.reset();
    };
  }, [enabled, videoRef]);

  return state;
}
