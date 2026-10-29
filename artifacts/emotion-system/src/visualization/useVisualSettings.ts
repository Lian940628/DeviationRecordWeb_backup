import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_VISUAL_SETTINGS,
  GLOBAL_SETTING_RANGES,
  normalizeVisualSettings,
  parseVisualPreset,
  STAGE_SETTING_RANGES,
  TRANSITION_SETTING_RANGES,
  type GlobalImageSettings,
  type StageSettings,
  type VisualSettings,
  type VisualStage,
} from './visualSettings';

const PRESETS_STORAGE_KEY = 'emotion-system.visual-presets.v1';

function readSavedPresets(): Record<string, VisualSettings> {
  try {
    const stored = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([name, value]) => name.trim() && value && typeof value === 'object')
        .map(([name, value]) => [name, normalizeVisualSettings(value)]),
    );
  } catch {
    return {};
  }
}

export function useVisualSettings() {
  const [settings, setSettings] = useState<VisualSettings>(DEFAULT_VISUAL_SETTINGS);
  const [savedPresets, setSavedPresets] = useState<Record<string, VisualSettings>>(readSavedPresets);
  const [presetMessage, setPresetMessage] = useState('');
  const [presetError, setPresetError] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(savedPresets));
    } catch {
      setPresetError('Presets could not be saved in this browser.');
    }
  }, [savedPresets]);

  const onGlobalSettingChange = useCallback((key: string, value: number) => {
    if (!(key in GLOBAL_SETTING_RANGES) || !Number.isFinite(value)) return;
    const typedKey = key as keyof GlobalImageSettings;
    const range = GLOBAL_SETTING_RANGES[typedKey];
    setSettings((current) => normalizeVisualSettings({
      ...current,
      global: {
        ...current.global,
        [typedKey]: Math.min(range.max, Math.max(range.min, value)),
      },
    }));
    setPresetMessage('');
    setPresetError('');
  }, []);

  const onTransitionSettingChange = useCallback((key: string, value: number) => {
    if (!(key in TRANSITION_SETTING_RANGES) || !Number.isFinite(value)) return;
    const range = TRANSITION_SETTING_RANGES[key as keyof typeof TRANSITION_SETTING_RANGES];
    setSettings((current) => normalizeVisualSettings({
      ...current,
      transitions: {
        ...current.transitions,
        [key]: Math.min(range.max, Math.max(range.min, value)),
      },
    }));
    setPresetMessage('');
    setPresetError('');
  }, []);

  const onStageSettingChange = useCallback((stage: VisualStage, key: string, value: number | string) => {
    const currentStage = DEFAULT_VISUAL_SETTINGS.stages[stage] as unknown as Record<string, unknown>;
    if (!(key in currentStage)) return;
    if (key !== 'anomalyColor' && key !== 'particleColor' && key !== 'lineColor') {
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      const range = (STAGE_SETTING_RANGES[stage] as Record<string, { min: number; max: number }>)[key];
      if (!range) return;
      value = Math.min(range.max, Math.max(range.min, value));
    } else if (typeof value !== 'string') {
      return;
    }
    setSettings((current) => normalizeVisualSettings({
      ...current,
      stages: {
        ...current.stages,
        [stage]: { ...current.stages[stage], [key]: value },
      },
    }));
    setPresetMessage('');
    setPresetError('');
  }, []);

  const onResetImageSettings = useCallback(() => {
    setSettings((current) => normalizeVisualSettings({
      ...current,
      global: DEFAULT_VISUAL_SETTINGS.global,
    }));
    setPresetMessage('Global image settings reset.');
    setPresetError('');
  }, []);

  const onResetStage = useCallback((stage: VisualStage) => {
    setSettings((current) => normalizeVisualSettings({
      ...current,
      stages: {
        ...current.stages,
        [stage]: DEFAULT_VISUAL_SETTINGS.stages[stage],
      },
    }));
    setPresetMessage(`${stage.toUpperCase()} stage reset.`);
    setPresetError('');
  }, []);

  const onSavePreset = useCallback((rawName: string) => {
    const name = rawName.trim().slice(0, 40);
    if (!name) {
      setPresetError('Enter a name for this preset.');
      setPresetMessage('');
      return;
    }
    setSavedPresets((current) => ({ ...current, [name]: settings }));
    setPresetMessage(`Saved “${name}” in this browser.`);
    setPresetError('');
  }, [settings]);

  const onLoadPreset = useCallback((name: string) => {
    const preset = savedPresets[name];
    if (!preset) {
      setPresetError('Choose a saved preset first.');
      setPresetMessage('');
      return;
    }
    setSettings(normalizeVisualSettings(preset));
    setPresetMessage(`Loaded “${name}”.`);
    setPresetError('');
  }, [savedPresets]);

  const onExportPreset = useCallback(() => {
    const payload = JSON.stringify({ version: 1, settings }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'emotion-system-preset.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setPresetMessage('Preset JSON exported.');
    setPresetError('');
  }, [settings]);

  const onImportPreset = useCallback(async (file: File) => {
    try {
      if (file.size > 1024 * 1024) throw new Error('Preset file must be smaller than 1 MB.');
      const next = parseVisualPreset(await file.text());
      setSettings(next);
      setPresetMessage(`Imported “${file.name}”.`);
      setPresetError('');
    } catch (error) {
      setPresetError(error instanceof Error ? error.message : 'Could not read this preset file.');
      setPresetMessage('');
    }
  }, []);

  const presetNames = useMemo(() => Object.keys(savedPresets).sort((a, b) => a.localeCompare(b)), [savedPresets]);

  return {
    settings,
    savedPresets: presetNames,
    presetMessage,
    presetError,
    onGlobalSettingChange,
    onTransitionSettingChange,
    onStageSettingChange,
    onResetImageSettings,
    onResetStage,
    onSavePreset,
    onLoadPreset,
    onExportPreset,
    onImportPreset,
  };
}

export function serializeVisualSettings(settings: VisualSettings): string {
  return JSON.stringify({ version: 1, settings }, null, 2);
}

export type StageSettingsByKey = { [K in VisualStage]: StageSettings[K] };
