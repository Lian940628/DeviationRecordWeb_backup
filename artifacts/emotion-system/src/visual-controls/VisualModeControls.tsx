import type { ChangeEvent, CSSProperties } from "react";
import "./VisualModeControls.css";

export type PlaybackMode = "auto" | "manual";
export type VisualMode = "normal" | "anomaly" | "particle" | "line";

const STAGES: { mode: VisualMode; index: string; name: string; note: string; glyph: string }[] = [
  { mode: "normal", index: "01", name: "Normal image", note: "Untouched camera colour", glyph: "vmc-glyph-frame" },
  { mode: "anomaly", index: "02", name: "Person anomaly", note: "Inversion / posterize inside boxes", glyph: "vmc-glyph-anomaly" },
  { mode: "particle", index: "03", name: "Particle field", note: "Scene broken into specks", glyph: "vmc-glyph-particle" },
  { mode: "line", index: "04", name: "Line contour", note: "Scharr edges, broken", glyph: "vmc-glyph-line" },
];

export interface VisualModeControlsProps {
  playbackMode: PlaybackMode;
  onPlaybackModeChange: (mode: PlaybackMode) => void;
  visualMode: VisualMode;
  onVisualModeChange: (mode: VisualMode) => void;
  normalDwellSeconds: number;
  onNormalDwellSecondsChange: (seconds: number) => void;
  anomalyDwellSeconds: number;
  onAnomalyDwellSecondsChange: (seconds: number) => void;
  particleDwellSeconds: number;
  onParticleDwellSecondsChange: (seconds: number) => void;
  lineDwellSeconds: number;
  onLineDwellSecondsChange: (seconds: number) => void;
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
  normalDwellSeconds,
  onNormalDwellSecondsChange,
  anomalyDwellSeconds,
  onAnomalyDwellSecondsChange,
  particleDwellSeconds,
  onParticleDwellSecondsChange,
  lineDwellSeconds,
  onLineDwellSecondsChange,
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
        <p className="vmc-help">Auto cycles 01 → 02 → 03 → 04 with hard cuts. Picking a stage switches to manual.</p>
      </fieldset>

      <fieldset className="vmc-group">
        <legend className="vmc-group-title">Image state</legend>
        <div className="vmc-mode-list" role="group" aria-label="Visual stage">
          {STAGES.map((stage) => (
            <button
              key={stage.mode}
              type="button"
              className={`vmc-mode-option${visualMode === stage.mode ? " is-active" : ""}`}
              aria-pressed={visualMode === stage.mode}
              onClick={() => onVisualModeChange(stage.mode)}
              data-testid={`button-stage-${stage.mode}`}
            >
              <span className={`vmc-mode-glyph ${stage.glyph}`} aria-hidden="true" />
              <span className="vmc-mode-copy">
                <strong>{stage.index} · {stage.name}</strong>
                <small>{stage.note}</small>
              </span>
              <span className="vmc-check" aria-hidden="true">●</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="vmc-group vmc-timing">
        <legend className="vmc-group-title">Cycle timing</legend>
        <RangeControl
          id="vmc-normal-dwell"
          label="01 Normal dwell"
          value={normalDwellSeconds}
          min={0.2}
          max={4}
          step={0.05}
          unit="s"
          precision={2}
          hint="Raw camera"
          onChange={onNormalDwellSecondsChange}
        />
        <RangeControl
          id="vmc-anomaly-dwell"
          label="02 Anomaly dwell"
          value={anomalyDwellSeconds}
          min={0.2}
          max={4}
          step={0.05}
          unit="s"
          precision={2}
          hint="Person pulses"
          onChange={onAnomalyDwellSecondsChange}
        />
        <RangeControl
          id="vmc-particle-dwell"
          label="03 Particle dwell"
          value={particleDwellSeconds}
          min={0.2}
          max={4}
          step={0.05}
          unit="s"
          precision={2}
          hint="Speck field"
          onChange={onParticleDwellSecondsChange}
        />
        <RangeControl
          id="vmc-line-dwell"
          label="04 Line dwell"
          value={lineDwellSeconds}
          min={0.2}
          max={4}
          step={0.05}
          unit="s"
          precision={2}
          hint="Contours"
          onChange={onLineDwellSecondsChange}
        />
        <RangeControl
          id="vmc-glitch-duration"
          label="Glitch duration"
          value={glitchDurationSeconds}
          min={0.08}
          max={0.2}
          step={0.01}
          unit="s"
          precision={2}
          hint="Inside dwell, into 01 and 03"
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
