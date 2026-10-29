import type { CSSProperties } from 'react';
import {
  GLOBAL_SETTING_RANGES,
  STAGE_SETTING_RANGES,
  type VisualSettings,
  type VisualStage,
} from '../visualization/visualSettings';
import { useAppLanguage } from '../i18n';

const STAGES: { id: VisualStage; label: string }[] = [
  { id: 'normal', label: 'NORMAL' },
  { id: 'anomaly', label: 'ANOMALY' },
  { id: 'particle', label: 'PARTICLE' },
  { id: 'line', label: 'LINE' },
];

const FIELDS: Record<VisualStage, { key: string; label: string; unit: string; precision: number }[]> = {
  normal: [
    { key: 'digitalNoiseIntensity', label: 'Digital noise', unit: '%', precision: 0 },
    { key: 'scanlineOpacity', label: 'Scanline opacity', unit: '%', precision: 0 },
  ],
  anomaly: [
    { key: 'intensity', label: 'Effect intensity', unit: '%', precision: 0 },
    { key: 'effectOpacity', label: 'Effect opacity', unit: '%', precision: 0 },
    { key: 'glitchFrequency', label: 'Glitch frequency', unit: '/s', precision: 1 },
  ],
  particle: [
    { key: 'particleDensity', label: 'Particle density', unit: '%', precision: 0 },
    { key: 'particleSize', label: 'Particle size', unit: 'px', precision: 1 },
    { key: 'glowIntensity', label: 'Glow intensity', unit: '%', precision: 0 },
  ],
  line: [
    { key: 'lineDensity', label: 'Line density', unit: '%', precision: 0 },
    { key: 'lineThickness', label: 'Line thickness', unit: 'px', precision: 1 },
    { key: 'lineBrightness', label: 'Line brightness', unit: '%', precision: 0 },
  ],
};

const COPY: Record<string, string> = {
  '04 / EFFECT ENGINE': '04 / 效果引擎',
  'AUTO CYCLE': '自動循環',
  'MANUAL': '手動',
  'GLOBAL IMAGE': '整體影像',
  'Saturation': '飽和度',
  'Brightness': '亮度',
  'Contrast': '對比',
  'Stage timing': '階段長度',
  'Stage settings': '階段參數',
  'NORMAL': '原始',
  'ANOMALY': '偏差',
  'PARTICLE': '粒子',
  'LINE': '線條',
  'Digital noise': '數位雜訊',
  'Scanline opacity': '掃描線透明度',
  'Effect intensity': '效果強度',
  'Effect opacity': '效果透明度',
  'Glitch frequency': '故障頻率',
  'Particle density': '粒子密度',
  'Particle size': '粒子尺寸',
  'Glow intensity': '光暈強度',
  'Line density': '線條密度',
  'Line thickness': '線條粗細',
  'Line brightness': '線條亮度',
  'Reset this stage': '重設此階段',
  'Start playback to run local person tracking.': '播放影片即可啟動本機人物追蹤。',
  'Four live shader stages · tracking stays in this browser.': '四種即時 Shader 階段 · 人物追蹤只在此瀏覽器執行。',
};

function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  precision,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  precision: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className="vd-effect-control" htmlFor={id}>
      <span className="vd-effect-control-heading">
        <span>{label}</span>
        <output>{value.toFixed(precision)}{unit}</output>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        style={{ '--vd-effect-fill': `${fill}%` } as CSSProperties}
      />
    </label>
  );
}

interface VideoEffectControlsProps {
  settings: VisualSettings;
  activeStage: VisualStage;
  autoCycle: boolean;
  disabled: boolean;
  onModeChange: (stage: VisualStage) => void;
  onCycleChange: (enabled: boolean) => void;
  onGlobalSettingChange: (key: string, value: number) => void;
  onStageSettingChange: (stage: VisualStage, key: string, value: number | string | boolean) => void;
  onResetStage: (stage: VisualStage) => void;
}

