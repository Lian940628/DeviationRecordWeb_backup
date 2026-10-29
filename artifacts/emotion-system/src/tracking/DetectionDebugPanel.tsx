import type { ModelStatus } from './types';
import type { ExpressionReadout, FaceDebugRecord, UnknownReason } from './expressionTypes';
import { useAppLanguage, useTranslation } from '../i18n';

interface DetectionDebugPanelProps {
  debugMode: boolean;
  onToggle: () => void;
  modelStatus: ModelStatus;
  modelMessage: string;
  faceModelStatus: ModelStatus;
  faceModelMessage: string;
  detectedFaces: number;
  inferenceTimeMs: number;
  lastSuccessfulFaceAt: number | null;
  unknownReason: UnknownReason | null;
  faceDiagnostics: FaceDebugRecord[];
  expressions: ExpressionReadout[];
  personCount: number;
  averageScore: number | null;
  validScoreSamples: number;
  lastUpdatedAt: number | null;
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
  lastSuccessfulFaceAt,
  unknownReason,
  faceDiagnostics,
  expressions,
  personCount,
  averageScore,
  validScoreSamples,
  lastUpdatedAt,
  detectionFps,
  renderingFps,
  activeTrackIds,
}: DetectionDebugPanelProps) {
  const { language } = useAppLanguage();
  const t = useTranslation();
  return (
    <section className="detection-debug" aria-label={t('Detection diagnostics')} data-testid="panel-detection-debug">
      <button
        type="button"
        className="detection-debug-toggle"
        onClick={onToggle}
        aria-expanded={debugMode}
        aria-controls="detection-debug-content"
        data-testid="button-toggle-detection-debug"
      >
        <span className="detection-debug-toggle-label">{t('Debug Mode')}</span>
        <span className={`detection-debug-switch${debugMode ? ' is-on' : ''}`} aria-hidden="true">
          <span />
        </span>
        <span className="detection-debug-toggle-state">{t(debugMode ? 'ON' : 'OFF')}</span>
      </button>
      {debugMode && (
        <div id="detection-debug-content" className="detection-debug-content" data-testid="detection-debug-content">
          <div className="detection-debug-heading">
            <span>{t('System readout')}</span>
            <span className={`detection-status-mark status-${modelStatus}`} aria-hidden="true" />
          </div>
          <dl className="detection-debug-metrics">
            <div className="detection-debug-row">
              <dt>{t('Person Model Status')}</dt>
              <dd className={`detection-status-text status-${modelStatus}`} data-testid="text-model-status">{t(statusLabels[modelStatus])}</dd>
            </div>
            <div className="detection-debug-row">
              <dt>{t('Person Count')}</dt>
              <dd data-testid="text-detected-person-count">{personCount}</dd>
            </div>
            <div className="detection-debug-row">
              <dt>{t('Average Score')}</dt>
              <dd data-testid="text-average-score">{averageScore === null ? t('N/A') : averageScore.toFixed(3)}</dd>
            </div>
            <div className="detection-debug-row">
              <dt>{t('Valid Score Samples')}</dt>
              <dd data-testid="text-valid-score-samples">{validScoreSamples}</dd>
            </div>
            <div className="detection-debug-row">
              <dt>{t('Last Updated')}</dt>
              <dd data-testid="text-average-score-updated">
                {lastUpdatedAt === null
                  ? 'N/A'
                  : new Date(lastUpdatedAt).toLocaleTimeString(language === 'zh' ? 'zh-TW' : 'en', {
                    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                  })}
              </dd>
            </div>
            <div className="detection-debug-row">
              <dt>{t('Detection FPS')}</dt>
              <dd data-testid="text-detection-fps">{Number.isFinite(detectionFps) ? detectionFps.toFixed(1) : '0.0'}</dd>
            </div>
            <div className="detection-debug-row">
              <dt>{t('Rendering FPS')}</dt>
              <dd data-testid="text-rendering-fps">{Number.isFinite(renderingFps) ? renderingFps.toFixed(1) : '0.0'}</dd>
            </div>
            <div className="detection-debug-row detection-debug-track-row">
              <dt>{t('Active Track IDs')}</dt>
              <dd data-testid="text-active-track-ids">
                {activeTrackIds.length
                  ? activeTrackIds.map(formatTrackId).join(' · ')
                  : '—'}
              </dd>
            </div>
            <div className="detection-debug-row">
              <dt>{t('Face Model Status')}</dt>
              <dd className={`detection-status-text status-${faceModelStatus}`} data-testid="text-face-model-status">{t(statusLabels[faceModelStatus])}</dd>
            </div>
            <div className="detection-debug-row">
              <dt>{t('Face Model Ready')}</dt>
              <dd data-testid="text-face-model-ready">{t(faceModelStatus === 'ready' ? 'YES' : 'NO')}</dd>
            </div>
            <div className="detection-debug-row">
              <dt>{t('Detected Face Count')}</dt>
              <dd data-testid="text-detected-face-count">{detectedFaces}</dd>
            </div>
            <div className="detection-debug-row">
              <dt>{t('Blendshape Count')}</dt>
              <dd data-testid="text-blendshape-count">
                {faceDiagnostics.length
                  ? faceDiagnostics.map((face) => `F${String(face.faceNumber).padStart(2, '0')}:${face.blendshapeCount}`).join(' · ')
                  : '—'}
              </dd>
            </div>
            <div className="detection-debug-row">
              <dt>{t('Inference Time')}</dt>
              <dd data-testid="text-face-inference-time">{Number.isFinite(inferenceTimeMs) ? `${inferenceTimeMs.toFixed(1)} ms` : '—'}</dd>
            </div>
            <div className="detection-debug-row">
              <dt>{t('Last Successful Face Detection Time')}</dt>
              <dd data-testid="text-last-face-detection-time">
                {lastSuccessfulFaceAt === null
                  ? t('NEVER')
                  : `${new Date(lastSuccessfulFaceAt).toLocaleTimeString()} · ${Math.max(0, (Date.now() - lastSuccessfulFaceAt) / 1000).toFixed(1)}s ${t('AGO')}`}
              </dd>
            </div>
            <div className="detection-debug-row">
              <dt>{t('UNKNOWN Reason')}</dt>
              <dd data-testid="text-face-unknown-reason">{unknownReason ?? '—'}</dd>
            </div>
          </dl>
          <div className="detection-debug-expression-heading">{t('Per-person result · heuristic support')}</div>
          {expressions.length ? (
            <div className="detection-debug-expression-list">
              {expressions.map((expression) => (
                <div className="detection-debug-expression" key={expression.trackId}>
                  <div className="detection-debug-expression-row">
                    <span>{t('PERSON')} {formatTrackId(expression.trackId)} · {t('MATCHED PERSON ID')}</span>
                    <strong>{expression.matchedPersonId === null ? '—' : formatTrackId(expression.matchedPersonId)}</strong>
                  </div>
                  <div className="detection-debug-expression-row">
                    <span>{t('RAW EXPRESSION')}</span>
                    <strong>{t(expression.rawLabel)}{expression.rawScore === null ? '' : ` · ${expression.rawScore.toFixed(2)}`}</strong>
                  </div>
                  <div className="detection-debug-expression-row">
                    <span>{t('SMOOTHED EXPRESSION')}</span>
                    <strong>{t(expression.label)}</strong>
                  </div>
                  <div className="detection-debug-expression-row">
                    <span>{t('RELATIVE RULE INDEX · NOT PROBABILITY')}</span>
                    <strong>{expression.score === null ? '—' : expression.score.toFixed(2)}</strong>
                  </div>
                  <div className="detection-debug-expression-row">
                    <span>{t('BLENDSHAPE COUNT · UNKNOWN REASON')}</span>
                    <strong>{expression.blendshapeCount} · {expression.unknownReason ?? '—'}</strong>
                  </div>
                  {expression.topBlendshapes.length > 0 && (
                    <div className="detection-debug-expression-row">
                      <span>{t('TOP 5 BLENDSHAPES')}</span>
                      <strong>{expression.topBlendshapes.map((item) => `${item.name} ${item.score.toFixed(2)}`).join(' · ')}</strong>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="detection-debug-message">{t('Waiting for a tracked person and a reliable face view.')}</p>
          )}
          {faceDiagnostics.length > 0 && (
            <div className="detection-debug-expression-list" data-testid="face-frame-diagnostics">
              {faceDiagnostics.map((face) => (
                <div className="detection-debug-expression" key={face.faceNumber}>
                  <div className="detection-debug-expression-heading">{t('FACE')} {String(face.faceNumber).padStart(2, '0')} · {t('FRAME DIAGNOSTICS')}</div>
                  <div className="detection-debug-expression-row">
                    <span>{t('BLENDSHAPE COUNT')}</span>
                    <strong>{face.blendshapeCount} ({face.invalidBlendshapeCount} {t('INVALID')})</strong>
                  </div>
                  <div className="detection-debug-expression-row">
                    <span>{t('RAW EXPRESSION')}</span>
                    <strong>{t(face.rawExpression)}{face.rawScore === null ? '' : ` · ${face.rawScore.toFixed(2)}`}</strong>
                  </div>
                  <div className="detection-debug-expression-row">
                    <span>{t('SMOOTHED EXPRESSION')}</span>
                    <strong>{t(face.smoothedExpression)}</strong>
                  </div>
                  <div className="detection-debug-expression-row">
                    <span>{t('MATCHED PERSON ID')}</span>
                    <strong>{face.matchedPersonId === null ? '—' : formatTrackId(face.matchedPersonId)}</strong>
                  </div>
                  <div className="detection-debug-expression-row">
                    <span>{t('SOURCE FACE SIZE / ANALYSIS')}</span>
                    <strong>{face.faceWidthPx} × {face.faceHeightPx} px · {face.analysisSource}</strong>
                  </div>
                  {face.candidateSupports.map((candidate) => (
                    <div className="detection-debug-expression-row" key={candidate.label}>
                      <span>{t(candidate.label)} {t('SUPPORT / MINIMUM')}</span>
                      <strong>
                        {candidate.score.toFixed(2)} / {candidate.minimum.toFixed(2)} · {t('CUES')} {t(candidate.cuesSatisfied ? 'MET' : 'MISSING')}
                        <br />
                        {candidate.cues.map((cue) => `${cue.name} ${cue.score.toFixed(2)}`).join(' · ')}
                      </strong>
                    </div>
                  ))}
                  <div className="detection-debug-expression-row">
                    <span>{t('POSE / UNKNOWN REASON')}</span>
                    <strong>{t(face.poseReliable ? 'RELIABLE' : 'LOW')} · {face.unknownReason ?? '—'}</strong>
                  </div>
                  <div className="detection-debug-expression-row">
                    <span>{t('TOP 5 BLENDSHAPES')}</span>
                    <strong>{face.topBlendshapes.length
                      ? face.topBlendshapes.map((item) => `${item.name} ${item.score.toFixed(2)}`).join(' · ')
                      : '—'}
                    </strong>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="detection-debug-message">
            {t('Relative display score: ACTIVE = .50 + .50 × class support; NEUTRAL = .50 × neutral support. Thus active expressions score above .50 and NEUTRAL at or below .50; not calibrated probabilities. Raw class support: HAPPY = .76 × smile + .24 × cheek squint; SAD = .55 × frown + .45 × inner brow; ANGRY = .60 × brow down + .40 × strongest of eye squint, mouth press and nose sneer. SURPRISED = .43 × eye wide + .37 × jaw open + .20 × inner brow; NEUTRAL support = 1 − strongest raw facial-action cue. HAPPY ≥ .24; SAD ≥ .12 with frown + inner brow or strong bilateral frown; ANGRY ≥ .14 with brow down + a second action; SURPRISED ≥ .25. Labels require a .04 lead and two confirming frames. Neutral fallback is used when the strongest weighted class support is ≤ .20. Faces below the normalized geometry threshold or with unreliable poses remain UNKNOWN. Scores use different rules by label and are not directly comparable; uncertain cases are UNKNOWN.')}
          </p>
          <p className="detection-debug-message">
            {t('Average Score uses finite displayed expression scores only, once per person per completed face inference. It is a heuristic display average, not a calibrated probability; detection confidence is not included.')}
          </p>
          {modelMessage && <p className="detection-debug-message" role="status" data-testid="text-model-message">{t(modelMessage)}</p>}
          {faceModelMessage && <p className="detection-debug-message" role="status" data-testid="text-face-model-message">{t(faceModelMessage)}</p>}
        </div>
      )}
    </section>
  );
}
