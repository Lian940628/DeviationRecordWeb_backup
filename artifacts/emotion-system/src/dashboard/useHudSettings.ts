import { useCallback, useEffect, useState } from 'react';

export interface HudSettings {
  visible: boolean;
  opacity: number;
  scale: number;
  glowIntensity: number;
  bodyScanEnabled: boolean;
  chartAnimationEnabled: boolean;
  showSystemDetails: boolean;
}

const STORAGE_KEY = 'emotion-system.hud-settings.v1';

export const DEFAULT_HUD_SETTINGS: HudSettings = {
  visible: true,
  opacity: 0.38,
  scale: 1,
  glowIntensity: 0.55,
  bodyScanEnabled: true,
  chartAnimationEnabled: true,
  showSystemDetails: true,
};

function clamp(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function readSettings(): HudSettings {
  if (typeof window === 'undefined') return DEFAULT_HUD_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_HUD_SETTINGS;
    const value = JSON.parse(raw) as Partial<HudSettings>;
    return {
      visible: typeof value.visible === 'boolean' ? value.visible : DEFAULT_HUD_SETTINGS.visible,
      opacity: clamp(value.opacity, 0.16, 0.72, DEFAULT_HUD_SETTINGS.opacity),
      scale: clamp(value.scale, 0.78, 1.18, DEFAULT_HUD_SETTINGS.scale),
      glowIntensity: clamp(value.glowIntensity, 0, 1, DEFAULT_HUD_SETTINGS.glowIntensity),
      bodyScanEnabled: typeof value.bodyScanEnabled === 'boolean' ? value.bodyScanEnabled : DEFAULT_HUD_SETTINGS.bodyScanEnabled,
      chartAnimationEnabled: typeof value.chartAnimationEnabled === 'boolean' ? value.chartAnimationEnabled : DEFAULT_HUD_SETTINGS.chartAnimationEnabled,
      showSystemDetails: typeof value.showSystemDetails === 'boolean' ? value.showSystemDetails : DEFAULT_HUD_SETTINGS.showSystemDetails,
    };
  } catch {
    return DEFAULT_HUD_SETTINGS;
  }
}

export function useHudSettings() {
  const [settings, setSettings] = useState<HudSettings>(readSettings);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // The HUD remains usable when browser storage is unavailable.
    }
  }, [settings]);

  const updateSettings = useCallback((next: Partial<HudSettings>) => {
    setSettings((current) => ({ ...current, ...next }));
  }, []);

  return { hudSettings: settings, onHudSettingChange: updateSettings };
}
