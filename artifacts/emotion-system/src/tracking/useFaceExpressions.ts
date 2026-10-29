import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  classifyBlendshapes,
  getCandidateSupports,
  ExpressionSmoother,
  type ExpressionClassification,
} from './expressionClassifier';
import { associateFacesWithTracks } from './faceAssociation';
import { getHeadRegions } from './faceRegions';
import { getFaceLandmarkerWorker } from './faceLandmarkerWorker';
import type {
  BlendshapeSummary,
  ExpressionReadout,
  FaceDebugRecord,
  FaceExpressionState,
  FaceObservation,
  FaceWorkerRequest,
  FaceWorkerResponse,
  UnknownReason,
} from './expressionTypes';
import type { PersonTrack } from './types';

const FACE_INFERENCE_INTERVAL_MS = 1000 / 8;
const MINIMUM_BLENDSHAPE_COUNT = 30;
const RESULT_EXPIRY_MS = 2000;

function idleFaceState(): FaceExpressionState {
  return {
    modelStatus: 'idle',
    modelMessage: 'Start the camera to load MediaPipe Face Landmarker.',
    detectedFaces: 0,
    inferenceTimeMs: 0,
    lastSuccessfulFaceAt: null,
    unknownReason: 'MODEL_NOT_READY',
    expressions: [],
    faceDiagnostics: [],
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 180);
  return 'Unknown face model error';
}

function getTopFive(blendshapes: Record<string, number>): BlendshapeSummary[] {
  return Object.entries(blendshapes)
    .filter(([, score]) => Number.isFinite(score))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, score]) => ({ name, score: Math.round(score * 1000) / 1000 }));
}

function getBlendshapeIssue(face: FaceObservation): UnknownReason | null {
  if (face.blendshapeCount === 0 || Object.keys(face.blendshapes).length === 0) {
    return 'NO_BLENDSHAPES';
  }
  if (
    face.invalidBlendshapeCount > 0 ||
    face.blendshapeCount < MINIMUM_BLENDSHAPE_COUNT ||
    Object.keys(face.blendshapes).length < MINIMUM_BLENDSHAPE_COUNT
  ) {
    return 'INVALID_BLENDSHAPES';
  }
  return null;
}

function getFrameUnknownReason(
  faces: FaceObservation[],
  expressions: ExpressionReadout[],
): UnknownReason | null {
  if (faces.length === 0) return 'NO_FACE';
  if (expressions.length === 0) return 'NO_PERSON_MATCH';
  if (expressions.some((expression) => expression.label !== 'UNKNOWN')) return null;

  const priority: UnknownReason[] = [
    'NO_BLENDSHAPES',
    'INVALID_BLENDSHAPES',
    'NO_PERSON_MATCH',
    'FACE_TOO_SMALL',
    'UNRELIABLE_POSE',
    'LOW_CLASSIFICATION_CONFIDENCE',
    'SMOOTHING_PENDING',
  ];
  return priority.find((reason) =>
    expressions.some((expression) => expression.unknownReason === reason),
  ) ?? 'LOW_CLASSIFICATION_CONFIDENCE';
}

function faceDebugDetails(face: FaceObservation) {
  return {
    faceWidthPx: face.faceWidthPx,
    faceHeightPx: face.faceHeightPx,
    analysisSource: face.analysisSource,
    candidateSupports: getCandidateSupports(face.blendshapes),
  };
}

function unknownForTrack(
  trackId: number,
  reason: UnknownReason,
  face?: FaceObservation,
  rawLabel: ExpressionReadout['rawLabel'] = 'UNKNOWN',
  rawScore: number | null = null,
): ExpressionReadout {
  return {
    trackId,
    label: 'UNKNOWN',
    rawLabel,
    score: null,
    rawScore,
    matchedPersonId: face ? trackId : null,
    blendshapeCount: face?.blendshapeCount ?? 0,
    topBlendshapes: face ? getTopFive(face.blendshapes) : [],
    unknownReason: reason,
  };
}

