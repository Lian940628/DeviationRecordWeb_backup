import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { CameraStatus } from '../camera/useCameraController';
import type { ModelStatus, PersonTrack } from '../tracking/types';
import type { VisualMode } from '../visual-controls/visualControlsTypes';
import { useAppLanguage, useTranslation } from '../i18n';
import type { SessionAverageScore } from '../tracking/useSessionAverageScore';
import {
  formatPersonId,
  formatSessionDuration,
  KNOWN_EMOTIONS,
  type KnownEmotion,
} from './sessionAnalyticsMath';
import type { SessionAnalyticsSnapshot } from './useSessionAnalytics';
import type { SystemEvent } from './useSystemEventLog';
import type { HudSettings } from './useHudSettings';
import { BodyScanPanel, type ScanEffectSettings } from './BiometricDashboard';
import './cameraHudV2.css';

const EMOTIONS: Array<KnownEmotion | 'UNKNOWN'> = [...KNOWN_EMOTIONS, 'UNKNOWN'];

const EMOTION_COLORS: Record<KnownEmotion | 'UNKNOWN', string> = {
  HAPPY: '#52D4BE',
  SAD: '#42B8E8',
  ANGRY: '#E8C77A',
  SURPRISED: '#93A9D1',
  NEUTRAL: '#85AFC4',
  UNKNOWN: '#536E84',
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

interface CameraHudOverlayProps {
  cameraStatus: CameraStatus;
  personModelStatus: ModelStatus;
  faceModelStatus: ModelStatus;
  personCount: number;
  tracks: PersonTrack[];
  detectionFps: number;
  renderingFps: number;
  visualStage: VisualMode;
  selectedTrackId: number | null;
  onSelectTrack: (id: number) => void;
  sessionDurationSeconds: number;
  averageScore: SessionAverageScore;
  analytics: SessionAnalyticsSnapshot;
  systemEvents: SystemEvent[];
  scanSettings: ScanEffectSettings;
  hudSettings: HudSettings;
  onHudSettingChange: (next: Partial<HudSettings>) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function linePath(values: Array<number | null>, width = 240, height = 50) {
  const valid = values.map((value) => (value !== null && Number.isFinite(value) ? clamp(value, 0, 100) : null));
  let active = false;
  return valid.map((value, index) => {
    if (value === null) {
      active = false;
      return '';
    }
    const x = valid.length < 2 ? width / 2 : 2 + (index / (valid.length - 1)) * (width - 4);
    const y = height - 3 - (value / 100) * (height - 8);
    const command = `${active ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    active = true;
    return command;
  }).join(' ');
}

function sparkPath(values: number[], width = 100, height = 24) {
  if (values.length < 2) return '';
  const maximum = Math.max(1, ...values);
  return values.map((value, index) => {
    const x = 2 + (index / (values.length - 1)) * (width - 4);
    const y = height - 3 - (clamp(value, 0, maximum) / maximum) * (height - 7);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function timeLabel(timestamp: number, language: 'en' | 'zh') {
  return new Date(timestamp).toLocaleTimeString(language === 'zh' ? 'zh-TW' : 'en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function ExpressionDonut({
  counts,
  total,
  animated,
  t,
}: {
  counts: SessionAnalyticsSnapshot['counts'];
  total: number;
  animated: boolean;
  t: (value: string) => string;
}) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  let consumed = 0;
  return (
    <div className={`hud-v2-donut-wrap${animated ? ' is-animated' : ''}`} data-testid="hud-emotion-donut">
      <svg className="hud-v2-donut" viewBox="0 0 88 88" role="img" aria-label={t('Session emotion composition')}>
        <circle className="hud-v2-donut-track" cx="44" cy="44" r={radius} />
        {total > 0 && EMOTIONS.map((emotion) => {
          const count = counts[emotion] ?? 0;
          if (count <= 0) return null;
          const length = (count / total) * circumference;
          const offset = consumed;
          consumed += length;
          return (
            <circle
              key={emotion}
              className="hud-v2-donut-segment"
              cx="44"
              cy="44"
              r={radius}
              stroke={EMOTION_COLORS[emotion]}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 44 44)"
            />
          );
        })}
      </svg>
      <div className="hud-v2-donut-legend">
        {EMOTIONS.map((emotion) => (
          <span key={emotion}>
            <i style={{ backgroundColor: EMOTION_COLORS[emotion] }} />
            <span>{t(emotion)}</span>
            <b>{counts[emotion] ?? 0}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function CameraHudOverlayV2({
  cameraStatus,
  personModelStatus,
  faceModelStatus,
  personCount,
  tracks,
  detectionFps,
  renderingFps,
  visualStage,
  selectedTrackId,
  onSelectTrack,
  sessionDurationSeconds,
  averageScore,
  analytics,
  systemEvents,
  scanSettings,
  hudSettings,
  onHudSettingChange,
}: CameraHudOverlayProps) {
  const t = useTranslation();
  const { language } = useAppLanguage();
  const [expanded, setExpanded] = useState(
    () => typeof window === 'undefined' || !window.matchMedia('(max-width: 700px)').matches,
  );
  const [fpsHistory, setFpsHistory] = useState<Array<{ detection: number; rendering: number }>>([]);
  const latestFps = useRef({ detection: detectionFps, rendering: renderingFps });
  latestFps.current = { detection: detectionFps, rendering: renderingFps };

  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const updateForViewport = (event: MediaQueryListEvent) => setExpanded(!event.matches);
    setExpanded(!media.matches);
    media.addEventListener('change', updateForViewport);
    return () => media.removeEventListener('change', updateForViewport);
  }, []);

  useEffect(() => {
    if (cameraStatus !== 'live') {
      setFpsHistory([]);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setFpsHistory((history) => [
        ...history,
        {
          detection: Math.max(0, latestFps.current.detection),
          rendering: Math.max(0, latestFps.current.rendering),
        },
      ].slice(-24));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cameraStatus]);

  const hudStyle = {
    '--hud-panel-alpha': hudSettings.opacity,
    '--hud-scale': hudSettings.scale,
    '--hud-glow': hudSettings.glowIntensity,
  } as CSSProperties;
  const totalEmotionSamples = EMOTIONS.reduce((sum, emotion) => sum + (analytics.counts[emotion] ?? 0), 0);
  const score = averageScore.averageScore;
  const scoreProgress = score === null ? 0 : clamp(score, 0, 1) * 100;
  const scoreCircumference = 2 * Math.PI * 34;
  const latestEvents = systemEvents.slice(-8).reverse();
  const bodyScanSettings = { ...scanSettings, enabled: hudSettings.bodyScanEnabled };
  const stageLabel = t(STAGE_LABELS[visualStage]);

  if (!hudSettings.visible) {
    return (
      <div className="camera-hud-v2 hud-v2-hidden" style={hudStyle}>
        <button
          type="button"
          className="hud-v2-reveal"
          onClick={() => onHudSettingChange({ visible: true })}
          data-testid="button-show-hud"
        >
          {t('HUD SHOW')}
        </button>
      </div>
    );
  }

  return (
    <section
      className={`camera-hud-v2${expanded ? ' is-expanded' : ' is-collapsed'}${hudSettings.chartAnimationEnabled ? ' chart-motion-on' : ''}`}
      style={hudStyle}
      aria-label={t('AI biometric analysis dashboard')}
      data-testid="camera-hud"
    >
      <header className="hud-v2-topbar">
        <div className="hud-v2-brand">
          <i aria-hidden="true" />
          <strong>EMOTION / SYSTEM</strong>
          <span>{t(cameraStatus === 'live' ? 'FEED ACTIVE' : cameraStatus === 'error' ? 'INPUT ERROR' : 'INPUT IDLE')}</span>
        </div>
        <div className="hud-v2-header-actions">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-label={t(expanded ? 'HUD COLLAPSE' : 'HUD EXPAND')}
            data-testid="button-toggle-camera-hud"
          >
            {t(expanded ? 'HUD COLLAPSE' : 'HUD EXPAND')}
          </button>
          <button
            type="button"
            onClick={() => onHudSettingChange({ visible: false })}
            aria-label={t('HUD HIDE')}
            data-testid="button-hide-hud"
          >
            {t('HUD HIDE')}
          </button>
        </div>
      </header>

      {expanded ? (
        <aside className="hud-v2-panel" aria-label={t('HUD data modules')}>
          <section className="hud-v2-module hud-v2-person-module">
            <header>
              <span>01 / {t('PERSON DETECTION')}</span>
              <i>{t(cameraStatus === 'live' ? 'FEED ACTIVE' : cameraStatus === 'error' ? 'INPUT ERROR' : 'INPUT IDLE')}</i>
            </header>
            <div className="hud-v2-person-count">
              <span>{t('PERSON COUNT')}</span>
              <strong key={personCount} data-testid="camera-hud-person-count">{String(personCount).padStart(2, '0')}</strong>
            </div>
            <div className="hud-v2-track-row">
              <span>{t('ACTIVE TRACK IDS')}</span>
              <strong>{tracks.length ? tracks.map((track) => formatPersonId(track.id)).join(' · ') : '—'}</strong>
            </div>
            <label className="hud-v2-person-select">
              <span>{t('SELECTED PERSON ID')}</span>
              <select
                value={selectedTrackId ?? ''}
                disabled={!tracks.length}
                onChange={(event) => onSelectTrack(Number(event.currentTarget.value))}
                aria-label={t('Select person ID')}
                data-testid="select-hud-person"
              >
                {!tracks.length
                  ? <option value="">{t(cameraStatus === 'live' ? 'WAITING FOR SUBJECT' : 'WAITING FOR CAMERA')}</option>
                  : tracks.map((track) => (
                    <option value={track.id} key={track.id}>{t('PERSON ID:')} {formatPersonId(track.id)}</option>
                  ))}
              </select>
            </label>
          </section>

          <section className="hud-v2-module hud-v2-body-module">
            <header><span>02 / {t('BODY SCAN')}</span><i>{t('SCHEMATIC')}</i></header>
            <BodyScanPanel
              compact
              tracks={tracks}
              cameraActive={cameraStatus === 'live'}
              selectedTrackId={selectedTrackId}
              onSelectTrack={onSelectTrack}
              scanSettings={bodyScanSettings}
            />
          </section>

          <section className="hud-v2-module hud-v2-analysis-module">
            <header><span>03 / {t('EMOTION ANALYSIS')}</span><i>{t('SESSION TOTAL')}</i></header>
            <div className="hud-v2-chart-grid">
              <div className="hud-v2-score-ring-wrap">
                <svg className="hud-v2-score-ring" viewBox="0 0 88 88" role="img" aria-label={t('Average heuristic score')}>
                  <circle className="hud-v2-score-track" cx="44" cy="44" r="34" />
                  <circle
                    className="hud-v2-score-progress"
                    cx="44"
                    cy="44"
                    r="34"
                    strokeDasharray={`${(scoreProgress / 100) * scoreCircumference} ${scoreCircumference}`}
                    transform="rotate(-90 44 44)"
                  />
                </svg>
                <div className="hud-v2-score-center">
                  <strong data-testid="camera-hud-average-score">{score === null ? t('N/A') : score.toFixed(2)}</strong>
                  <span>{t('AVG SCORE')}</span>
                </div>
                <small>{t('RELATIVE RULE INDEX')}</small>
              </div>
              <div className="hud-v2-composition">
                <div className="hud-v2-chart-title">{t('EXPRESSION MIX')} <span>{totalEmotionSamples}</span></div>
                <ExpressionDonut
                  counts={analytics.counts}
                  total={totalEmotionSamples}
                  animated={hudSettings.chartAnimationEnabled}
                  t={t}
                />
              </div>
            </div>
            <div className="hud-v2-trend-heading">
              <span>{t('SESSION TREND')}</span><span>{t('10 SEC BINS')}</span>
            </div>
            {analytics.trend.length > 0 ? (
              <svg
                className={`hud-v2-trend${hudSettings.chartAnimationEnabled ? ' is-animated' : ''}`}
                viewBox="0 0 244 54"
                preserveAspectRatio="none"
                role="img"
                aria-label={t('Session emotion trend')}
                data-testid="hud-emotion-trend"
              >
                <path className="hud-v2-trend-grid" d="M2 8H242M2 27H242M2 46H242" />
                <g key={analytics.lastUpdatedAt ?? analytics.trend.length}>
                  {KNOWN_EMOTIONS.map((emotion) => (
                    <path
                      key={emotion}
                      className="hud-v2-trend-line"
                      style={{ color: EMOTION_COLORS[emotion] }}
                      pathLength={1}
                      d={linePath(analytics.trend.map((point) => point.session[emotion]))}
                    />
                  ))}
                </g>
              </svg>
            ) : (
              <div className="hud-v2-chart-empty">{t('NO RECORDED TREND YET')}</div>
            )}
            <div className="hud-v2-analysis-foot">
              <span>{t('VALID SAMPLES')} <b>{analytics.validSamples}</b></span>
              <span>{t('UNKNOWN')} <b>{analytics.unknownSamples}</b></span>
            </div>
          </section>

          <section className="hud-v2-module hud-v2-performance-module">
            <header><span>04 / {t('SYSTEM PERFORMANCE')}</span><i>{t('LOCAL ONLY')}</i></header>
            <div className="hud-v2-performance-row">
              <span>{t('DETECTION FPS')}<b>{detectionFps.toFixed(1)}</b></span>
              <svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
                <path d={sparkPath(fpsHistory.map((item) => item.detection))} />
              </svg>
            </div>
            <div className="hud-v2-performance-row">
              <span>{t('RENDERING FPS')}<b>{renderingFps.toFixed(1)}</b></span>
              <svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
                <path d={sparkPath(fpsHistory.map((item) => item.rendering))} />
              </svg>
            </div>
            <div className="hud-v2-performance-status">
              <span><i className={`status-${personModelStatus}`} />{t('PERSON MODEL')} <b>{t(STATUS_LABELS[personModelStatus])}</b></span>
              <span><i className={`status-${faceModelStatus}`} />{t('FACE MODEL')} <b>{t(STATUS_LABELS[faceModelStatus])}</b></span>
              <span>{t('CURRENT VISUAL STAGE')} <b>{stageLabel}</b></span>
              <span>{t('SESSION DURATION')} <b>{formatSessionDuration(sessionDurationSeconds)}</b></span>
            </div>
          </section>

          {hudSettings.showSystemDetails && (
            <details className="hud-v2-details">
              <summary>{t('SHOW SYSTEM DETAILS')} <span>{systemEvents.length}</span></summary>
              <ol>
                {latestEvents.length === 0
                  ? <li>{t('Waiting for system events.')}</li>
                  : latestEvents.map((event) => (
                    <li key={event.id} className={`hud-event-${event.level}`}>
                      <time>{timeLabel(event.at, language)}</time>
                      <span>&gt; {t(event.key)}{event.trackId !== undefined ? ` · ${formatPersonId(event.trackId)}` : ''}</span>
                    </li>
                  ))}
              </ol>
            </details>
          )}
        </aside>
      ) : (
        <div className="hud-v2-collapsed" data-testid="camera-hud-compact">
          <div><span>{t('PERSON COUNT')}</span><strong>{String(personCount).padStart(2, '0')}</strong></div>
          <div><span>{t('AVERAGE SCORE')}</span><strong>{score === null ? t('N/A') : score.toFixed(2)}</strong></div>
          <div><span>{t('CURRENT VISUAL STAGE')}</span><strong>{stageLabel}</strong></div>
        </div>
      )}
    </section>
  );
}
