export type VisualStage = 'normal' | 'anomaly' | 'particle' | 'line';

export interface GlobalImageSettings {
  saturation: number;
  brightness: number;
  contrast: number;
  gamma: number;
  exposure: number;
  hueShift: number;
  inputBlack: number;
  inputWhite: number;
  outputBlack: number;
  outputWhite: number;
}

export interface NormalStageSettings {
  duration: number;
  localBrightness: number;
  localContrast: number;
  localSaturation: number;
  digitalNoiseIntensity: number;
  scanlineOpacity: number;
}

export interface AnomalyStageSettings {
  duration: number;
  intensity: number;
  colorShiftAmount: number;
  pixelDisplacement: number;
  posterizationLevels: number;
  glitchFrequency: number;
  flickerSpeed: number;
  effectOpacity: number;
  anomalyColor: string;
}

export interface ParticleStageSettings {
  duration: number;
  particleSize: number;
  particleDensity: number;
  particleBrightness: number;
  edgeSensitivity: number;
  luminanceThreshold: number;
  particleJitter: number;
  particleMovementSpeed: number;
  glowIntensity: number;
  particleColor: string;
}

export interface LineStageSettings {
  duration: number;
  lineThickness: number;
  lineDensity: number;
  edgeThreshold: number;
  lineBrightness: number;
  lineColor: string;
  fragmentationIntensity: number;
  lineFlicker: number;
  personConnectionWidth: number;
  personConnectionOpacity: number;
  personConnectionGlow: number;
  personConnectionsEnabled: boolean;
  personConnectionAnimationSpeed: number;
  showPersonIds: boolean;
}

export interface StageAudioSettings {
  muted: boolean;
  masterVolume: number;
  enabledStages: Record<VisualStage, boolean>;
}

export interface StageSettings {
  normal: NormalStageSettings;
  anomaly: AnomalyStageSettings;
  particle: ParticleStageSettings;
  line: LineStageSettings;
}

export interface VisualSettings {
  global: GlobalImageSettings;
  stages: StageSettings;
  audio: StageAudioSettings;
  transitions: {
    glitchDurationSeconds: number;
    renderScale: number;
  };
}

export const DEFAULT_VISUAL_SETTINGS: VisualSettings = {
  global: {
    saturation: 100,
    brightness: 100,
    contrast: 100,
    gamma: 1,
    exposure: 0,
    hueShift: 0,
    inputBlack: 0,
    inputWhite: 100,
    outputBlack: 0,
    outputWhite: 100,
  },
  stages: {
    normal: {
      duration: 1.4,
      localBrightness: 100,
      localContrast: 100,
      localSaturation: 100,
      digitalNoiseIntensity: 0,
      scanlineOpacity: 0,
    },
    anomaly: {
      duration: 0.7,
      intensity: 100,
      colorShiftAmount: 1.6,
      pixelDisplacement: 3.5,
      posterizationLevels: 4,
      glitchFrequency: 11,
      flickerSpeed: 11,
      effectOpacity: 100,
      anomalyColor: '#52d4be',
    },
    particle: {
      duration: 0.9,
      particleSize: 1.5,
      particleDensity: 40,
      particleBrightness: 100,
      edgeSensitivity: 1.8,
      luminanceThreshold: 0.035,
      particleJitter: 100,
      particleMovementSpeed: 14,
      glowIntensity: 0,
      particleColor: '#52d4be',
    },
    line: {
      duration: 0.8,
      lineThickness: 1.5,
      lineDensity: 85,
      edgeThreshold: 0.05,
      lineBrightness: 100,
      lineColor: '#42b8e8',
      fragmentationIntensity: 15,
      lineFlicker: 25,
      personConnectionWidth: 2,
      personConnectionOpacity: 42,
      personConnectionGlow: 18,
      personConnectionsEnabled: true,
      personConnectionAnimationSpeed: 1.2,
      showPersonIds: true,
    },
  },
  audio: {
    muted: false,
    masterVolume: 0.12,
    enabledStages: {
      normal: true,
      anomaly: true,
      particle: true,
      line: true,
    },
  },
  transitions: {
    glitchDurationSeconds: 0.12,
    renderScale: 0.7,
  },
};

