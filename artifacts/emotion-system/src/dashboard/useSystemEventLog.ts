import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExpressionReadout } from '../tracking/expressionTypes';
import type { ModelStatus } from '../tracking/types';
import type { CameraStatus } from '../camera/useCameraController';
import type { VisualMode } from '../visual-controls/visualControlsTypes';

const MAX_EVENTS = 18;

export interface SystemEvent {
  id: number;
  at: number;
  key: string;
  detail?: string;
  trackId?: number;
  expression?: string;
  level: 'info' | 'error';
}

interface EventLogInput {
  cameraStatus: CameraStatus;
  cameraMessage: string;
  personModelStatus: ModelStatus;
  personModelMessage: string;
  faceModelStatus: ModelStatus;
  faceModelMessage: string;
  personCount: number;
  activeTrackIds: number[];
  expressions: ExpressionReadout[];
  visualStage: VisualMode;
  analysisUpdatedAt: number | null;
  validSamples: number;
}

export function useSystemEventLog(input: EventLogInput): SystemEvent[] {
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const nextId = useRef(0);
  const append = useCallback((
    key: string,
    options: Omit<SystemEvent, 'id' | 'at' | 'key'> = { level: 'info' },
  ) => {
    const at = Date.now();
    setEvents((current) => {
      const latest = current.at(-1);
      if (latest?.key === key && latest.detail === options.detail && at - latest.at < 250) {
        return current;
      }
      return [...current, { id: ++nextId.current, at, key, ...options }].slice(-MAX_EVENTS);
    });
  }, []);

  const previousCamera = useRef<{ status: CameraStatus; message: string }>({
    status: 'idle',
    message: '',
  });
  useEffect(() => {
    const previous = previousCamera.current;
    if (input.cameraStatus === 'live' && previous.status !== 'live') {
      append('Camera stream active');
    } else if (input.cameraStatus === 'error' && (previous.status !== 'error' || previous.message !== input.cameraMessage)) {
      append('Camera error', { detail: input.cameraMessage, level: 'error' });
    } else if (input.cameraStatus === 'idle' && previous.status === 'live') {
      append('Camera stream stopped');
    }
    previousCamera.current = { status: input.cameraStatus, message: input.cameraMessage };
  }, [append, input.cameraMessage, input.cameraStatus]);

  const previousPersonModel = useRef<ModelStatus>('idle');
  useEffect(() => {
    if (input.personModelStatus === 'ready' && previousPersonModel.current !== 'ready') {
      append('Person model ready');
    } else if (input.personModelStatus === 'error' && previousPersonModel.current !== 'error') {
      append('Person model error', { detail: input.personModelMessage, level: 'error' });
    }
    previousPersonModel.current = input.personModelStatus;
  }, [append, input.personModelMessage, input.personModelStatus]);

  const previousFaceModel = useRef<ModelStatus>('idle');
  useEffect(() => {
    if (input.faceModelStatus === 'ready' && previousFaceModel.current !== 'ready') {
      append('Face model ready');
    } else if (input.faceModelStatus === 'error' && previousFaceModel.current !== 'error') {
      append('Face model error', { detail: input.faceModelMessage, level: 'error' });
    }
    previousFaceModel.current = input.faceModelStatus;
  }, [append, input.faceModelMessage, input.faceModelStatus]);

  const previousTracks = useRef(new Set<number>());
  useEffect(() => {
    const active = new Set(input.activeTrackIds);
    for (const id of active) {
      if (!previousTracks.current.has(id)) append('Track ID assigned', { trackId: id, level: 'info' });
    }
    previousTracks.current = active;
  }, [append, input.activeTrackIds]);

  const previousPersonCount = useRef(0);
  useEffect(() => {
    if (input.personCount > 0 && previousPersonCount.current === 0) {
      append('Person detected', { detail: String(input.personCount), level: 'info' });
    } else if (input.personCount > 0 && input.personCount !== previousPersonCount.current) {
      append('Person count changed', { detail: String(input.personCount), level: 'info' });
    } else if (input.personCount === 0 && previousPersonCount.current > 0) {
      append('No tracked people');
    }
    previousPersonCount.current = input.personCount;
  }, [append, input.personCount]);

  const previousExpressions = useRef(new Map<number, string>());
  useEffect(() => {
    const active = new Set(input.activeTrackIds);
    const current = new Map<number, string>();
    for (const expression of input.expressions) {
      if (!active.has(expression.trackId) || expression.label === 'UNKNOWN') continue;
      current.set(expression.trackId, expression.label);
      if (previousExpressions.current.get(expression.trackId) !== expression.label) {
        append('Expression classified', {
          trackId: expression.trackId,
          expression: expression.label,
          level: 'info',
        });
      }
    }
    previousExpressions.current = current;
  }, [append, input.activeTrackIds, input.expressions]);

  const previousStage = useRef(input.visualStage);
  useEffect(() => {
    if (previousStage.current !== input.visualStage) {
      append('Visual stage changed', { detail: input.visualStage, level: 'info' });
    }
    previousStage.current = input.visualStage;
  }, [append, input.visualStage]);

  const previousAnalysisUpdate = useRef<number | null>(null);
  useEffect(() => {
    if (input.analysisUpdatedAt !== null && previousAnalysisUpdate.current !== input.analysisUpdatedAt) {
      append('Analysis updated', {
        detail: String(input.validSamples),
        level: 'info',
      });
    }
    previousAnalysisUpdate.current = input.analysisUpdatedAt;
  }, [append, input.analysisUpdatedAt, input.validSamples]);

  useEffect(() => {
    append('System initialized');
  }, [append]);

  return events;
}
