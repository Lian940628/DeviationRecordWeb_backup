import { useState, type ChangeEvent, type CSSProperties } from "react";
import {
  GLOBAL_SETTING_RANGES,
  STAGE_SETTING_RANGES,
  TRANSITION_SETTING_RANGES,
  type SettingsRange,
  type VisualSettings,
  type VisualStage,
} from "../visualization/visualSettings";
import type { PlaybackMode, VisualModeControlsProps } from "./visualControlsTypes";
import { useAppLanguage, useTranslation } from "../i18n";
export type { PlaybackMode, VisualMode } from "./visualControlsTypes";
import "./VisualModeControls.css";

const STAGES: { mode: VisualStage; index: string; name: string; note: string; glyph: string }[] = [
  { mode: "normal", index: "01", name: "Normal image", note: "Untouched camera colour", glyph: "vmc-glyph-frame" },
  { mode: "anomaly", index: "02", name: "Person anomaly", note: "Inversion / posterize inside boxes", glyph: "vmc-glyph-anomaly" },
  { mode: "particle", index: "03", name: "Particle field", note: "Scene broken into specks", glyph: "vmc-glyph-particle" },
  { mode: "line", index: "04", name: "Line contour", note: "Scharr edges, broken", glyph: "vmc-glyph-line" },
];

type FieldSpec = { key: string; label: string; unit: string; precision: number; control?: "toggle" };
const GLOBAL_FIELDS: FieldSpec[] = [
  { key: "saturation", label: "Saturation", unit: "%", precision: 0 },
  { key: "brightness", label: "Brightness", unit: "%", precision: 0 },
  { key: "contrast", label: "Contrast", unit: "%", precision: 0 },
  { key: "gamma", label: "Gamma", unit: "×", precision: 2 },
  { key: "exposure", label: "Exposure", unit: " EV", precision: 2 },
  { key: "hueShift", label: "Hue shift", unit: "°", precision: 0 },
  { key: "inputBlack", label: "Input black level", unit: "%", precision: 0 },
  { key: "inputWhite", label: "Input white level", unit: "%", precision: 0 },
  { key: "outputBlack", label: "Output black level", unit: "%", precision: 0 },
  { key: "outputWhite", label: "Output white level", unit: "%", precision: 0 },
];

const STAGE_FIELDS: Record<VisualStage, FieldSpec[]> = {
  normal: [
    { key: "localBrightness", label: "Local brightness", unit: "%", precision: 0 },
    { key: "localContrast", label: "Local contrast", unit: "%", precision: 0 },
    { key: "localSaturation", label: "Local saturation", unit: "%", precision: 0 },
    { key: "digitalNoiseIntensity", label: "Digital noise", unit: "%", precision: 0 },
    { key: "scanlineOpacity", label: "Scanline opacity", unit: "%", precision: 0 },
  ],
  anomaly: [
    { key: "intensity", label: "Intensity", unit: "%", precision: 0 },
    { key: "colorShiftAmount", label: "Colour channel offset", unit: "px", precision: 1 },
    { key: "pixelDisplacement", label: "Pixel displacement", unit: "px", precision: 1 },
    { key: "posterizationLevels", label: "Posterization levels", unit: "", precision: 0 },
    { key: "glitchFrequency", label: "Glitch frequency", unit: "/s", precision: 1 },
    { key: "flickerSpeed", label: "Flicker speed", unit: "Hz", precision: 1 },
    { key: "effectOpacity", label: "Effect opacity", unit: "%", precision: 0 },
    { key: "anomalyColor", label: "Anomaly colour", unit: "", precision: 0 },
  ],
  particle: [
    { key: "particleSize", label: "Particle size", unit: "px", precision: 1 },
    { key: "particleDensity", label: "Particle density", unit: "%", precision: 0 },
    { key: "particleBrightness", label: "Particle brightness", unit: "%", precision: 0 },
    { key: "edgeSensitivity", label: "Edge sensitivity", unit: "×", precision: 1 },
    { key: "luminanceThreshold", label: "Luminance threshold", unit: "", precision: 2 },
    { key: "particleJitter", label: "Particle jitter", unit: "%", precision: 0 },
    { key: "particleMovementSpeed", label: "Movement speed", unit: "×", precision: 1 },
    { key: "glowIntensity", label: "Glow intensity", unit: "%", precision: 0 },
    { key: "particleColor", label: "Particle colour", unit: "", precision: 0 },
  ],
  line: [
    { key: "lineThickness", label: "Line thickness", unit: "px", precision: 1 },
    { key: "lineDensity", label: "Line density", unit: "%", precision: 0 },
    { key: "edgeThreshold", label: "Edge threshold", unit: "", precision: 3 },
    { key: "lineBrightness", label: "Line brightness", unit: "%", precision: 0 },
    { key: "lineColor", label: "Line colour", unit: "", precision: 0 },
    { key: "fragmentationIntensity", label: "Fragmentation", unit: "%", precision: 0 },
    { key: "lineFlicker", label: "Line flicker", unit: "%", precision: 0 },
    { key: "personConnectionWidth", label: "Connection width", unit: "px", precision: 1 },
    { key: "personConnectionOpacity", label: "Connection opacity", unit: "%", precision: 0 },
    { key: "personConnectionGlow", label: "Connection glow", unit: "%", precision: 0 },
    { key: "personConnectionAnimationSpeed", label: "Connection animation speed", unit: "×", precision: 1 },
    { key: "personConnectionsEnabled", label: "Enable person connections", unit: "", precision: 0, control: "toggle" },
    { key: "showPersonIds", label: "Show person IDs", unit: "", precision: 0, control: "toggle" },
  ],
};

