import type { ModelStatus } from './types';
import type { ExpressionReadout } from './expressionTypes';

interface DetectionDebugPanelProps {
  debugMode: boolean;
  onToggle: () => void;
  modelStatus: ModelStatus;
  modelMessage: string;
  faceModelStatus: ModelStatus;
  faceModelMessage: string;
  detectedFaces: number;
  inferenceTimeMs: number;
  expressions: ExpressionReadout[];
  personCount: number;
  detectionFps: number;
  renderingFps: number;
  activeTrackIds: number[];
}

const statusLabels: Record<ModelStatus, string> = {
  idle: 'Idle',
  loading: 'Loading',
  ready: 'Ready',
  error: 'Error',
};

function formatTrackId(id: number) {
  return String(Math.max(0, Math.trunc(id))).padStart(3, '0');
}

export function DetectionDebugPanel({
  debugMode,
  onToggle,
  modelStatus,
  modelMessage,
  faceModelStatus,
  faceModelMessage,
  detectedFaces,
  inferenceTimeMs,
  expressions,
  personCount,
  detectionFps,
  renderingFps,
  activeTrackIds,
}: DetectionDebugPanelProps) {
  return (
    <section className="detection-debug" aria-label="Detection diagnostics" data-testid="panel-detection-debug">
      <button
        type="button"
        className="detection-debug-toggle"
        onClick={onToggle}
        aria-expanded={debugMode}
        aria-controls="detection-debug-content"
        data-testid="button-toggle-detection-debug"
      >
        <span className="detection-debug-toggle-label">Debug Mode</span>
        <span className={`detection-debug-switch${debugMode ? ' is-on' : ''}`} aria-hidden="true">
          <span />
        </span>
        <span className="detection-debug-toggle-state">{debugMode ? 'ON' : 'OFF'}</span>
      </button>
      {debugMode && (
        <div id="detection-debug-content" className="detection-debug-content" data-testid="detection-debug-content">
          <div className="detection-debug-heading">
            <span>System readout</span>
            <span className={`detection-status-mark status-${modelStatus}`} aria-hidden="true" />
          </div>
          <dl className="detection-debug-metrics">
            <div className="detection-debug-row">
              <dt>Person Model Status</dt>
              <dd className={`detection-status-text status-${modelStatus}`} data-testid="text-model-status">{statusLabels[modelStatus]}</dd>
            </div>
            <div className="detection-debug-row">
              <dt>Person Count</dt>
              <dd data-testid="text-detected-person-count">{personCount}</dd>
            </div>
            <div className="detection-debug-row">
              <dt>Detection FPS</dt>
              <dd data-testid="text-detection-fps">{Number.isFinite(detectionFps) ? detectionFps.toFixed(1) : '0.0'}</dd>
            </div>
            <div className="detection-debug-row">
              <dt>Rendering FPS</dt>
              <dd data-testid="text-rendering-fps">{Number.isFinite(renderingFps) ? renderingFps.toFixed(1) : '0.0'}</dd>
            </div>
            <div className="detection-debug-row detection-debug-track-row">
              <dt>Active Track IDs</dt>
              <dd data-testid="text-active-track-ids">
                {activeTrackIds.length
                  ? activeTrackIds.map(formatTrackId).join(' · ')
                  : '—'}
              </dd>
            </div>
            <div className="detection-debug-row">
              <dt>Face Model Status</dt>
              <dd className={`detection-status-text status-${faceModelStatus}`} data-testid="text-face-model-status">{statusLabels[faceModelStatus]}</dd>
            </div>
            <div className="detection-debug-row">
              <dt>Detected Faces</dt>
              <dd data-testid="text-detected-face-count">{detectedFaces}</dd>
            </div>
            <div className="detection-debug-row">
              <dt>Inference Time</dt>
              <dd data-testid="text-face-inference-time">{Number.isFinite(inferenceTimeMs) ? `${inferenceTimeMs.toFixed(1)} ms` : '—'}</dd>
            </div>
          </dl>
          <div className="detection-debug-expression-heading">Per-person expression · heuristic support</div>
          {expressions.length ? (
            <div className="detection-debug-expression-list">
              {expressions.map((expression) => (
                <div className="detection-debug-expression" key={expression.trackId}>
                  <div className="detection-debug-expression-row">
                    <span>PERSON {formatTrackId(expression.trackId)} · EXPRESSION LABEL</span>
                    <strong>{expression.label}</strong>
                  </div>
                  <div className="detection-debug-expression-row">
                    <span>CLASSIFICATION SCORE</span>
                    <strong>{expression.score === null ? '—' : expression.score.toFixed(2)}</strong>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="detection-debug-message">Waiting for a tracked person and a reliable face view.</p>
          )}
          <p className="detection-debug-message">
            Heuristic support only, not an emotion probability. HAPPY = .76 × smile + .24 × cheek squint;
            SAD = .68 × frown + .32 × inner brow; ANGRY = .46 × brow down + .29 × eye squint + .25 × mouth press;
            SURPRISED = .43 × eye wide + .37 × jaw open + .20 × inner brow; NEUTRAL = 1 − strongest non-neutral cue.
            Non-neutral labels require support ≥ .35 and an .08 lead; uncertain cases are UNKNOWN.
          </p>
          {modelMessage && <p className="detection-debug-message" role="status" data-testid="text-model-message">{modelMessage}</p>}
          {faceModelMessage && <p className="detection-debug-message" role="status" data-testid="text-face-model-message">{faceModelMessage}</p>}
        </div>
      )}
    </section>
  );
}
