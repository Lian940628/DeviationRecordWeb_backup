import type { VisualSettings, VisualStage } from '../visualization/visualSettings';
import type { HudSettings } from '../dashboard/useHudSettings';
import type { ScanEffectSettings } from '../dashboard/BiometricDashboard';

export type PlaybackMode = 'auto' | 'manual';
export type VisualMode = VisualStage;

export interface VisualModeControlsProps {
  playbackMode: PlaybackMode;
  onPlaybackModeChange: (mode: PlaybackMode) => void;
  visualMode: VisualMode;
  onVisualModeChange: (mode: VisualMode) => void;
  settings: VisualSettings;
  hudSettings: HudSettings;
  onHudSettingChange: (next: Partial<HudSettings>) => void;
  scanSettings: ScanEffectSettings;
  onScanSettingsChange: (next: Partial<ScanEffectSettings>) => void;
  savedPresets: string[];
  presetMessage: string;
  presetError: string;
  onGlobalSettingChange: (key: string, value: number) => void;
  onTransitionSettingChange: (key: string, value: number) => void;
  onStageSettingChange: (stage: VisualStage, key: string, value: number | string | boolean) => void;
  onAudioSettingChange: (key: string, value: number | boolean) => void;
  onAudioUnlock: () => void;
  onResetImageSettings: () => void;
  onResetStage: (stage: VisualStage) => void;
  onSavePreset: (name: string) => void;
  onLoadPreset: (name: string) => void;
  onExportPreset: () => void;
  onImportPreset: (file: File) => void;
  className?: string;
}
