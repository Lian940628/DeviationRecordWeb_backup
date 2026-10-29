export interface PersonTrack {
  id: number;
  /** Bounding box normalized to the unmirrored source video dimensions. */
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  /** False while the tracker is temporarily retaining an occluded track ID. */
  visible: boolean;
}

export interface TimedPersonTracks {
  time: number;
  tracks: PersonTrack[];
}

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PersonDetectionState {
  tracks: PersonTrack[];
  modelStatus: ModelStatus;
  modelMessage: string;
  personCount: number;
  detectionFps: number;
  activeTrackIds: number[];
}