export const TRANSITION_SETTING_RANGES = {
  glitchDurationSeconds: { min: 0.08, max: 0.2, step: 0.01 },
  renderScale: { min: 0.35, max: 1, step: 0.05 },
};

export type SettingsRange = {
  min: number;
  max: number;
  step: number;
};

export const GLOBAL_SETTING_RANGES: Record<keyof GlobalImageSettings, SettingsRange> = {
  saturation: { min: 0, max: 200, step: 1 },
  brightness: { min: 0, max: 200, step: 1 },
  contrast: { min: 0, max: 200, step: 1 },
  gamma: { min: 0.2, max: 3, step: 0.01 },
  exposure: { min: -3, max: 3, step: 0.05 },
  hueShift: { min: -180, max: 180, step: 1 },
  inputBlack: { min: 0, max: 99, step: 1 },
  inputWhite: { min: 1, max: 100, step: 1 },
  outputBlack: { min: 0, max: 99, step: 1 },
  outputWhite: { min: 1, max: 100, step: 1 },
};

export const STAGE_SETTING_RANGES: {
  normal: Record<keyof NormalStageSettings, SettingsRange>;
  anomaly: Record<keyof AnomalyStageSettings, SettingsRange>;
  particle: Record<keyof ParticleStageSettings, SettingsRange>;
  line: Record<keyof LineStageSettings, SettingsRange>;
} = {
  normal: {
    duration: { min: 0.1, max: 15, step: 0.1 },
    localBrightness: { min: 0, max: 200, step: 1 },
    localContrast: { min: 0, max: 200, step: 1 },
    localSaturation: { min: 0, max: 200, step: 1 },
    digitalNoiseIntensity: { min: 0, max: 100, step: 1 },
    scanlineOpacity: { min: 0, max: 100, step: 1 },
  },
  anomaly: {
    duration: { min: 0.1, max: 15, step: 0.1 },
    intensity: { min: 0, max: 200, step: 1 },
    colorShiftAmount: { min: 0, max: 5, step: 0.1 },
    pixelDisplacement: { min: 0, max: 8, step: 0.1 },
    posterizationLevels: { min: 2, max: 8, step: 1 },
    glitchFrequency: { min: 0, max: 30, step: 0.5 },
    flickerSpeed: { min: 1, max: 30, step: 0.5 },
    effectOpacity: { min: 0, max: 100, step: 1 },
    anomalyColor: { min: 0, max: 1, step: 0.01 },
  },
  particle: {
    duration: { min: 0.1, max: 15, step: 0.1 },
    particleSize: { min: 0.5, max: 5, step: 0.1 },
    particleDensity: { min: 0, max: 100, step: 1 },
    particleBrightness: { min: 0, max: 200, step: 1 },
    edgeSensitivity: { min: 0, max: 5, step: 0.1 },
    luminanceThreshold: { min: 0, max: 1, step: 0.01 },
    particleJitter: { min: 0, max: 100, step: 1 },
    particleMovementSpeed: { min: 0, max: 30, step: 0.5 },
    glowIntensity: { min: 0, max: 100, step: 1 },
    particleColor: { min: 0, max: 1, step: 0.01 },
  },
  line: {
    duration: { min: 0.1, max: 15, step: 0.1 },
    lineThickness: { min: 0.5, max: 5, step: 0.1 },
    lineDensity: { min: 0, max: 100, step: 1 },
    edgeThreshold: { min: 0, max: 0.5, step: 0.005 },
    lineBrightness: { min: 0, max: 200, step: 1 },
    lineColor: { min: 0, max: 1, step: 0.01 },
    fragmentationIntensity: { min: 0, max: 100, step: 1 },
    lineFlicker: { min: 0, max: 100, step: 1 },
    personConnectionWidth: { min: 0.5, max: 10, step: 0.1 },
    personConnectionOpacity: { min: 0, max: 100, step: 1 },
    personConnectionGlow: { min: 0, max: 100, step: 1 },
    personConnectionsEnabled: { min: 0, max: 1, step: 1 },
    personConnectionAnimationSpeed: { min: 0, max: 4, step: 0.1 },
    showPersonIds: { min: 0, max: 1, step: 1 },
  },
};

