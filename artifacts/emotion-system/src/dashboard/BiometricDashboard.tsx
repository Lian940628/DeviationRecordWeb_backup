import type { CSSProperties } from 'react';
import { useState } from 'react';
import type { CameraStatus } from '../camera/useCameraController';
import type { ExpressionLabel } from '../tracking/expressionTypes';
import type { ModelStatus, PersonTrack } from '../tracking/types';
import type { VisualMode } from '../visual-controls/visualControlsTypes';
import { useAppLanguage, useTranslation } from '../i18n';
import type { SessionAverageScore } from '../tracking/useSessionAverageScore';
import type { SessionAnalyticsSnapshot } from './useSessionAnalytics';
import {
  emotionShares,
  formatPersonId,
  formatSessionDuration,
  integerEmotionPercentages,
  KNOWN_EMOTIONS,
  validEmotionCount,
  type EmotionShares,
  type KnownEmotion,
} from './sessionAnalyticsMath';
import type { SystemEvent } from './useSystemEventLog';
import './biometricDashboard.css';

export type ScanColor = 'cyan' | 'teal' | 'white';

export interface ScanEffectSettings {
  enabled: boolean;
  speedSeconds: number;
  opacity: number;
  color: ScanColor;
}

const SCAN_COLORS: Record<ScanColor, string> = {
  cyan: '#42B8E8',
  teal: '#52D4BE',
  white: '#E1E6E8',
};

const EMOTION_COLORS: Record<KnownEmotion, string> = {
  NEUTRAL: '#8498A3',
  HAPPY: '#52D4BE',
  SAD: '#42B8E8',
  ANGRY: '#D6535B',
  SURPRISED: '#E1E6E8',
};

const VISUAL_STAGE_KEYS: Record<VisualMode, string> = {
  normal: 'Normal image',
  anomaly: 'Person anomaly',
  particle: 'Particle field',
  line: 'Line contour',
};

const STATUS_KEYS: Record<ModelStatus, string> = {
  idle: 'Idle',
  loading: 'Loading',
  ready: 'Ready',
  error: 'Error',
};

