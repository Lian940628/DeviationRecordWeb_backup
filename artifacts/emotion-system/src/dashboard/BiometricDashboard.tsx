import type { CSSProperties } from 'react';
import { useId, useState } from 'react';
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
  cyan: '#E5E2D7',
  teal: '#5DEFA7',
  white: '#F6F2E7',
};

const EMOTION_COLORS: Record<KnownEmotion, string> = {
  NEUTRAL: '#A5A69E',
  HAPPY: '#5DEFA7',
  SAD: '#B6D1EF',
  ANGRY: '#ED475A',
  SURPRISED: '#F2F0E7',
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

const BODY_SCAN_FRAGMENTS = [
  [36, 80, 19, 1, .7], [124, 73, 17, 1, .6], [29, 108, 26, 2, .42],
  [127, 103, 24, 1, .66], [23, 137, 20, 1, .48], [132, 129, 23, 2, .52],
  [31, 160, 15, 1, .56], [134, 170, 20, 1, .72], [42, 192, 17, 2, .44],
  [119, 204, 25, 1, .62], [54, 224, 19, 1, .5], [111, 236, 22, 2, .56],
  [77, 57, 25, 1, .34], [65, 98, 47, 1, .45], [73, 118, 37, 2, .38],
  [68, 151, 49, 1, .56], [67, 181, 40, 1, .42], [87, 215, 24, 1, .48],
] as const;

interface BodyScanPanelProps {
  tracks: PersonTrack[];
  cameraActive: boolean;
  selectedTrackId: number | null;
  onSelectTrack: (id: number) => void;
  scanSettings: ScanEffectSettings;
  compact?: boolean;
}

export function BodyScanPanel({
  tracks,
  cameraActive,
  selectedTrackId,
  onSelectTrack,
  scanSettings,
  compact = false,
}: BodyScanPanelProps) {
  const t = useTranslation();
  const figureId = `body-figure-${useId().replace(/:/g, '')}`;
  const selectedTrack = tracks.find((track) => track.visible && track.id === selectedTrackId);
  const style = {
    '--scan-duration': `${scanSettings.speedSeconds}s`,
    '--scan-opacity': scanSettings.opacity,
    '--scan-color': SCAN_COLORS[scanSettings.color],
  } as CSSProperties;

  return (
    <section className={`body-scan-panel biometric-panel${compact ? ' body-scan-panel--compact' : ''}`} aria-label={t('Body scan')}>
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
          <defs>
            <linearGradient id={`${figureId}-fill`} x1="0.12" y1="0" x2="0.86" y2="1">
              <stop offset="0" stopColor="#f3f7f5" />
              <stop offset=".36" stopColor="#bfced2" />
              <stop offset=".7" stopColor="#e9f0ef" />
              <stop offset="1" stopColor="#72858c" />
            </linearGradient>
            <pattern id={`${figureId}-pixels`} width="3.5" height="3.5" patternUnits="userSpaceOnUse">
              <circle cx=".8" cy=".8" r=".65" fill="#f4ffff" opacity=".82" />
              <circle cx="2.7" cy="2.7" r=".42" fill="#92d6e0" opacity=".75" />
            </pattern>
            <filter id={`${figureId}-glow`} x="-35%" y="-15%" width="170%" height="140%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="blur" />
              <feFlood floodColor="#9deeff" floodOpacity=".48" result="glow-color" />
              <feComposite in="glow-color" in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <clipPath id={`${figureId}-silhouette`} clipPathUnits="userSpaceOnUse">
              <circle cx="90" cy="30" r="12" />
              <path d="M83 42 L82 48 C75 50 69 53 65 59 L61 79 L66 102 L72 119 L75 145 C78 153 84 158 91 160 C98 158 104 153 107 145 L110 119 L116 102 L121 79 L117 59 C112 53 106 50 99 48 L98 42 Z" />
              <path d="M68 55 C62 57 58 62 55 70 L48 91 L42 111 L34 133 L30 143 C29 147 32 150 36 150 L41 147 L47 132 L56 114 L65 96 L74 78 L77 65 Z" />
              <path d="M112 55 C118 57 122 62 125 70 L132 91 L138 111 L146 133 L150 143 C151 147 148 150 144 150 L139 147 L133 132 L124 114 L115 96 L106 78 L103 65 Z" />
              <path d="M77 144 C71 155 68 169 68 185 L66 211 L62 246 C61 252 64 256 69 257 L77 255 L84 224 L90 194 L95 158 L92 152 Z" />
              <path d="M94 153 L98 177 L105 198 L112 222 L119 248 C121 253 125 255 130 252 L135 249 L129 221 L125 195 L119 173 C116 162 111 153 105 147 Z" />
            </clipPath>
          </defs>
          <g className="body-scan-grid" aria-hidden="true">
            <path d="M10 45H170M10 90H170M10 135H170M10 180H170M10 225H170" />
            <path d="M45 10V260M90 10V260M135 10V260" />
            <circle cx="90" cy="135" r="62" />
          </g>
          <g clipPath={`url(#${figureId}-silhouette)`} filter={`url(#${figureId}-glow)`}>
            <rect x="24" y="12" width="132" height="250" fill={`url(#${figureId}-fill)`} />
            <rect x="24" y="12" width="132" height="250" fill={`url(#${figureId}-pixels)`} opacity=".56" />
            <path className="body-figure-highlight" d="M81 53 C69 74 76 99 85 113 L80 153 M102 55 C112 79 99 105 103 129 M76 164 C78 190 75 219 69 248 M106 160 C111 190 121 220 127 247" />
            <g className="body-figure-glitches">
              <rect x="27" y="68" width="126" height="1.6" />
              <rect x="31" y="96" width="119" height="1.2" />
              <rect x="25" y="124" width="130" height="2" />
              <rect x="38" y="151" width="105" height="1.4" />
              <rect x="29" y="179" width="124" height="1.1" />
              <rect x="41" y="205" width="92" height="1.7" />
              <rect x="50" y="231" width="79" height="1" />
            </g>
          </g>
          <g className="body-scan-fragments" aria-hidden="true">
            {BODY_SCAN_FRAGMENTS.map(([x, y, width, height, opacity], index) => (
              <rect key={index} x={x} y={y} width={width} height={height} opacity={opacity} />
            ))}
          </g>
          <path
            className="body-figure-edge"
            d="M78 51 C70 53 65 58 63 67 L58 91 L48 115 L35 142 M102 51 C110 53 115 58 117 67 L122 91 L132 115 L145 142 M75 146 C71 161 69 179 68 197 L64 249 M105 146 C111 164 116 184 121 203 L129 248"
          />
          <g className="body-scan-crosshair" aria-hidden="true">
            <path d="M90 0V20M90 250V270M0 135H22M158 135H180" />
            <circle cx="90" cy="135" r="2" />
          </g>
        </svg>
        {scanSettings.enabled && <div className="body-scan-sweep" aria-hidden="true" />}
        <span className="schematic-coord top-left">X 0.50 / Y 0.00</span>
        <span className="schematic-coord bottom-right">X 0.50 / Y 1.00</span>
      </div>
      {!compact && (
        <>
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
        </>
      )}
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