function errorReadouts(tracks: PersonTrack[], reason: UnknownReason): ExpressionReadout[] {
  return tracks.map((track) => unknownForTrack(track.id, reason));
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
        unknownReason: 'MODEL_NOT_READY',
      });
      return;
    }

    let cancelled = false;
    let ready = false;
    let busy = false;
    let timer: number | null = null;
    let expiryTimer: number | null = null;
    let requestId = 0;
    let pendingRequestId = 0;
    let lastTimestamp = 0;
    let requestStartedAt = 0;
    let lastWorkerResponseAt = 0;
    let resultExpired = false;
    const smoother = new ExpressionSmoother();

    setState({
      ...idleFaceState(),
      modelStatus: 'loading',
      modelMessage: 'Loading MediaPipe Face Landmarker · local processing…',
      unknownReason: 'MODEL_NOT_READY',
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
        detectedFaces: 0,
        inferenceTimeMs: 0,
        unknownReason: 'MODEL_NOT_READY',
        expressions: errorReadouts(tracksRef.current, 'MODEL_NOT_READY'),
        faceDiagnostics: previous.faceDiagnostics.map((face) => ({
          ...face,
          smoothedExpression: 'UNKNOWN',
          score: null,
          unknownReason: 'MODEL_NOT_READY',
        })),
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
            regions: getHeadRegions(tracksRef.current),
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
        resultExpired = false;
        lastWorkerResponseAt = performance.now();
        setState((previous) => ({
          ...previous,
          modelStatus: 'ready',
          modelMessage: 'MediaPipe Face Landmarker ready · person-head crops · CPU Worker · heuristic expressions',
          unknownReason: 'NO_FACE',
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
      resultExpired = false;
      lastWorkerResponseAt = performance.now();
      const currentTracks = tracksRef.current;
      const activeIds = currentTracks.map((track) => track.id);
      smoother.retain(activeIds);

      try {
        const assignments = associateFacesWithTracks(message.faces, currentTracks);
        const expressions = currentTracks
          .slice()
          .sort((a, b) => a.id - b.id)
          .map((track): ExpressionReadout => {
            const face = track.visible ? assignments.get(track.id) : undefined;
            if (!face) {
              smoother.markUnknown(track.id);
              return unknownForTrack(
                track.id,
                message.faces.length === 0 ? 'NO_FACE' : 'NO_PERSON_MATCH',
              );
            }

            const blendshapeIssue = getBlendshapeIssue(face);
            let raw: ExpressionClassification = { label: 'UNKNOWN', score: null };
            if (!blendshapeIssue && face.poseReliable) {
              raw = classifyBlendshapes(face.blendshapes);
            }

            if (blendshapeIssue) {
              smoother.markUnknown(track.id);
              return unknownForTrack(track.id, blendshapeIssue, face, raw.label, raw.score);
            }
            if (!face.poseReliable) {
              smoother.markUnknown(track.id);
              return unknownForTrack(
                track.id,
                face.qualityReason ?? 'UNRELIABLE_POSE',
                face,
                raw.label,
                raw.score,
              );
            }

            const smoothed = smoother.update(track.id, face.blendshapes);
            const reason: UnknownReason | null =
              smoothed.label === 'UNKNOWN'
                ? raw.label === 'UNKNOWN'
                  ? 'LOW_CLASSIFICATION_CONFIDENCE'
                  : 'SMOOTHING_PENDING'
                : null;
            return {
              trackId: track.id,
              label: smoothed.label,
              rawLabel: raw.label,
              score: smoothed.score,
              rawScore: raw.score,
              matchedPersonId: track.id,
              blendshapeCount: face.blendshapeCount,
              topBlendshapes: getTopFive(face.blendshapes),
              unknownReason: reason,
            };
          });

        const matchedFaceIndex = new Map<number, number>();
        for (const [trackId, face] of assignments) {
          const index = message.faces.indexOf(face);
          if (index >= 0) matchedFaceIndex.set(index, trackId);
        }
        const expressionByTrack = new Map(expressions.map((item) => [item.trackId, item]));
        const faceDiagnostics: FaceDebugRecord[] = message.faces.map((face, index) => {
          const matchedPersonId = matchedFaceIndex.get(index) ?? null;
          const readout = matchedPersonId === null ? undefined : expressionByTrack.get(matchedPersonId);
          const blendshapeIssue = getBlendshapeIssue(face);
          const raw = blendshapeIssue || !face.poseReliable
            ? { label: 'UNKNOWN' as const, score: null as number | null }
            : classifyBlendshapes(face.blendshapes);
          const unknownReason = readout?.unknownReason
            ?? blendshapeIssue
            ?? (!face.poseReliable
              ? face.qualityReason ?? 'UNRELIABLE_POSE'
              : matchedPersonId === null
                ? 'NO_PERSON_MATCH'
                : null);

          return {
            ...faceDebugDetails(face),
            faceNumber: index + 1,
            blendshapeCount: face.blendshapeCount,
            invalidBlendshapeCount: face.invalidBlendshapeCount,
            poseReliable: face.poseReliable,
            topBlendshapes: getTopFive(face.blendshapes),
            rawExpression: readout?.rawLabel ?? raw.label,
            rawScore: readout?.rawScore ?? raw.score,
            smoothedExpression: readout?.label ?? 'UNKNOWN',
            matchedPersonId,
            score: readout?.score ?? null,
            unknownReason,
          };
        });

        const lastSuccessfulFaceAt = message.faces.length > 0
          ? Date.now()
          : undefined;
        setState((previous) => ({
          ...previous,
          modelStatus: 'ready',
          detectedFaces: message.faces.length,
          inferenceTimeMs: message.inferenceTimeMs,
          lastSuccessfulFaceAt: lastSuccessfulFaceAt ?? previous.lastSuccessfulFaceAt,
          unknownReason: getFrameUnknownReason(message.faces, expressions),
          expressions,
          faceDiagnostics,
        }));
      } catch (error) {
        const failedReadouts = errorReadouts(currentTracks, 'CLASSIFIER_ERROR');
        setState((previous) => ({
          ...previous,
          modelStatus: 'ready',
          detectedFaces: message.faces.length,
          inferenceTimeMs: message.inferenceTimeMs,
          unknownReason: 'CLASSIFIER_ERROR',
          expressions: failedReadouts,
          faceDiagnostics: message.faces.map((face, index) => ({
            ...faceDebugDetails(face),
            faceNumber: index + 1,
            blendshapeCount: face.blendshapeCount,
            invalidBlendshapeCount: face.invalidBlendshapeCount,
            poseReliable: face.poseReliable,
            topBlendshapes: getTopFive(face.blendshapes),
            rawExpression: 'UNKNOWN',
            rawScore: null,
            smoothedExpression: 'UNKNOWN',
            matchedPersonId: null,
            score: null,
            unknownReason: 'CLASSIFIER_ERROR',
          })),
          modelMessage: `Classifier error: ${errorMessage(error)}`,
        }));
      }

      schedule(Math.max(0, FACE_INFERENCE_INTERVAL_MS - (performance.now() - requestStartedAt)));
    };

    const handleWorkerError = (event: ErrorEvent) => {
      setError(`Face worker error: ${event.message || 'The worker stopped unexpectedly.'}`);
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleWorkerError);
    worker.postMessage({ type: 'initialize' } satisfies FaceWorkerRequest);

    expiryTimer = window.setInterval(() => {
      if (
        cancelled ||
        !ready ||
        resultExpired ||
        lastWorkerResponseAt === 0 ||
        performance.now() - lastWorkerResponseAt <= RESULT_EXPIRY_MS
      ) {
        return;
      }
      resultExpired = true;
      setState((previous) => ({
        ...previous,
        detectedFaces: 0,
        unknownReason: 'RESULT_EXPIRED',
        expressions: previous.expressions.map((expression) => ({
          ...expression,
          label: 'UNKNOWN',
          score: null,
          unknownReason: 'RESULT_EXPIRED',
        })),
        faceDiagnostics: previous.faceDiagnostics.map((face) => ({
          ...face,
          smoothedExpression: 'UNKNOWN',
          score: null,
          unknownReason: 'RESULT_EXPIRED',
        })),
      }));
    }, 500);

    return () => {
      cancelled = true;
      ready = false;
      clearTimer();
      if (expiryTimer !== null) window.clearInterval(expiryTimer);
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleWorkerError);
      smoother.reset();
    };
  }, [enabled, videoRef]);

  return state;
}