const COLOR = /^#[\da-f]{6}$/i;

function clampNumber(value: unknown, fallback: number, range: SettingsRange): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(range.max, Math.max(range.min, number));
}

function normalizeGroup<T extends object>(
  candidate: unknown,
  defaults: T,
  ranges: Record<keyof T, SettingsRange>,
): T {
  const source = candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : {};
  const defaultRecord = defaults as Record<string, unknown>;
  const result = { ...defaults } as unknown as Record<string, unknown>;
  for (const key of Object.keys(defaultRecord) as (keyof T)[]) {
    const value = source[String(key)];
    if (typeof defaultRecord[String(key)] === 'string') {
      result[String(key)] =
        typeof value === 'string' && COLOR.test(value) ? value : defaultRecord[String(key)];
    } else if (typeof defaultRecord[String(key)] === 'boolean') {
      result[String(key)] = typeof value === 'boolean' ? value : defaultRecord[String(key)];
    } else {
      result[String(key)] = clampNumber(
        value,
        defaultRecord[String(key)] as number,
        ranges[key],
      );
    }
  }
  return result as T;
}

export function normalizeVisualSettings(candidate: unknown): VisualSettings {
  const source = candidate && typeof candidate === 'object' ? candidate as Partial<VisualSettings> : {};
  const global = normalizeGroup(source.global, DEFAULT_VISUAL_SETTINGS.global, GLOBAL_SETTING_RANGES);
  global.inputWhite = Math.max(global.inputBlack + 1, global.inputWhite);
  global.outputWhite = Math.max(global.outputBlack + 1, global.outputWhite);
  const transitions = normalizeGroup(
    source.transitions,
    DEFAULT_VISUAL_SETTINGS.transitions,
    TRANSITION_SETTING_RANGES,
  );
  const audioSource = source.audio && typeof source.audio === 'object'
    ? source.audio as Partial<StageAudioSettings>
    : {};
  const enabledStagesSource = audioSource.enabledStages && typeof audioSource.enabledStages === 'object'
    ? audioSource.enabledStages as Partial<Record<VisualStage, boolean>>
    : {} as Partial<Record<VisualStage, boolean>>;
  return {
    global,
    stages: {
      normal: normalizeGroup(source.stages?.normal, DEFAULT_VISUAL_SETTINGS.stages.normal, STAGE_SETTING_RANGES.normal),
      anomaly: normalizeGroup(source.stages?.anomaly, DEFAULT_VISUAL_SETTINGS.stages.anomaly, STAGE_SETTING_RANGES.anomaly),
      particle: normalizeGroup(source.stages?.particle, DEFAULT_VISUAL_SETTINGS.stages.particle, STAGE_SETTING_RANGES.particle),
      line: normalizeGroup(source.stages?.line, DEFAULT_VISUAL_SETTINGS.stages.line, STAGE_SETTING_RANGES.line),
    },
    audio: {
      muted: typeof audioSource.muted === 'boolean' ? audioSource.muted : DEFAULT_VISUAL_SETTINGS.audio.muted,
      masterVolume: clampNumber(
        audioSource.masterVolume,
        DEFAULT_VISUAL_SETTINGS.audio.masterVolume,
        { min: 0, max: 0.4, step: 0.01 },
      ),
      enabledStages: {
        normal: typeof enabledStagesSource.normal === 'boolean' ? enabledStagesSource.normal : true,
        anomaly: typeof enabledStagesSource.anomaly === 'boolean' ? enabledStagesSource.anomaly : true,
        particle: typeof enabledStagesSource.particle === 'boolean' ? enabledStagesSource.particle : true,
        line: typeof enabledStagesSource.line === 'boolean' ? enabledStagesSource.line : true,
      },
    },
    transitions,
  };
}

export interface VisualPresetFile {
  version: 1;
  settings: VisualSettings;
}

export function parseVisualPreset(text: string): VisualSettings {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !('settings' in parsed)) {
    throw new Error('Invalid preset: expected a settings object.');
  }
  const envelope = parsed as { version?: unknown; settings: unknown };
  if (envelope.version !== 1) throw new Error('Unsupported preset version.');
  return normalizeVisualSettings(envelope.settings);
}

