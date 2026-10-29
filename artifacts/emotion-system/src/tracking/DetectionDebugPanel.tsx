import type { ModelStatus } from './types';

interface DetectionDebugPanelProps {
  debugMode: boolean;
  onToggle: () => void;
  modelStatus: ModelStatus;
  modelMessage: string;
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
              <dt>Model Status</dt>
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
          </dl>
          {modelMessage && <p className="detection-debug-message" role="status" data-testid="text-model-message">{modelMessage}</p>}
        </div>
      )}
    </section>
  );
}
