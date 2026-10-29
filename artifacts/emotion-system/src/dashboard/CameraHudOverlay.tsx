import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { CameraStatus } from '../camera/useCameraController';
import type { ExpressionReadout } from '../tracking/expressionTypes';
import type { ModelStatus, PersonTrack } from '../tracking/types';
import type { VisualMode } from '../visual-controls/visualControlsTypes';
import { useTranslation } from '../i18n';
import type { SessionAverageScore } from '../tracking/useSessionAverageScore';
import {
  emotionShares,
  formatPersonId,
  formatSessionDuration,
  integerEmotionPercentages,
  KNOWN_EMOTIONS,
  validEmotionCount,
  type KnownEmotion,
} from './sessionAnalyticsMath';
import type { SessionAnalyticsSnapshot } from './useSessionAnalytics';
import type { SystemEvent } from './useSystemEventLog';
import type { ScanEffectSettings } from './BiometricDashboard';
import './cameraHud.css';

const EMOTION_COLORS: Record<KnownEmotion, string> = {
  NEUTRAL: '#a5a69e',
  HAPPY: '#5defa7',
  SAD: '#b6d1ef',
  ANGRY: '#ed475a',
  SURPRISED: '#f2f0e7',
};

const STATUS_LABELS: Record<ModelStatus, string> = {
  idle: 'Idle',
  loading: 'Loading',
  ready: 'Ready',
  error: 'Error',
};

const STAGE_LABELS: Record<VisualMode, string> = {
  normal: 'Normal image',
  anomaly: 'Person anomaly',
  particle: 'Particle field',
  line: 'Line contour',
};

const SCAN_COLORS: Record<ScanEffectSettings['color'], string> = {
  cyan: '#e5e2d7',
  teal: '#5defa7',
  white: '#f6f2e7',
};