function RangeControl({
  id, label, value, min, max, step, unit, precision, onChange,
}: {
  id: string; label: string; value: number; min: number; max: number; step: number;
  unit: string; precision: number; onChange: (value: number) => void;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="vmc-control" data-testid={`control-${id}`}>
      <div className="vmc-control-heading">
        <label className="vmc-label" htmlFor={id}>{label}</label>
        <output className="vmc-value" htmlFor={id} data-testid={`value-${id}`}>
          {value.toFixed(precision)}<span>{unit}</span>
        </output>
      </div>
      <input
        id={id}
        className="vmc-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        aria-label={label}
        data-testid={`slider-${id}`}
        style={{ "--vmc-fill": `${fill}%` } as CSSProperties}
      />
      <div className="vmc-range-ends" aria-hidden="true"><span>{min}{unit}</span><span>{max}{unit}</span></div>
    </div>
  );
}

export function VisualModeControls({
  playbackMode, onPlaybackModeChange, visualMode, onVisualModeChange, settings, savedPresets,
  presetMessage, presetError, onGlobalSettingChange, onStageSettingChange, onResetImageSettings,
  onTransitionSettingChange, onAudioSettingChange, onAudioUnlock, onResetStage, onSavePreset, onLoadPreset, onExportPreset,
  onImportPreset, className = "",
}: VisualModeControlsProps) {
  const { language } = useAppLanguage();
  const t = useTranslation();
  const [presetName, setPresetName] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const stageSettings = settings.stages[visualMode];
  const stage = STAGES.find((item) => item.mode === visualMode)!;
  const audio = settings.audio;
  const changeFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file) onImportPreset(file);
    event.currentTarget.value = "";
  };
  const renderGlobalField = (field: FieldSpec) => {
    const key = field.key as keyof VisualSettings["global"];
    const range = GLOBAL_SETTING_RANGES[key];
    return (
      <RangeControl
        key={field.key}
        id={`vmc-global-${field.key}`}
        label={t(field.label)}
        value={settings.global[key]}
        min={range.min}
        max={range.max}
        step={range.step}
        unit={field.unit}
        precision={field.precision}
        onChange={(value) => onGlobalSettingChange(field.key, value)}
      />
    );
  };
  const renderStageField = (field: FieldSpec) => {
    const value = (stageSettings as unknown as Record<string, number | string | boolean>)[field.key];
    if (typeof value === "boolean") {
      const id = `vmc-stage-${visualMode}-${field.key}`;
      return (
        <div className="vmc-control vmc-toggle-control" key={field.key} data-testid={`control-${id}`}>
          <label className="vmc-label" htmlFor={id}>{t(field.label)}</label>
          <input id={id} type="checkbox" checked={value} aria-label={t(field.label)} data-testid={`toggle-${id}`}
            onChange={(event) => onStageSettingChange(visualMode, field.key, event.currentTarget.checked)} />
        </div>
      );
    }
    if (typeof value === "string") {
      const id = `vmc-stage-${visualMode}-${field.key}`;
      return (
        <div className="vmc-control vmc-color-control" key={field.key} data-testid={`control-${id}`}>
          <label className="vmc-label" htmlFor={id}>{t(field.label)}</label>
          <div className="vmc-color-row">
            <input id={id} type="color" value={value} aria-label={field.label} data-testid={`color-${id}`}
              onChange={(event) => onStageSettingChange(visualMode, field.key, event.currentTarget.value)} />
            <output className="vmc-color-value" htmlFor={id} data-testid={`value-${id}`}>{value.toUpperCase()}</output>
          </div>
        </div>
      );
    }
    const range = (STAGE_SETTING_RANGES[visualMode] as unknown as Record<string, SettingsRange>)[field.key];
    return (
      <RangeControl
        key={field.key}
        id={`vmc-stage-${visualMode}-${field.key}`}
        label={t(field.label)}
        value={value}
        min={range.min}
        max={range.max}
        step={range.step}
        unit={field.unit}
        precision={field.precision}
        onChange={(next) => onStageSettingChange(visualMode, field.key, next)}
      />
    );
  };

  return (
    <section className={`vmc-panel ${className}`.trim()} aria-labelledby="vmc-title">
      <header className="vmc-header">
        <div><p className="vmc-kicker">EMOTION / SYSTEM</p><h2 className="vmc-title" id="vmc-title">{t('Visual controls')}</h2></div>
        <span className="vmc-index" aria-hidden="true">CTRL <i>·</i> 01 / 04</span>
      </header>

      <fieldset className="vmc-group">
        <legend className="vmc-group-title">{t('Playback')}</legend>
        <div className="vmc-segmented" role="group" aria-label={t('Playback mode')}>
          {(["auto", "manual"] as PlaybackMode[]).map((mode) => (
            <button type="button" key={mode} className={`vmc-segment${playbackMode === mode ? " is-active" : ""}`}
              aria-pressed={playbackMode === mode} onClick={() => onPlaybackModeChange(mode)}
              data-testid={`button-playback-${mode}`}><span className="vmc-state-mark" aria-hidden="true" />{t(mode.toUpperCase())}</button>
          ))}
        </div>
        <p className="vmc-help">{t('Auto cycles through all four stages. Selecting a stage switches to manual.')}</p>
      </fieldset>

      <fieldset className="vmc-group vmc-audio-group">
        <legend className="vmc-group-title">{t('Stage transition sound')}</legend>
        <div className="vmc-audio-heading">
          <button type="button" className="vmc-action" aria-pressed={!audio.muted}
            onClick={() => {
              const nextMuted = !audio.muted;
              if (!nextMuted) onAudioUnlock();
              onAudioSettingChange("muted", nextMuted);
            }} data-testid="button-audio-mute">
            {t(audio.muted ? "Unmute" : "Mute")}
          </button>
          <span className="vmc-audio-status">{t(audio.muted ? "SILENT" : "LOCAL · USER-GESTURE GATED")}</span>
        </div>
        <RangeControl id="vmc-audio-master-volume" label={t("Master volume")} value={audio.masterVolume}
          min={0} max={0.4} step={0.01} unit="×" precision={2}
          onChange={(value) => onAudioSettingChange("masterVolume", value)} />
        <div className="vmc-audio-stages" role="group" aria-label={t("Enable sound for each stage")}>
          {STAGES.map((item) => (
            <label className="vmc-audio-stage" key={item.mode}>
              <input type="checkbox" checked={audio.enabledStages[item.mode]}
                onChange={(event) => onAudioSettingChange(item.mode, event.currentTarget.checked)}
                data-testid={`toggle-stage-sound-${item.mode}`} />
              <span>{item.index} · {t(item.name)}</span>
            </label>
          ))}
        </div>
        <p className="vmc-help">{t('Short local tones play when stages change. Audio starts after camera access or UNMUTE.')}</p>
      </fieldset>

      <fieldset className="vmc-group">
        <legend className="vmc-group-title">{t('Image state')}</legend>
        <div className="vmc-mode-list" role="group" aria-label={t('Visual stage')}>
          {STAGES.map((item) => (
            <button key={item.mode} type="button" className={`vmc-mode-option${visualMode === item.mode ? " is-active" : ""}`}
              aria-pressed={visualMode === item.mode} onClick={() => onVisualModeChange(item.mode)}
              data-testid={`button-stage-${item.mode}`}>
              <span className={`vmc-mode-glyph ${item.glyph}`} aria-hidden="true" />
              <span className="vmc-mode-copy"><strong>{item.index} · {t(item.name)}</strong><small>{t(item.note)}</small></span>
              <span className="vmc-check" aria-hidden="true">●</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="vmc-group vmc-settings-group">
        <legend className="vmc-group-title">{t('Global image · all stages')}</legend>
        <div className="vmc-fields">{GLOBAL_FIELDS.map(renderGlobalField)}</div>
        <button type="button" className="vmc-action vmc-reset-image" onClick={onResetImageSettings}
          data-testid="button-reset-image">{t('Reset image settings')}</button>
      </fieldset>

      <fieldset className="vmc-group vmc-settings-group">
        <legend className="vmc-group-title">{stage.index} · {t(stage.name)} {t('settings')}</legend>
        <div className="vmc-stage-banner"><span className={`vmc-mode-glyph ${stage.glyph}`} aria-hidden="true" />
          <span>{language === 'zh' ? `僅編輯 ${stage.index} 階段` : `Editing stage ${stage.index} only`}</span></div>
        <div className="vmc-fields">
          <RangeControl id={`vmc-stage-${visualMode}-duration`} label={t("Stage duration")} value={stageSettings.duration}
            min={STAGE_SETTING_RANGES[visualMode].duration.min} max={STAGE_SETTING_RANGES[visualMode].duration.max}
            step={STAGE_SETTING_RANGES[visualMode].duration.step} unit=" s" precision={1}
            onChange={(value) => onStageSettingChange(visualMode, "duration", value)} />
          {STAGE_FIELDS[visualMode].map(renderStageField)}
        </div>
        <button type="button" className="vmc-action" onClick={() => onResetStage(visualMode)}
          data-testid={`button-reset-stage-${visualMode}`}>{language === "zh" ? `重設「${t(stage.name)}」階段` : `Reset ${stage.name.toLowerCase()} stage`}</button>
      </fieldset>

      <fieldset className="vmc-group vmc-settings-group">
        <legend className="vmc-group-title">{t("Render and transition")}</legend>
        <div className="vmc-fields">
          <RangeControl id="vmc-transition-glitch-duration" label={t("Glitch duration")}
            value={settings.transitions.glitchDurationSeconds}
            min={TRANSITION_SETTING_RANGES.glitchDurationSeconds.min}
            max={TRANSITION_SETTING_RANGES.glitchDurationSeconds.max}
            step={TRANSITION_SETTING_RANGES.glitchDurationSeconds.step} unit=" s" precision={2}
            onChange={(value) => onTransitionSettingChange("glitchDurationSeconds", value)} />
          <RangeControl id="vmc-render-scale" label={t("Internal render scale")}
            value={settings.transitions.renderScale}
            min={TRANSITION_SETTING_RANGES.renderScale.min}
            max={TRANSITION_SETTING_RANGES.renderScale.max}
            step={TRANSITION_SETTING_RANGES.renderScale.step} unit="×" precision={2}
            onChange={(value) => onTransitionSettingChange("renderScale", value)} />
        </div>
        <p className="vmc-help">{t("Glitch is a short cut into stages 01 and 03. Lower render scale uses less GPU.")}</p>
      </fieldset>

      <fieldset className="vmc-group vmc-preset-group">
        <legend className="vmc-group-title">{t("Preset library")}</legend>
        <label className="vmc-label" htmlFor="vmc-preset-select">{t("Saved preset")}</label>
        <div className="vmc-preset-row">
          <select id="vmc-preset-select" value={selectedPreset} onChange={(event) => setSelectedPreset(event.currentTarget.value)}
            data-testid="select-preset" aria-label={t("Choose saved preset")}>
            <option value="">{t("Choose a preset")}</option>
            {savedPresets.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <button type="button" className="vmc-action" disabled={!selectedPreset} onClick={() => onLoadPreset(selectedPreset)}
            data-testid="button-load-preset">{t("Load")}</button>
        </div>
        <label className="vmc-label vmc-save-label" htmlFor="vmc-preset-name">{t("Save current settings")}</label>
        <div className="vmc-preset-row">
          <input id="vmc-preset-name" type="text" value={presetName} maxLength={80} placeholder={t("Preset name")}
            onChange={(event) => setPresetName(event.currentTarget.value)} data-testid="input-preset-name" />
          <button type="button" className="vmc-action" disabled={!presetName.trim()}
            onClick={() => { onSavePreset(presetName.trim()); setPresetName(""); }} data-testid="button-save-preset">{t("Save")}</button>
        </div>
        <div className="vmc-preset-actions">
          <button type="button" className="vmc-action" onClick={onExportPreset} data-testid="button-export-preset">{t("Export JSON")}</button>
          <input id="vmc-import-preset" className="vmc-file-input" type="file" accept="application/json,.json"
            onChange={changeFile} data-testid="input-import-preset" />
          <label className="vmc-action vmc-file-button" htmlFor="vmc-import-preset" data-testid="button-import-preset">{t("Import JSON")}</label>
        </div>
        {presetMessage && <p className="vmc-status" role="status" aria-live="polite" data-testid="status-preset-message">{t(presetMessage)}</p>}
        {presetError && <p className="vmc-status is-error" role="alert" data-testid="status-preset-error">{t(presetError)}</p>}
      </fieldset>
    </section>
  );
}

export default VisualModeControls;
