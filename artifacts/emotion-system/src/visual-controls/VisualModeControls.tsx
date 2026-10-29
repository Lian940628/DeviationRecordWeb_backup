import type { ChangeEvent, CSSProperties } from "react";
import "./VisualModeControls.css";

export type PlaybackMode = "auto" | "manual";
export type VisualMode = "surveillance" | "scan";

export interface VisualModeControlsProps {
  playbackMode: PlaybackMode;
  onPlaybackModeChange: (mode: PlaybackMode) => void;
  visualMode: VisualMode;
  onVisualModeChange: (mode: VisualMode) => void;
  originalDwellSeconds: number;
  onOriginalDwellSecondsChange: (seconds: number) => void;
  scanDwellSeconds: number;
  onScanDwellSecondsChange: (seconds: number) => void;
  glitchDurationSeconds: number;
  onGlitchDurationSecondsChange: (seconds: number) => void;
  renderScale: number;
  onRenderScaleChange: (scale: number) => void;
  className?: string;
}

interface RangeControlProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  precision?: number;
  hint: string;
  onChange: (value: number) => void;
}

function RangeControl({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  precision = 1,
  hint,
  onChange,
}: RangeControlProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(Number(event.currentTarget.value));
  };
  const formattedValue = value.toFixed(precision);
  const fillPercent = ((value - min) / (max - min)) * 100;

  return (
    <div className="vmc-range-control">
      <div className="vmc-range-heading">
        <label className="vmc-label" htmlFor={id}>{label}</label>
        <output className="vmc-value" htmlFor={id} aria-live="off">
          {formattedValue}<span>{unit}</span>
        </output>
      </div>
      <input
        className="vmc-range"
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        aria-describedby={`${id}-hint`}
        style={{ "--vmc-range-fill": `${fillPercent}%` } as CSSProperties}
      />
      <div className="vmc-range-meta">
        <span>{min.toFixed(precision)}{unit}</span>
        <span id={`${id}-hint`}>{hint}</span>
        <span>{max.toFixed(precision)}{unit}</span>
      </div>
    </div>
  );
}

export function VisualModeControls({
  playbackMode,
  onPlaybackModeChange,
  visualMode,
  onVisualModeChange,
  originalDwellSeconds,
  onOriginalDwellSecondsChange,
  scanDwellSeconds,
  onScanDwellSecondsChange,
  glitchDurationSeconds,
  onGlitchDurationSecondsChange,
  renderScale,
  onRenderScaleChange,
  className = "",
}: VisualModeControlsProps) {
  return (
    <section className={`vmc-panel ${className}`.trim()} aria-labelledby="vmc-title">
      <header className="vmc-header">
        <div>
          <p className="vmc-kicker">EMOTION / SYSTEM</p>
          <h2 className="vmc-title" id="vmc-title">Visual mode</h2>
        </div>
        <span className="vmc-index" aria-hidden="true">CTRL <i>·</i> 01</span>
      </header>

      <fieldset className="vmc-group">
        <legend className="vmc-group-title">Playback</legend>
        <div className="vmc-segmented" role="group" aria-label="Playback mode">
          <button
            type="button"
            className={`vmc-segment${playbackMode === "auto" ? " is-active" : ""}`}
            aria-pressed={playbackMode === "auto"}
            onClick={() => onPlaybackModeChange("auto")}
          >
            <span className="vmc-state-mark" aria-hidden="true" />
            Auto
          </button>
          <button
            type="button"
            className={`vmc-segment${playbackMode === "manual" ? " is-active" : ""}`}
            aria-pressed={playbackMode === "manual"}
            onClick={() => onPlaybackModeChange("manual")}
          >
            <span className="vmc-state-mark" aria-hidden="true" />
            Manual
          </button>
        </div>
        <p className="vmc-help">Auto alternates on the configured dwell times.</p>
      </fieldset>

      <fieldset className="vmc-group">
        <legend className="vmc-group-title">Image state</legend>
        <div className="vmc-mode-list" role="group" aria-label="Visual mode">
          <button
            type="button"
            className={`vmc-mode-option${visualMode === "surveillance" ? " is-active" : ""}`}
            aria-pressed={visualMode === "surveillance"}
            onClick={() => onVisualModeChange("surveillance")}
          >
            <span className="vmc-mode-glyph vmc-glyph-frame" aria-hidden="true" />
            <span className="vmc-mode-copy">
              <strong>AI Surveillance</strong>
              <small>Camera image + person-linked marks</small>
            </span>
            <span className="vmc-check" aria-hidden="true">●</span>
          </button>
          <button
            type="button"
            className={`vmc-mode-option${visualMode === "scan" ? " is-active" : ""}`}
            aria-pressed={visualMode === "scan"}
            onClick={() => onVisualModeChange("scan")}
          >
            <span className="vmc-mode-glyph vmc-glyph-scan" aria-hidden="true" />
            <span className="vmc-mode-copy">
              <strong>Digital Scan</strong>
              <small>All-scene edge and detail pass</small>
            </span>
            <span className="vmc-check" aria-hidden="true">●</span>
          </button>
        </div>
      </fieldset>

      <fieldset className="vmc-group vmc-timing">
        <legend className="vmc-group-title">Cycle timing</legend>
        <RangeControl
          id="vmc-original-dwell"
          label="Surveillance dwell"
          value={originalDwellSeconds}
          min={1}
          max={8}
          step={0.25}
          unit="s"
          precision={2}
          hint="Time before scan state"
          onChange={onOriginalDwellSecondsChange}
        />
        <RangeControl
          id="vmc-scan-dwell"
          label="Scan dwell"
          value={scanDwellSeconds}
          min={1}
          max={8}
          step={0.25}
          unit="s"
          precision={2}
          hint="Time before return"
          onChange={onScanDwellSecondsChange}
        />
        <RangeControl
          id="vmc-glitch-duration"
          label="Glitch duration"
          value={glitchDurationSeconds}
          min={0.15}
          max={0.35}
          step={0.01}
          unit="s"
          precision={2}
          hint="Abrupt transition"
          onChange={onGlitchDurationSecondsChange}
        />
      </fieldset>

      <fieldset className="vmc-group vmc-render">
        <legend className="vmc-group-title">Render load</legend>
        <RangeControl
          id="vmc-render-scale"
          label="Internal render scale"
          value={renderScale}
          min={0.35}
          max={1}
          step={0.05}
          unit="×"
          precision={2}
          hint="Lower scale uses less GPU"
          onChange={onRenderScaleChange}
        />
      </fieldset>
    </section>
  );
}

export default VisualModeControls;