interface CameraHudOverlayProps {
  cameraStatus: CameraStatus;
  personModelStatus: ModelStatus;
  faceModelStatus: ModelStatus;
  personCount: number;
  tracks: PersonTrack[];
  expressions: ExpressionReadout[];
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

function scoreText(score: number | null | undefined) {
  return score === null || score === undefined || !Number.isFinite(score) ? '—' : score.toFixed(2);
}

function clockText(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function trendPath(values: Array<number | null>) {
  let open = false;
  return values.map((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      open = false;
      return '';
    }
    const x = values.length < 2 ? 110 : 4 + (index / (values.length - 1)) * 212;
    const y = 30 - (Math.max(0, Math.min(100, value)) / 100) * 25;
    const command = `${open ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    open = true;
    return command;
  }).join(' ');
}

export function CameraHudOverlay({
  cameraStatus,
  personModelStatus,
  faceModelStatus,
  personCount,
  tracks,
  expressions,
  detectionFps,
  renderingFps,
  visualStage,
  sessionDurationSeconds,
  averageScore,
  analytics,
  systemEvents,
  scanSettings,
  onScanSettingsChange,
}: CameraHudOverlayProps) {
  const t = useTranslation();
  const [expanded, setExpanded] = useState(
    () => typeof window === 'undefined' || !window.matchMedia('(max-width: 600px)').matches,
  );
  const shares = emotionShares(analytics.counts);
  const percentages = integerEmotionPercentages(analytics.counts);
  const hasEmotionSamples = validEmotionCount(analytics.counts) > 0;
  const trackIds = tracks.map((track) => track.id);
  const latestEvents = systemEvents.slice(-3).reverse();
  const scanStyle = {
    '--hud-scan-color': SCAN_COLORS[scanSettings.color],
  } as CSSProperties;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)');
    const updateForViewport = (event: MediaQueryListEvent) => setExpanded(!event.matches);
    setExpanded(!media.matches);
    media.addEventListener('change', updateForViewport);
    return () => media.removeEventListener('change', updateForViewport);
  }, []);

  return (
    <section
      className={`camera-hud${expanded ? ' is-expanded' : ' is-compact'}`}
      aria-label={t('AI biometric analysis dashboard')}
      data-testid="camera-hud"
      style={scanStyle}
    >
      <header className="camera-hud-topline">
        <div className="camera-hud-title">
          <span className="camera-hud-mark" aria-hidden="true">///</span>
          <span>EMOTION / SYSTEM</span>
          <small>{t('LOCAL / NO UPLOAD')}</small>
        </div>
        <div className="camera-hud-top-status">
          <span className={`hud-feed-state${cameraStatus === 'live' ? ' is-live' : cameraStatus === 'error' ? ' is-error' : ''}`}>
            <i aria-hidden="true" />{t(cameraStatus === 'live' ? 'FEED ACTIVE' : cameraStatus === 'error' ? 'INPUT ERROR' : 'INPUT IDLE')}
          </span>
          <button
            type="button"
            className="camera-hud-expand"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-label={t(expanded ? 'COMPACT HUD' : 'EXPAND HUD')}
            data-testid="button-toggle-camera-hud"
          >
            {expanded ? 'HUD −' : 'HUD +'}
          </button>
        </div>
      </header>

      <div className="camera-hud-content" data-hud-expanded={expanded}>
        <aside className="camera-hud-rail camera-hud-people" aria-label={t('PERSON COUNT')}>
          <div className="camera-hud-panel-heading">
            <span>{t('PERSON COUNT')}</span>
            <span>{t('ACTIVE TRACK IDS')}</span>
          </div>
          <div className="camera-hud-count" data-testid="camera-hud-person-count">
            <strong>{String(personCount).padStart(2, '0')}</strong>
            <span>{trackIds.length ? trackIds.map(formatPersonId).join(' · ') : '—'}</span>
          </div>

          <div className="camera-hud-list-heading">{t('ACTIVE PERSONS')}</div>
          <div className="camera-hud-person-list">
            {tracks.length === 0 ? (
              <div className="camera-hud-empty">{t('NO TRACKED SUBJECT')}</div>
            ) : tracks.slice(0, 4).map((track) => {
              const expression = expressions.find((item) => item.trackId === track.id);
              const label = expression?.label ?? 'UNKNOWN';
              return (
                <article className="camera-hud-person" key={track.id} data-testid={`camera-hud-person-${track.id}`}>
                  <div className="camera-hud-person-top">
                    <b>{t('PERSON ID:')} {formatPersonId(track.id)}</b>
                    <span>{t('TRACKING')}</span>
                  </div>
                  <div className="camera-hud-expression">
                    <span>{t('EXPRESSION')}</span>
                    <strong className={`emotion-${label.toLowerCase()}`}>{t(label)}</strong>
                  </div>
                  <div className="camera-hud-score">
                    <span>{t('RELATIVE RULE INDEX')}</span>
                    <b>{scoreText(expression?.score)}</b>
                  </div>
                </article>
              );
            })}
            {tracks.length > 4 && <div className="camera-hud-more">+ {tracks.length - 4} {t('MORE TRACKS')}</div>}
          </div>

          <div className="camera-hud-schematic">
            <span>{t('BODY SCAN')} · {t('SCHEMATIC')}</span>
            <span>{t('GENERIC FIGURE · NOT POSE DATA')}</span>
          </div>
        </aside>

        <aside className="camera-hud-rail camera-hud-system" aria-label={t('SYSTEM ANALYSIS')}>
          <div className="camera-hud-panel-heading">
            <span>{t('SYSTEM ANALYSIS')}</span>
            <span>{t('LOCAL ONLY')}</span>
          </div>
          <dl className="camera-hud-status-list">
            <div><dt>{t('PERSON MODEL STATUS')}</dt><dd className={`hud-status-${personModelStatus}`}>{t(STATUS_LABELS[personModelStatus])}</dd></div>
            <div><dt>{t('FACE MODEL STATUS')}</dt><dd className={`hud-status-${faceModelStatus}`}>{t(STATUS_LABELS[faceModelStatus])}</dd></div>
            <div><dt>{t('DETECTION FPS')}</dt><dd>{Number.isFinite(detectionFps) ? detectionFps.toFixed(1) : '0.0'}</dd></div>
            <div><dt>{t('RENDERING FPS')}</dt><dd>{Number.isFinite(renderingFps) ? renderingFps.toFixed(1) : '0.0'}</dd></div>
            <div><dt>{t('CURRENT VISUAL STAGE')}</dt><dd>{t(STAGE_LABELS[visualStage])}</dd></div>
            <div><dt>{t('SESSION DURATION')}</dt><dd>{formatSessionDuration(sessionDurationSeconds)}</dd></div>
          </dl>

          <div className="camera-hud-scan-control">
            <div className="camera-hud-scan-heading">
              <span>{t('SCAN EFFECT')}</span>
              <button
                type="button"
                className={`camera-hud-scan-toggle${scanSettings.enabled ? ' is-on' : ''}`}
                onClick={() => onScanSettingsChange({ enabled: !scanSettings.enabled })}
                aria-pressed={scanSettings.enabled}
                data-testid="camera-hud-toggle-scan"
              >
                {t(scanSettings.enabled ? 'ON' : 'OFF')}
              </button>
            </div>
            <label className="camera-hud-range">
              <span>{t('SCAN SPEED')} <b>{scanSettings.speedSeconds}s</b></span>
              <input
                type="range"
                min="4"
                max="16"
                step="1"
                value={scanSettings.speedSeconds}
                onChange={(event) => onScanSettingsChange({ speedSeconds: Number(event.currentTarget.value) })}
                aria-label={t('Scan speed')}
                data-testid="camera-hud-scan-speed"
              />
            </label>
            <label className="camera-hud-range">
              <span>{t('SCAN OPACITY')} <b>{Math.round(scanSettings.opacity * 100)}%</b></span>
              <input
                type="range"
                min="0.04"
                max="0.24"
                step="0.01"
                value={scanSettings.opacity}
                onChange={(event) => onScanSettingsChange({ opacity: Number(event.currentTarget.value) })}
                aria-label={t('Scan opacity')}
                data-testid="camera-hud-scan-opacity"
              />
            </label>
            <label className="camera-hud-range camera-hud-color">
              <span>{t('SCAN COLOR')}</span>
              <select
                value={scanSettings.color}
                onChange={(event) => onScanSettingsChange({ color: event.currentTarget.value as ScanEffectSettings['color'] })}
                aria-label={t('Scan color')}
                data-testid="camera-hud-scan-color"
              >
                <option value="cyan">{t('Signal white')}</option>
                <option value="teal">{t('Active green')}</option>
                <option value="white">{t('Soft white')}</option>
              </select>
            </label>
          </div>
        </aside>

        <footer className="camera-hud-bottom">
          <section className="camera-hud-session">
            <div className="camera-hud-panel-heading"><span>{t('AVERAGE SCORE')}</span><span>{t('SESSION')}</span></div>
            <strong className="camera-hud-average" data-testid="camera-hud-average-score">
              {averageScore.averageScore === null ? t('N/A') : averageScore.averageScore.toFixed(3)}
            </strong>
            <div className="camera-hud-session-meta">
              <span>{t('TOTAL VALID SAMPLES')} <b>{analytics.validSamples}</b></span>
              <span>{t('UNKNOWN SAMPLE COUNT')} <b>{analytics.unknownSamples}</b></span>
            </div>
          </section>

          <section className="camera-hud-emotions">
            <div className="camera-hud-panel-heading">
              <span>{t('EMOTION ANALYSIS')}</span>
              <span>{t('SESSION TOTAL')} · {t('10 SEC BINS')}</span>
            </div>
            {hasEmotionSamples ? (
              <div className="camera-hud-emotion-bars" data-testid="camera-hud-emotion-bars">
                {KNOWN_EMOTIONS.map((emotion) => {
                  const percentage = percentages[emotion] ?? 0;
                  return (
                    <div className="camera-hud-emotion-row" key={emotion}>
                      <span>{t(emotion)}</span>
                      <i><b style={{ width: `${percentage}%`, background: EMOTION_COLORS[emotion] }} /></i>
                      <strong>{percentage}%</strong>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="camera-hud-empty">{t('NO DATA')}</div>
            )}
            <svg className="camera-hud-trend" viewBox="0 0 220 36" role="img" aria-label={t('Session emotion trend')}>
              <path d="M4 5H216M4 18H216M4 31H216" />
              {KNOWN_EMOTIONS.map((emotion) => (
                <path
                  key={emotion}
                  className="camera-hud-trend-series"
                  d={trendPath(analytics.trend.map((point) => point.session[emotion]))}
                  style={{ color: EMOTION_COLORS[emotion] }}
                />
              ))}
            </svg>
          </section>

          <section className="camera-hud-events">
            <div className="camera-hud-panel-heading">
              <span>{t('SYSTEM LOG')}</span>
              <span>{analytics.lastUpdatedAt ? clockText(analytics.lastUpdatedAt) : t('N/A')}</span>
            </div>
            {latestEvents.length === 0 ? (
              <div className="camera-hud-empty">{t('Waiting for system events.')}</div>
            ) : (
              <ol>
                {latestEvents.map((event) => (
                  <li key={event.id} className={`hud-event-${event.level}`}>
                    <time>{clockText(event.at)}</time>
                    <span>&gt; {t(event.key)}{event.trackId !== undefined ? ` · ${formatPersonId(event.trackId)}` : ''}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </footer>
      </div>

      {!expanded && (
        <div className="camera-hud-compact">
          <strong>{String(personCount).padStart(2, '0')} {t('PERSON COUNT')}</strong>
          <span>{tracks.slice(0, 2).map((track) => {
            const expression = expressions.find((item) => item.trackId === track.id);
            return `${formatPersonId(track.id)} · ${t(expression?.label ?? 'UNKNOWN')}`;
          }).join('  /  ') || t('NO TRACKED SUBJECT')}</span>
          <b>{averageScore.averageScore === null ? t('N/A') : averageScore.averageScore.toFixed(2)}</b>
        </div>
      )}
    </section>
  );
}