export function VideoEffectControls({
  settings,
  activeStage,
  autoCycle,
  disabled,
  onModeChange,
  onCycleChange,
  onGlobalSettingChange,
  onStageSettingChange,
  onResetStage,
}: VideoEffectControlsProps) {
  const { language } = useAppLanguage();
  const t = (label: string) => language === 'zh' ? COPY[label] ?? label : label;
  const stageSettings = settings.stages[activeStage] as unknown as Record<string, number | string | boolean>;
  const ranges = STAGE_SETTING_RANGES[activeStage] as Record<string, { min: number; max: number; step: number }>;
  const durationRange = ranges.duration;

  return (
    <section className="vd-effect-panel" aria-label={t('04 / EFFECT ENGINE')}>
      <div className="vd-section-heading">
        <span>{t('04 / EFFECT ENGINE')}</span><span className="vd-section-rule" /><span className="vd-section-state">LOCAL GPU</span>
      </div>
      <div className="vd-effect-mode-row">
        <div className="vd-stage-tabs" role="group" aria-label={t('Stage settings')}>
          {STAGES.map((stage, index) => (
            <button
              type="button"
              key={stage.id}
              className={activeStage === stage.id ? 'is-active' : ''}
              aria-pressed={activeStage === stage.id}
              disabled={disabled}
              onClick={() => onModeChange(stage.id)}
            >
              <small>0{index + 1}</small>{t(stage.label)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`vd-cycle-toggle${autoCycle ? ' is-active' : ''}`}
          aria-pressed={autoCycle}
          disabled={disabled}
          onClick={() => onCycleChange(!autoCycle)}
        >
          <span className="vd-cycle-indicator" />{t(autoCycle ? 'AUTO CYCLE' : 'MANUAL')}
        </button>
      </div>
      <p className="vd-effect-note">{t('Four live shader stages · tracking stays in this browser.')}</p>

      <div className="vd-effect-groups">
        <fieldset className="vd-effect-group">
          <legend>{t('GLOBAL IMAGE')}</legend>
          {(['saturation', 'brightness', 'contrast'] as const).map((key) => {
            const range = GLOBAL_SETTING_RANGES[key];
            const label = key === 'saturation' ? 'Saturation' : key === 'brightness' ? 'Brightness' : 'Contrast';
            return (
              <Slider
                key={key}
                id={`vd-global-${key}`}
                label={t(label)}
                value={settings.global[key]}
                min={range.min}
                max={range.max}
                step={range.step}
                unit="%"
                precision={0}
                disabled={disabled}
                onChange={(value) => onGlobalSettingChange(key, value)}
              />
            );
          })}
        </fieldset>
        <fieldset className="vd-effect-group">
          <legend>{t('Stage settings')} · {t(activeStage.toUpperCase())}</legend>
          <Slider
            id={`vd-duration-${activeStage}`}
            label={t('Stage timing')}
            value={Number(stageSettings.duration)}
            min={durationRange.min}
            max={durationRange.max}
            step={durationRange.step}
            unit="s"
            precision={1}
            disabled={disabled}
            onChange={(value) => onStageSettingChange(activeStage, 'duration', value)}
          />
          {FIELDS[activeStage].map((field) => {
            const range = ranges[field.key];
            return (
              <Slider
                key={field.key}
                id={`vd-${activeStage}-${field.key}`}
                label={t(field.label)}
                value={Number(stageSettings[field.key])}
                min={range.min}
                max={range.max}
                step={range.step}
                unit={field.unit}
                precision={field.precision}
                disabled={disabled}
                onChange={(value) => onStageSettingChange(activeStage, field.key, value)}
              />
            );
          })}
          <button
            type="button"
            className="vd-reset-stage"
            disabled={disabled}
            onClick={() => onResetStage(activeStage)}
          >
            {t('Reset this stage')}
          </button>
        </fieldset>
      </div>
    </section>
  );
}
