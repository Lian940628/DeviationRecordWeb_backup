import { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Image,
  ImageUp,
  RotateCcw,
  Video,
} from 'lucide-react';
import type { AppLanguage } from '../../i18n';
import { deviationText as tx } from './copy';
import type { DeviationDraft } from './types';
import { InvitationEnvelope } from './InvitationEnvelope';
import { CertificationStamp } from './CertificationStamp';
import { playCertificationImpact } from './certificationAudio';

export type DeviationWorkflowStep = 1 | 2 | 3 | 4 | 5;

interface DeviationIdFormProps {
  draft: DeviationDraft;
  language: AppLanguage;
  photoName: string;
  photoReady: boolean;
  personSegmentationStatus: 'idle' | 'loading' | 'ready' | 'error';
  step: DeviationWorkflowStep;
  mp4Supported: boolean;
  outputFormat: DeviationDraft['output']['format'];
  busy: boolean;
  generated: boolean;
  imageReady: boolean;
  imageFilename: string;
  videoReady: boolean;
  videoFilename: string;
  exportProgress: number;
  invitationFileId: string;
  errorMessage: string;
  identityArrivalComplete: boolean;
  editorRef: { current: HTMLElement | null };
  onDraftChange: (patch: Partial<DeviationDraft>) => void;
  onPhotoChange: (file: File) => void;
  onStepChange: (step: DeviationWorkflowStep) => void;
  onInvitationOpened: () => void;
  onContinueProfile: () => boolean;
  onProfileCertified: () => void;
  onContinueDatasetChoice: () => void;
  onContinueDownload: () => void;
  onGenerate: () => void;
  onSaveImage: () => void;
  onDownloadImage: () => void;
  onSaveVideo: () => void;
  onDownloadVideo: () => void;
}

const workflowSteps: Array<{ step: DeviationWorkflowStep; label: string }> = [
  { step: 1, label: 'THE INVITATION' },
  { step: 2, label: 'PERSONNEL FILE' },
  { step: 3, label: 'ACCESS CONTROL' },
  { step: 4, label: 'DEVIATION PROCESS' },
  { step: 5, label: 'IDENTITY ISSUED' },
];