function formatClock(timestamp: number | null, language: 'en' | 'zh', t: (value: string) => string) {
  if (timestamp === null) return t('N/A');
  return new Date(timestamp).toLocaleTimeString(language === 'zh' ? 'zh-TW' : 'en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

function getChartPath(values: Array<number | null>): string {
  const commands: string[] = [];
  let segmentOpen = false;
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      segmentOpen = false;
      return;
    }
    const x = values.length <= 1 ? 120 : 8 + (index / (values.length - 1)) * 224;
    const y = 68 - (Math.max(0, Math.min(100, value)) / 100) * 56;
    commands.push(`${segmentOpen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
    segmentOpen = true;
  });
  return commands.join(' ');
}

interface BodyScanPanelProps {
  tracks: PersonTrack[];
  cameraActive: boolean;
  selectedTrackId: number | null;
  onSelectTrack: (id: number) => void;
  scanSettings: ScanEffectSettings;
}

export function BodyScanPanel({
  tracks,
  cameraActive,
  selectedTrackId,
  onSelectTrack,
  scanSettings,
}: BodyScanPanelProps) {
  const t = useTranslation();
  const selectedTrack = tracks.find((track) => track.visible && track.id === selectedTrackId);
  const style = {
    '--scan-duration': `${scanSettings.speedSeconds}s`,
    '--scan-opacity': scanSettings.opacity,
    '--scan-color': SCAN_COLORS[scanSettings.color],
  } as CSSProperties;

  return (
    <section className="body-scan-panel biometric-panel" aria-label={t('Body scan')}>
      <div className="biometric-panel-heading">
        <span>{t('BODY SCAN')}</span>
        <span className={`scan-state${scanSettings.enabled ? ' is-active' : ''}`}>
          <i aria-hidden="true" />{t(scanSettings.enabled ? 'SCAN ACTIVE' : 'SCAN PAUSED')}
        </span>
      </div>
      <div className="schematic-label">
        <span>{t('SCHEMATIC')}</span>
        <span>{t('GENERIC FIGURE · NOT POSE DATA')}</span>
      </div>
      <div className={`body-schematic${scanSettings.enabled ? ' is-scanning' : ''}`} style={style}>
        <svg viewBox="0 0 180 270" role="img" aria-label={t('Schematic human outline')}>
          <g className="body-scan-grid" aria-hidden="true">
            <path d="M10 45H170M10 90H170M10 135H170M10 180H170M10 225H170" />
            <path d="M45 10V260M90 10V260M135 10V260" />
            <circle cx="90" cy="135" r="62" />
            <circle cx="90" cy="135" r="38" />
          </g>
          <g className="body-outline">
            <circle cx="90" cy="34" r="15" />
            <path d="M81 52 L73 62 L67 99 L73 124 L76 151 L69 187 L65 239 L75 242 L88 197 L90 168 L93 197 L105 242 L115 239 L111 187 L104 151 L107 124 L113 99 L107 62 L99 52 Z" />
            <path d="M75 65 L52 75 L34 111 L40 116 L61 92 L68 84" />
            <path d="M105 65 L128 75 L146 111 L140 116 L119 92 L112 84" />
            <path d="M73 121 L90 128 L107 121 M76 151 L90 157 L104 151" />
            <path d="M67 239 L64 255 L80 255 L88 197 M115 239 L118 255 L102 255 L93 197" />
          </g>
          <g className="body-scan-crosshair" aria-hidden="true">
            <path d="M90 0V24M90 246V270M0 135H25M155 135H180" />
            <circle cx="90" cy="135" r="3" />
          </g>
        </svg>
        {scanSettings.enabled && <div className="body-scan-sweep" aria-hidden="true" />}
        <span className="schematic-coord top-left">X 0.50 / Y 0.00</span>
        <span className="schematic-coord bottom-right">X 0.50 / Y 1.00</span>
      </div>
      <label className="dashboard-field-label" htmlFor="body-scan-track">{t('SELECT PERSON ID')}</label>
      <select
        id="body-scan-track"
        className="dashboard-select"
        value={selectedTrackId ?? ''}
        onChange={(event) => onSelectTrack(Number(event.currentTarget.value))}
        disabled={tracks.length === 0}
        data-testid="select-body-scan-person"
      >
        {tracks.length === 0
          ? <option value="">{t(cameraActive ? 'WAITING FOR SUBJECT' : 'WAITING FOR CAMERA')}</option>
          : tracks.filter((track) => track.visible).map((track) => (
            <option value={track.id} key={track.id}>{t('PERSON ID:')} {formatPersonId(track.id)}</option>
          ))}
      </select>
      <dl className="body-scan-metrics">
        <div><dt>{t('PERSON ID')}</dt><dd>{selectedTrack ? formatPersonId(selectedTrack.id) : '—'}</dd></div>
        <div><dt>{t('TRACKING STATUS')}</dt><dd className={selectedTrack ? 'is-live' : ''}>{t(selectedTrack ? 'TRACKING' : cameraActive ? 'WAITING FOR SUBJECT' : 'WAITING FOR CAMERA')}</dd></div>
        <div><dt>{t('DETECTED SUBJECT')}</dt><dd>{selectedTrack ? `${t('PERSON')} ${formatPersonId(selectedTrack.id)}` : t('NO TRACKED SUBJECT')}</dd></div>
      </dl>
      <div className="scan-progress-label">
        <span>{t('SCAN PROGRESS · VISUAL CYCLE')}</span>
        <span>{t('SCHEMATIC')}</span>
      </div>
      <div className={`scan-progress${scanSettings.enabled ? ' is-running' : ''}`} style={style} aria-hidden="true">
        <span />
      </div>
      <p className="schematic-disclaimer">{t('Illustrative scan cycle only. No pose landmarks are available.')}</p>
    </section>
  );
}

interface BiometricDashboardProps {
  cameraStatus: CameraStatus;
  personModelStatus: ModelStatus;
  faceModelStatus: ModelStatus;
  personCount: number;
  activeTrackIds: number[];
  detectionFps: number;
  renderingFps: number;
  visualStage: VisualMode;
  sessionDurationSeconds: number;
  averageScore: SessionAverageScore;
  analytics: SessionAnalyticsSnapshot;
  systemEvents: SystemEvent[];
  scanSettings: ScanEffectSettings;
  onScanSettingsChange: (next: Partial<ScanEffectSettings>) => void;
}

export function BiometricDashboard({
  cameraStatus,
  personModelStatus,
  faceModelStatus,
  personCount,
  activeTrackIds,
  detectionFps,
  renderingFps,
  visualStage,
  sessionDurationSeconds,
  averageScore,
  analytics,
  systemEvents,
  scanSettings,
  onScanSettingsChange,
}: BiometricDashboardProps) {
  const t = useTranslation();
  const { language } = useAppLanguage();
  const [scope, setScope] = useState('session');
  const availableTrackIds = Object.keys(analytics.byTrack).sort((a, b) => Number(a) - Number(b));
  const activeScope = scope === 'session' || Object.hasOwn(analytics.byTrack, scope) ? scope : 'session';
  const counts = activeScope === 'session'
    ? analytics.counts
    : analytics.byTrack[activeScope] ?? analytics.counts;
  const percentages = integerEmotionPercentages(counts);
  const validCount = validEmotionCount(counts);
  const unknownCount = counts.UNKNOWN;
  const shares = emotionShares(counts);
  const trendHasData = analytics.trend.some((point) => {
    const source = activeScope === 'session' ? point.session : point.byTrack[activeScope];
    return source && Object.values(source).some((value) => value !== null);
  });
  const statusLabel = (status: ModelStatus) => t(STATUS_KEYS[status]);
  const trackIdsText = activeTrackIds.length
    ? activeTrackIds.map(formatPersonId).join(' · ')
    : '—';
  const updateTime = formatClock(analytics.lastUpdatedAt, language, t);
  const scoreUpdateTime = formatClock(averageScore.lastUpdatedAt, language, t);
  const emotionRows = KNOWN_EMOTIONS.map((emotion) => ({
    emotion,
    percentage: percentages[emotion],
    share: shares[emotion],
    count: counts[emotion],
  }));

  return (
    <section className="biometric-dashboard biometric-panel" aria-label={t('AI biometric analysis dashboard')}>
      <div className="biometric-panel-heading">
        <span>{t('AI BIOMETRIC ANALYSIS')}</span>
        <span className={`dashboard-live-state${cameraStatus === 'live' ? ' is-live' : ''}`}>
          <i aria-hidden="true" />{t(cameraStatus === 'live' ? 'LIVE SESSION' : 'SESSION IDLE')}
        </span>
      </div>

      <section className="dashboard-section" aria-labelledby="person-count-heading">
        <div className="dashboard-section-heading">
          <h2 id="person-count-heading">{t('PERSON COUNT')}</h2>
          <span>{t('ACTIVE TRACK IDS')}</span>
        </div>
        <div className="count-readout">
          <strong data-testid="dashboard-person-count">{String(personCount).padStart(2, '0')}</strong>
          <span>{trackIdsText}</span>
        </div>
      </section>

      <section className="dashboard-section average-score-section" aria-labelledby="average-score-heading">
        <div className="dashboard-section-heading">
          <h2 id="average-score-heading">{t('AVERAGE SCORE')}</h2>
          <span>{t('SESSION')}</span>
        </div>
        <div className="score-readout">
          <strong data-testid="dashboard-average-score">
            {averageScore.averageScore === null ? t('N/A') : averageScore.averageScore.toFixed(3)}
          </strong>
          <span>{t('RELATIVE RULE INDEX')}</span>
        </div>
        <div className="dashboard-inline-metrics">
          <span>{t('VALID SAMPLES')} <b data-testid="dashboard-score-samples">{averageScore.validSamples}</b></span>
          <span>{t('LAST UPDATED')} <b>{scoreUpdateTime}</b></span>
        </div>
        <p className="dashboard-caveat">{t('Expression display scores only; heuristic index, not a calibrated probability. Detection confidence is excluded.')}</p>
      </section>

      <section className="dashboard-section" aria-labelledby="emotion-analysis-heading">
        <div className="dashboard-section-heading">
          <h2 id="emotion-analysis-heading">{t('EMOTION ANALYSIS')}</h2>
          <label className="scope-select-label">
            <span>{t('SCOPE')}</span>
            <select
              className="dashboard-select dashboard-scope-select"
              value={activeScope}
              onChange={(event) => setScope(event.currentTarget.value)}
              aria-label={t('Emotion analysis scope')}
              data-testid="select-emotion-scope"
            >
              <option value="session">{t('SESSION TOTAL')}</option>
              {availableTrackIds.map((id) => (
                <option key={id} value={id}>{t('PERSON')} {formatPersonId(Number(id))}</option>
              ))}
            </select>
          </label>
        </div>
        {validCount === 0 ? (
          <div className="dashboard-empty-state" data-testid="emotion-no-data">{t('NO DATA')}</div>
        ) : (
          <div className="emotion-bars" data-testid="emotion-analysis-bars">
            {emotionRows.map(({ emotion, percentage, share, count }) => (
              <div className="emotion-bar-row" key={emotion} data-testid={`emotion-row-${emotion.toLowerCase()}`}>
                <span className="emotion-bar-label">{t(emotion)}</span>
                <span className="emotion-bar-track"><i style={{ width: `${percentage ?? 0}%` }} /></span>
                <strong>{percentage === null ? '—' : `${percentage}%`}</strong>
                <small>n={count} · {formatPercent(share)}</small>
              </div>
            ))}
          </div>
        )}
        <div className="dashboard-inline-metrics unknown-count">
          <span>{t('UNKNOWN SAMPLE COUNT')}</span>
          <b data-testid="dashboard-unknown-samples">{unknownCount}</b>
        </div>
        <div className="trend-heading">
          <span>{t('SESSION EMOTION TREND')}</span>
          <span>{t('10 SEC BINS')}</span>
        </div>
        {trendHasData ? (
          <div className="trend-chart-wrap">
            <svg className="trend-chart" viewBox="0 0 240 76" role="img" aria-label={t('Session emotion trend')}>
              <path className="trend-grid" d="M8 12H232M8 40H232M8 68H232" />
              {KNOWN_EMOTIONS.map((emotion) => {
                const values = analytics.trend.map((point) => {
                  const source = activeScope === 'session' ? point.session : point.byTrack[activeScope];
                  return source?.[emotion] ?? null;
                });
                return (
                  <g key={emotion} style={{ color: EMOTION_COLORS[emotion] }}>
                    <path className="trend-series" d={getChartPath(values)} />
                    {values.map((value, index) => {
                      if (value === null || !Number.isFinite(value)) return null;
                      const x = values.length <= 1 ? 120 : 8 + (index / (values.length - 1)) * 224;
                      const y = 68 - (Math.max(0, Math.min(100, value)) / 100) * 56;
                      return <circle className="trend-point" key={`${emotion}-${index}`} cx={x} cy={y} r="1.8" />;
                    })}
                  </g>
                );
              })}
            </svg>
            <div className="trend-legend">
              {KNOWN_EMOTIONS.map((emotion) => (
                <span key={emotion}><i style={{ background: EMOTION_COLORS[emotion] }} />{t(emotion)}</span>
              ))}
            </div>
          </div>
        ) : (
          <div className="trend-empty-state">{t('Trend appears after valid samples are collected.')}</div>
        )}
      </section>

      <section className="dashboard-section scan-settings-section" aria-labelledby="scan-settings-heading">
        <div className="dashboard-section-heading">
          <h2 id="scan-settings-heading">{t('SCAN EFFECT')}</h2>
          <button
            type="button"
            className={`scan-toggle${scanSettings.enabled ? ' is-on' : ''}`}
            aria-pressed={scanSettings.enabled}
            onClick={() => onScanSettingsChange({ enabled: !scanSettings.enabled })}
            data-testid="button-toggle-scan-effect"
          >
            {t(scanSettings.enabled ? 'ON' : 'OFF')}
          </button>
        </div>
        <label className="scan-control">
          <span>{t('SCAN SPEED')} <b>{scanSettings.speedSeconds}s</b></span>
          <input
            type="range"
            min="4"
            max="16"
            step="1"
            value={scanSettings.speedSeconds}
            onChange={(event) => onScanSettingsChange({ speedSeconds: Number(event.currentTarget.value) })}
            aria-label={t('Scan speed')}
            data-testid="input-scan-speed"
          />
        </label>
        <label className="scan-control">
          <span>{t('SCAN OPACITY')} <b>{Math.round(scanSettings.opacity * 100)}%</b></span>
          <input
            type="range"
            min="0.04"
            max="0.24"
            step="0.01"
            value={scanSettings.opacity}
            onChange={(event) => onScanSettingsChange({ opacity: Number(event.currentTarget.value) })}
            aria-label={t('Scan opacity')}
            data-testid="input-scan-opacity"
          />
        </label>
        <label className="scan-control scan-color-control">
          <span>{t('SCAN COLOR')}</span>
          <select
            className="dashboard-select"
            value={scanSettings.color}
            onChange={(event) => onScanSettingsChange({ color: event.currentTarget.value as ScanColor })}
            aria-label={t('Scan color')}
            data-testid="select-scan-color"
          >
            <option value="cyan">{t('Data cyan')}</option>
            <option value="teal">{t('Active teal')}</option>
            <option value="white">{t('Cool white')}</option>
          </select>
        </label>
      </section>

      <section className="dashboard-section system-analysis-section" aria-labelledby="system-analysis-heading">
        <div className="dashboard-section-heading">
          <h2 id="system-analysis-heading">{t('SYSTEM ANALYSIS')}</h2>
          <span>{t('LOCAL ONLY')}</span>
        </div>
        <dl className="system-readout">
          <div><dt>{t('CAMERA STATUS')}</dt><dd className={`status-${cameraStatus}`}>{t(cameraStatus === 'live' ? 'Live' : STATUS_KEYS[cameraStatus === 'error' ? 'error' : 'idle'])}</dd></div>
          <div><dt>{t('PERSON MODEL STATUS')}</dt><dd className={`status-${personModelStatus}`}>{statusLabel(personModelStatus)}</dd></div>
          <div><dt>{t('FACE MODEL STATUS')}</dt><dd className={`status-${faceModelStatus}`}>{statusLabel(faceModelStatus)}</dd></div>
          <div><dt>{t('PERSON COUNT')}</dt><dd>{personCount}</dd></div>
          <div><dt>{t('ACTIVE TRACK IDS')}</dt><dd className="system-track-list">{trackIdsText}</dd></div>
          <div><dt>{t('DETECTION FPS')}</dt><dd>{Number.isFinite(detectionFps) ? detectionFps.toFixed(1) : '0.0'}</dd></div>
          <div><dt>{t('RENDERING FPS')}</dt><dd>{Number.isFinite(renderingFps) ? renderingFps.toFixed(1) : '0.0'}</dd></div>
          <div><dt>{t('CURRENT VISUAL STAGE')}</dt><dd>{t(VISUAL_STAGE_KEYS[visualStage])}</dd></div>
          <div><dt>{t('SESSION DURATION')}</dt><dd>{formatSessionDuration(sessionDurationSeconds)}</dd></div>
          <div><dt>{t('TOTAL VALID SAMPLES')}</dt><dd>{analytics.validSamples}</dd></div>
          <div><dt>{t('LAST DATA UPDATE')}</dt><dd>{updateTime}</dd></div>
        </dl>
      </section>

      <section className="dashboard-section system-log-section" aria-labelledby="system-log-heading">
        <div className="dashboard-section-heading">
          <h2 id="system-log-heading">{t('SYSTEM LOG')}</h2>
          <span>{systemEvents.length.toString().padStart(2, '0')} / 18</span>
        </div>
        {systemEvents.length === 0 ? (
          <div className="system-log-empty">{t('Waiting for system events.')}</div>
        ) : (
          <ol className="system-log" aria-live="polite" data-testid="system-event-log">
            {systemEvents.slice(-8).map((event) => (
              <li key={event.id} className={`system-event is-${event.level}`}>
                <time>{formatClock(event.at, language, t)}</time>
                <span>
                  <b>&gt; {t(event.key)}</b>
                  {event.trackId !== undefined && ` · ${t('ID')} ${formatPersonId(event.trackId)}`}
                  {event.expression && ` · ${t(event.expression as ExpressionLabel)}`}
                  {event.detail && ` · ${event.key === 'Analysis updated'
                    ? `${event.detail} ${t('valid emotion samples')}`
                    : event.key === 'Visual stage changed'
                      ? t(VISUAL_STAGE_KEYS[event.detail as VisualMode] ?? event.detail)
                      : event.key === 'Person detected' || event.key === 'Person count changed'
                        ? event.detail
                        : t(event.detail)}`}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <p className="dashboard-disclaimer">{t('Expression labels are heuristic estimates. This dashboard does not identify people or infer inner emotional states.')}</p>
    </section>
  );
}

interface ScanEffectOverlayProps {
  settings: ScanEffectSettings;
  cameraActive: boolean;
}

export function ScanEffectOverlay({ settings, cameraActive }: ScanEffectOverlayProps) {
  const style = {
    '--scan-duration': `${settings.speedSeconds}s`,
    '--scan-opacity': settings.opacity,
    '--scan-color': SCAN_COLORS[settings.color],
  } as CSSProperties;
  const active = settings.enabled && cameraActive;
  return (
    <div className={`scan-effect-overlay${active ? ' is-active' : ''}`} style={style} aria-hidden="true">
      <span className="scan-sweep-line" />
      <span className="scan-crosshair scan-crosshair-top"><i /></span>
      <span className="scan-crosshair scan-crosshair-bottom"><i /></span>
      <span className="scan-coordinate scan-coordinate-top">X 0.00 · Y 0.00</span>
      <span className="scan-coordinate scan-coordinate-bottom">X 1.00 · Y 1.00</span>
    </div>
  );
}
