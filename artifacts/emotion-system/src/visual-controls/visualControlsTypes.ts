import type { VisualSettings, VisualStage } from '../visualization/visualSettings';

export type PlaybackMode = 'auto' | 'manual';
export type VisualMode = VisualStage;

export interface VisualModeControlsProps {
  playbackMode: PlaybackMode;
  onPlaybackModeChange: (mode: PlaybackMode) => void;
  visualMode: VisualMode;
  onVisualModeChange: (mode: VisualMode) => void;
  settings: VisualSettings;
  savedPresets: string[];
  presetMessage: string;
  presetError: string;
  onGlobalSettingChange: (key: string, value: number) => void;
  onTransitionSettingChange: (key: string, value: number) => void;
  onStageSettingChange: (stage: VisualStage, key: string, value: number | string) => void;
  onResetImageSettings: () => void;
  onResetStage: (stage: VisualStage) => void;
  onSavePreset: (name: string) => void;
  onLoadPreset: (name: string) => void;
  onExportPreset: () => void;
  onImportPreset: (file: File) => void;
  className?: string;
}