export function DeviationIdForm({
  draft,
  language,
  photoName,
  photoReady,
  personSegmentationStatus,
  step,
  mp4Supported,
  outputFormat,
  busy,
  generated,
  imageReady,
  imageFilename,
  videoReady,
  videoFilename,
  exportProgress,
  invitationFileId,
  errorMessage,
  identityArrivalComplete,
  editorRef,
  onDraftChange,
  onPhotoChange,
  onStepChange,
  onInvitationOpened,
  onContinueProfile,
  onProfileCertified,
  onContinueDatasetChoice,
  onContinueDownload,
  onGenerate,
  onSaveImage,
  onDownloadImage,
  onSaveVideo,
  onDownloadVideo,
}: DeviationIdFormProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [stampActive, setStampActive] = useState(false);
  const t = (value: string) => tx(language, value);
  const stepIndex = step - 1;
  const canContinueProfile = Boolean(draft.cardName.trim() && photoReady && personSegmentationStatus === 'ready');
  const handleProfileDraftChange = (patch: Partial<DeviationDraft>) => {
    setStampActive(false);
    onDraftChange(patch);
  };
  const submitForCertification = () => {
    if (!canContinueProfile || stampActive) return;
    if (onContinueProfile()) {
      playCertificationImpact();
      setStampActive(true);
    }
  };
  const handleStepChange = (nextStep: DeviationWorkflowStep) => {
    if (nextStep <= 2) setStampActive(false);
    onStepChange(nextStep);
  };

  return (
    <section className="deviation-panel deviation-editor" ref={editorRef} aria-label={t('DEVIATION ID WORKFLOW')}>
      <div className="deviation-panel-heading">
          <div><span className="deviation-kicker">{String(step).padStart(2, '0')} / 05 · {t(workflowSteps[stepIndex].label)}</span><h2>{t('SUBJECT RECORD')}</h2></div>
          <span className="deviation-panel-index">STEP {String(step).padStart(2, '0')} / 05</span>
      </div>

      <nav className="deviation-workflow-steps" aria-label={t('DEVIATION ID WORKFLOW')}>
        {workflowSteps.map(({ step: itemStep, label }, index) => (
          <button
            type="button"
            key={itemStep}
            className={itemStep === step ? 'is-active' : itemStep < step ? 'is-complete' : ''}
            aria-current={itemStep === step ? 'step' : undefined}
            disabled={busy || itemStep > step}
            onClick={() => handleStepChange(itemStep)}
          >
            <span>{String(itemStep).padStart(2, '0')}</span>
            <small>{t(label)}</small>
            {index < workflowSteps.length - 1 && <i aria-hidden="true" />}
          </button>
        ))}
      </nav>

      {step === 1 && errorMessage && <p className="deviation-error-message" role="alert">{errorMessage}</p>}

      {step === 1 && (
        <div className="deviation-workflow-content deviation-invitation-step">
          <InvitationEnvelope
            fileId={invitationFileId}
            language={language}
            onOpened={typeof onInvitationOpened === 'function' ? onInvitationOpened : () => onStepChange(2)}
          />
        </div>
      )}

      {step === 2 && (
        <div className="deviation-workflow-content deviation-personnel-form">
          <div className="deviation-section-label">{t('PROFILE DATA')} · {t('PHOTO PROCESSING STAYS LOCAL')}</div>
          <input
            ref={photoInputRef}
            className="deviation-visually-hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) {
                setStampActive(false);
                onPhotoChange(file);
              }
              event.currentTarget.value = '';
            }}
          />
          <button type="button" className="deviation-photo-upload" onClick={() => photoInputRef.current?.click()} disabled={busy || stampActive}>
            <ImageUp size={16} />
            <span><strong>{t('UPLOAD PHOTO')}</strong><small>{photoName || t('Choose a portrait image. It stays in this browser.')}</small></span>
          </button>
          <div className={`deviation-person-status deviation-person-status--${personSegmentationStatus}`} role="status">
            <i />
            <span>{t({
              idle: 'PERSON SEGMENTATION · LOCAL MODEL',
              loading: 'RUNNING LOCAL PERSON SEGMENTATION…',
              ready: 'PERSON DETECTED · BACKGROUND REMOVED LOCALLY',
              error: 'PERSON SEGMENTATION FAILED · CHOOSE A CLEAR PHOTO',
            }[personSegmentationStatus])}</span>
          </div>

          <div className="deviation-form-grid">
            <label className="deviation-field deviation-field--wide">
              <span>{t('CARD NAME')}</span>
              <input required maxLength={80} value={draft.cardName} onChange={(event) => handleProfileDraftChange({ cardName: event.currentTarget.value })} placeholder="NAME YOUR DEVIATION" disabled={busy || stampActive} />
            </label>
            <label className="deviation-field deviation-field--wide">
              <span>{t('SELF-DEFINITION')}</span>
              <input maxLength={80} value={draft.selfDefinition} onChange={(event) => handleProfileDraftChange({ selfDefinition: event.currentTarget.value })} placeholder="HOW DO YOU DEFINE YOURSELF?" disabled={busy || stampActive} />
            </label>
            <div className="deviation-field deviation-field--wide">
              <span>{t('USER ID')}</span>
              <div className="deviation-readonly-value">{draft.subjectId || t('ASSIGNED AUTOMATICALLY')}</div>
            </div>
          </div>

          <label className="deviation-slider deviation-self-check">
            <span><b>{t('SELF-DEVIATION CHECK')}</b><output>{draft.deviationLevel} / 100</output></span>
            <input type="range" min="1" max="100" step="1" value={draft.deviationLevel} onChange={(event) => handleProfileDraftChange({ deviationLevel: Number(event.currentTarget.value) })} disabled={busy || stampActive} />
            <small>{t('Choose the number that best reflects your own sense of deviation.')}</small>
          </label>

          <div className="deviation-workflow-actions deviation-certification-actions">
            <button type="button" className="deviation-button deviation-button--primary" data-testid="button-submit-certification" onClick={submitForCertification} disabled={busy || !canContinueProfile || stampActive}>
              {t(stampActive ? 'CERTIFYING…' : 'SUBMIT FOR CERTIFICATION')}<ArrowRight size={14} />
            </button>
          </div>
          {stampActive && (
            <CertificationStamp
              active
              language={language}
              onComplete={() => {
                setStampActive(false);
                if (typeof onProfileCertified === 'function') onProfileCertified();
                else onStepChange(3);
              }}
            />
          )}
        </div>
      )}

      {step === 3 && (
        <div className="deviation-workflow-content">
          <fieldset className="deviation-visibility-fieldset">
            <legend className="deviation-section-label">{t('DATASET CONTRIBUTION')}</legend>
            <label className={`deviation-visibility-option${draft.datasetVisibility === 'PUBLIC' ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="dataset-visibility"
                value="PUBLIC"
                checked={draft.datasetVisibility === 'PUBLIC'}
                onChange={() => onDraftChange({ datasetVisibility: 'PUBLIC' })}
              />
              <span className="deviation-visibility-copy">
                <strong>{t('PUBLIC · SHARE WITH THE DATASET')}</strong>
                <small>{t('Public contributors receive one lottery entry. I agree to publicly share the completed postcard image, video, and selected profile details.')}</small>
              </span>
            </label>
            <label className={`deviation-visibility-option${draft.datasetVisibility === 'PRIVATE' ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="dataset-visibility"
                value="PRIVATE"
                checked={draft.datasetVisibility === 'PRIVATE'}
                onChange={() => onDraftChange({ datasetVisibility: 'PRIVATE' })}
              />
              <span className="deviation-visibility-copy">
                <strong>{t('PRIVATE · KEEP THIS DEVICE ONLY')}</strong>
                <small>{t('Private keeps the finished work on this device. Nothing is published.')}</small>
              </span>
            </label>
          </fieldset>
          <p className="deviation-access-note">{t('PUBLIC upload begins automatically after both final files are generated in the last step.')}</p>
          <div className="deviation-workflow-actions deviation-workflow-actions--split">
            <button type="button" className="deviation-button" onClick={() => handleStepChange(2)} disabled={busy}><ArrowLeft size={13} />{t('BACK')}</button>
            <button type="button" className="deviation-button deviation-button--primary" onClick={onContinueDatasetChoice} disabled={busy || !photoReady || personSegmentationStatus !== 'ready'}>
              {t('CONFIRM DATASET CHOICE')}<ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="deviation-workflow-content">
          <div className="deviation-process-readout">
            <div><span>{t('ANOMALY INDEX')}</span><strong>{draft.deviationLevel}<small> / 100</small></strong></div>
            <div><span>{t('VISUAL MODE')}</span><strong>{t(draft.visualMode)}</strong></div>
            <div><span>{t('GLITCH INTENSITY')}</span><strong>{draft.animation.glitchIntensity}<small> / 100</small></strong></div>
          </div>
          <div className="deviation-id-readout">
            <span>{t('USER ID')}</span>
            <strong>{draft.subjectId || '—'}</strong>
            <small>{t('ASSIGNED AUTOMATICALLY')}</small>
          </div>
          <div className="deviation-section-label">{t('PHOTO CROP')}</div>
          <div className="deviation-crop-controls">
            <label className="deviation-slider"><span>{t('ZOOM')}<output>{draft.crop.zoom.toFixed(1)}×</output></span><input type="range" min="1" max="3" step=".05" value={draft.crop.zoom} onChange={(event) => onDraftChange({ crop: { ...draft.crop, zoom: Number(event.currentTarget.value) } })} /></label>
            <label className="deviation-slider"><span>{t('HORIZONTAL POSITION')}<output>{Math.round(draft.crop.x * 100)}</output></span><input type="range" min="-1" max="1" step=".01" value={draft.crop.x} onChange={(event) => onDraftChange({ crop: { ...draft.crop, x: Number(event.currentTarget.value) } })} /></label>
            <label className="deviation-slider"><span>{t('VERTICAL POSITION')}<output>{Math.round(draft.crop.y * 100)}</output></span><input type="range" min="-1" max="1" step=".01" value={draft.crop.y} onChange={(event) => onDraftChange({ crop: { ...draft.crop, y: Number(event.currentTarget.value) } })} /></label>
          </div>

          <div className="deviation-form-grid deviation-form-grid--settings">
            <label className="deviation-field">
              <span>{t('VISUAL MODE')}</span>
              <select value={draft.visualMode} onChange={(event) => onDraftChange({ visualMode: event.currentTarget.value as DeviationDraft['visualMode'] })}>
                {(['ARCHIVE', 'GLITCH', 'SIGNAL', 'MONO'] as const).map((mode) => <option value={mode} key={mode}>{t(mode)}</option>)}
              </select>
            </label>
            <label className="deviation-field">
              <span>{t('LOOP DURATION')}</span>
              <div className="deviation-readonly-value">{t('05 SEC · SEAMLESS LOOP')}</div>
            </label>
          </div>

          <div className="deviation-fragment-controls">
            <div className="deviation-section-label">{t('DYNAMIC IMAGE MASKS')} · {t('5 SEC LOOP')}</div>
            <div className="deviation-form-grid deviation-fragment-grid">
              <label className="deviation-field">
                <span>{t('BLOCK SIZE')}</span>
                <select value={draft.animation.blockSize} onChange={(event) => onDraftChange({ animation: { ...draft.animation, blockSize: event.currentTarget.value as DeviationDraft['animation']['blockSize'] } })}>
                  {(['LARGE', 'MEDIUM', 'SMALL'] as const).map((size) => <option value={size} key={size}>{t(size)}</option>)}
                </select>
              </label>
              <label className="deviation-field"><span>{t('BLOCK COUNT')} · {draft.animation.blockCount}</span><input type="range" min="4" max="9" step="1" value={draft.animation.blockCount} onChange={(event) => onDraftChange({ animation: { ...draft.animation, blockCount: Number(event.currentTarget.value) } })} /></label>
              <label className="deviation-field"><span>{t('REVEAL DENSITY')} · {draft.animation.revealDensity}%</span><input type="range" min="20" max="85" value={draft.animation.revealDensity} onChange={(event) => onDraftChange({ animation: { ...draft.animation, revealDensity: Number(event.currentTarget.value) } })} /></label>
              <label className="deviation-field"><span>{t('BLOCK FLICKER')} · {draft.animation.flickerSpeed} Hz</span><input type="range" min="3" max="8" step="1" value={draft.animation.flickerSpeed} onChange={(event) => onDraftChange({ animation: { ...draft.animation, flickerSpeed: Number(event.currentTarget.value) } })} /></label>
              <label className="deviation-field"><span>{t('BLOCK DISPLACEMENT')} · {draft.animation.fragmentDisplacement}</span><input type="range" min="0" max="100" value={draft.animation.fragmentDisplacement} onChange={(event) => onDraftChange({ animation: { ...draft.animation, fragmentDisplacement: Number(event.currentTarget.value) } })} /></label>
              <label className="deviation-field"><span>{t('GLITCH INTENSITY')} · {draft.animation.glitchIntensity}</span><input type="range" min="0" max="100" value={draft.animation.glitchIntensity} onChange={(event) => onDraftChange({ animation: { ...draft.animation, glitchIntensity: Number(event.currentTarget.value) } })} /></label>
              <label className="deviation-field"><span>{t('PARTICLE DENSITY')} · {draft.animation.particleDensity}</span><input type="range" min="0" max="100" value={draft.animation.particleDensity} onChange={(event) => onDraftChange({ animation: { ...draft.animation, particleDensity: Number(event.currentTarget.value) } })} /></label>
              <label className="deviation-field"><span>{t('PARTICLE SIZE')} · {draft.animation.particleSize}px</span><input type="range" min="1" max="8" step="1" value={draft.animation.particleSize} onChange={(event) => onDraftChange({ animation: { ...draft.animation, particleSize: Number(event.currentTarget.value) } })} /></label>
              <label className="deviation-field"><span>{t('PARTICLE MOTION')} · {draft.animation.particleMotion}</span><input type="range" min="0" max="100" value={draft.animation.particleMotion} onChange={(event) => onDraftChange({ animation: { ...draft.animation, particleMotion: Number(event.currentTarget.value) } })} /></label>
              <label className="deviation-field"><span>{t('PARTICLE GLOW')} · {draft.animation.particleGlow}</span><input type="range" min="0" max="100" value={draft.animation.particleGlow} onChange={(event) => onDraftChange({ animation: { ...draft.animation, particleGlow: Number(event.currentTarget.value) } })} /></label>
            </div>
          </div>

          <div className="deviation-output-settings">
            <div className="deviation-section-label">{t('OUTPUT SETTINGS')} · 9:16</div>
            <div className="deviation-form-grid">
              <label className="deviation-field">
                <span>{t('RESOLUTION')}</span>
                <select value={draft.output.resolution} onChange={(event) => onDraftChange({ output: { ...draft.output, resolution: event.currentTarget.value as DeviationDraft['output']['resolution'] } })}>
                  <option value="720p">{t('720p · 9:16')}</option>
                  <option value="1080p">{t('1080p · 9:16')}</option>
                </select>
              </label>
              <label className="deviation-field">
                <span>{t('FORMAT')}</span>
                <select value={outputFormat} onChange={(event) => onDraftChange({ output: { ...draft.output, format: event.currentTarget.value as DeviationDraft['output']['format'] } })}>
                  <option value="mp4" disabled={!mp4Supported}>{mp4Supported ? 'MP4 · H.264' : t('MP4 EXPORT NOT SUPPORTED')}</option>
                </select>
              </label>
            </div>
            <div className="deviation-checkbox deviation-checkbox--locked" aria-label={t('TECH CUES ALWAYS INCLUDED')}>
              <span aria-hidden="true">✓</span>
              <span>{t('TECH CUES ALWAYS INCLUDED')}</span><small>01 / 05 · 02 / 05 · 03 / 05 · 04 / 05 · 05 / 05</small>
            </div>
          </div>

          <div className="deviation-workflow-actions deviation-workflow-actions--split">
            <button type="button" className="deviation-button" onClick={() => onStepChange(3)} disabled={busy}><ArrowLeft size={13} />{t('BACK')}</button>
            <button type="button" className="deviation-button" onClick={onGenerate} disabled={busy}><RotateCcw size={13} />{t('REGENERATE')}</button>
            <button type="button" className="deviation-button deviation-button--primary" onClick={onContinueDownload} disabled={busy || !draft.subjectId}>
              {t('ISSUE TEMPORARY ID')}<ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="deviation-workflow-content">
          <div className="deviation-id-readout">
            <span>{t('USER ID')}</span>
            <strong>{draft.subjectId || '—'}</strong>
            <small>{videoReady ? videoFilename : t('A video file has not been exported yet.')}</small>
          </div>
          {!identityArrivalComplete && (
            <div className="deviation-issue-wait" role="status">
              <span>{t('ISSUING TEMPORARY ID…')}</span>
              <i />
            </div>
          )}
          {identityArrivalComplete && (
            <>
          <div className="deviation-download-card">
            <div className="deviation-download-card-title"><Image size={17} /><div><strong>{t('PNG IMAGE · SELECTED RESOLUTION · 9:16')}</strong><small>{imageReady ? imageFilename : t('A PNG image has not been exported yet.')}</small></div></div>
            <div className="deviation-workflow-actions">
              <button type="button" className="deviation-button deviation-button--primary" onClick={onSaveImage} disabled={busy || !generated || !photoReady || !draft.subjectId}>
                <Image size={14} />{t(imageReady ? 'EXPORT IMAGE AGAIN' : 'EXPORT PNG IMAGE')}
              </button>
              <button type="button" className="deviation-button" onClick={onDownloadImage} disabled={!imageReady || busy}>
                <Download size={14} />{t('DOWNLOAD IMAGE')}
              </button>
            </div>
          </div>
          <div className="deviation-download-card">
            <div className="deviation-download-card-title"><Video size={17} /><div><strong>{t('DOWNLOAD AREA')}</strong><small>{videoReady ? t('VIDEO READY · DOWNLOAD AVAILABLE.') : t('PREPARING MP4 WITH TECH CUES…')}</small></div></div>
            {busy && exportProgress > 0 && <div className="deviation-export-progress"><span style={{ width: `${Math.round(exportProgress * 100)}%` }} /><small>{Math.round(exportProgress * 100)}%</small></div>}
            <div className="deviation-workflow-actions">
              <button type="button" className="deviation-button deviation-button--primary" onClick={onSaveVideo} disabled={busy || !generated || !photoReady || !draft.subjectId || !mp4Supported}>
                <Video size={14} />{t(busy ? 'EXPORTING VIDEO…' : videoReady ? 'SAVE VIDEO AGAIN' : 'SAVE VIDEO')}
              </button>
              <button type="button" className="deviation-button" onClick={onDownloadVideo} disabled={!videoReady || busy}>
                <Download size={14} />{t('DOWNLOAD VIDEO')}
              </button>
            </div>
          </div>
            </>
          )}
          <div className="deviation-workflow-actions deviation-workflow-actions--split">
            <button type="button" className="deviation-button" onClick={() => handleStepChange(4)} disabled={busy}><ArrowLeft size={13} />{t('BACK TO EFFECTS')}</button>
            <button type="button" className="deviation-button" onClick={() => handleStepChange(2)} disabled={busy}>{t('EDIT PROFILE')}</button>
          </div>
        </div>
      )}
    </section>
  );
}
