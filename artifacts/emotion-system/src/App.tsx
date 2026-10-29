import { useEffect, useState } from 'react';
import { Link, Route, Switch } from 'wouter';
import { ArrowLeft, ArrowUpRight, Camera, ChevronDown, Expand, LockKeyhole, ScanFace, Settings2, ShieldCheck, VideoOff } from 'lucide-react';
import { useCameraController } from './camera/useCameraController';
import { SceneCanvas } from './scene/SceneCanvas';
import { DetectionDebugPanel } from './tracking/DetectionDebugPanel';
import { DetectionOverlay } from './tracking/DetectionOverlay';
import { PersonConnectionsOverlay } from './tracking/PersonConnectionsOverlay';
import { releaseCocoSsdModel, usePersonDetection } from './tracking/usePersonDetection';
import { releaseFaceLandmarkerWorker } from './tracking/faceLandmarkerWorker';
import { useFaceExpressions } from './tracking/useFaceExpressions';
import { useSessionAverageScore } from './tracking/useSessionAverageScore';
import { VideoArtworkCanvas } from './visualization/VideoArtworkCanvas';
import { useVisualModes } from './visualization/useVisualModes';
import { useVisualSettings } from './visualization/useVisualSettings';
import { useStageTransitionAudio } from './visualization/useStageTransitionAudio';
import { VisualModeControls } from './visual-controls/VisualModeControls';
import { LanguageProvider, useAppLanguage, useTranslation } from './i18n';

function Header() {
  const { language, setLanguage } = useAppLanguage();
  const t = useTranslation();
  return (
    <header className="topbar">
      <Link href="/" className="wordmark" data-testid="link-home-logo" aria-label={t('EMOTION / SYSTEM home')}>
        EMOTION / SYSTEM<span>{t('AN INTERACTIVE ARTWORK · DEVIATION RECORD')}</span>
      </Link>
      <div className="header-actions">
        <div className="language-switch" role="group" aria-label={t('Language')}>
          <button type="button" aria-pressed={language === 'en'} onClick={() => setLanguage('en')} data-testid="button-language-en">EN</button>
          <button type="button" aria-pressed={language === 'zh'} onClick={() => setLanguage('zh')} data-testid="button-language-zh">中文</button>
        </div>
        <div className="header-right"><span className="header-index"><i className="tiny-dot" /> {t('DIGITAL PRESENCE STUDY')}</span><span>2025 — 26</span></div>
      </div>
    </header>
  );
}

function Home() {
  const t = useTranslation();
  return (
    <div className="app-shell">
      <Header />
      <main className="landing">
        <div className="scene-backdrop"><SceneCanvas /></div>
        <div className="landing-content">
          <div className="eyebrow">{t('An experiment in presence')}</div>
          <h1 className="hero-title">{t('THE ART OF')}<br /><span className="line-two">{t('BEING SEEN')}<span className="period">.</span></span></h1>
          <p className="hero-intro"><strong>EMOTION / SYSTEM</strong> {t('is a quiet encounter between a person and a machine inside a system built for precision. Each of us carries a slight misalignment: memory drift, perceptual error, and emotional noise. Step into the frame and notice what remains unresolved.')}</p>
          <div className="action-row">
            <Link href="/experience" className="primary-link" data-testid="link-start-experience">{t('START EXPERIENCE')} <ArrowUpRight size={15} strokeWidth={1.5} className="arrow" aria-hidden="true" /></Link>
            <div className="hero-note">{t('Camera access is optional.')}<br />{t('Your image stays on this device.')}</div>
          </div>
          <div className="archive-strip" aria-label={t('Artwork index')}>
            <div className="archive-strip-heading"><span>{t('ARCHIVE INDEX')}</span><i aria-hidden="true" /></div>
            <div className="archive-record"><span>01</span><strong>{t('MEMORY')}</strong><small>{t('A record can drift.')}</small></div>
            <div className="archive-record"><span>02</span><strong>{t('PERCEPTION')}</strong><small>{t('A frame can misread.')}</small></div>
            <div className="archive-record"><span>03</span><strong>{t('PRESENCE')}</strong><small>{t('A signal can remain unresolved.')}</small></div>
          </div>
        </div>
        <div className="hero-index">{t('01 / PRESENCE BEFORE INTERPRETATION')}</div>
        <footer className="landing-footer"><span>{t('LOCAL INTERACTION · NO RECORDING')}</span><span>{t('A WORK ABOUT LOOKING, NOT KNOWING')}</span></footer>
      </main>
    </div>
  );
}

function Experience() {
  const t = useTranslation();
  const camera = useCameraController();
  const detection = usePersonDetection(camera.videoRef, Boolean(camera.stream));
  const faceAnalysis = useFaceExpressions(camera.videoRef, Boolean(camera.stream), detection.tracks);
  const visualSettings = useVisualSettings();
  const visualModes = useVisualModes(Boolean(camera.stream), visualSettings.settings);
  const averageScore = useSessionAverageScore(
    Boolean(camera.stream),
    faceAnalysis.inferenceSequence,
    faceAnalysis.expressions,
  );
  const stageAudio = useStageTransitionAudio(
    Boolean(camera.stream),
    visualModes.visualMode,
    visualModes.transitionKey,
    visualSettings.settings.audio,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [overlayFps, setOverlayFps] = useState(0);
  const [artworkFps, setArtworkFps] = useState(0);
  const [fullscreenError, setFullscreenError] = useState('');
  const renderingFps = artworkFps || overlayFps;
  const startCamera = () => {
    void stageAudio.unlock();
    void camera.startCamera().then((started) => {
      if (!started) void stageAudio.close();
    });
  };
  const stopCamera = () => {
    camera.stopCamera();
    void stageAudio.close();
  };
  const changeAudioSetting = (key: string, value: number | boolean) => {
    visualSettings.onAudioSettingChange(key, value);
    if (key === 'muted' && value === true && !camera.stream) void stageAudio.close();
  };

  const toggleFullscreen = async () => {
    const frame = document.getElementById('camera-preview');
    if (!frame) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await frame.requestFullscreen();
      setFullscreenError('');
    } catch {
      setFullscreenError('Fullscreen is unavailable in this browser or page context.');
    }
  };

  return (
    <div className="app-shell experience-shell">
      <Header />
      <main className="experience-page">
        <div className="experience-heading">
          <div><div className="eyebrow">{t('The encounter')}</div><h1>{t('Enter the')} <span>{t('frame.')}</span></h1></div>
          <div className="experience-meta">{t('A PRIVATE MOMENT')}<br />{t('NO IMAGE LEAVES THIS DEVICE')}</div>
        </div>
        <div className="workspace">
          <section className="preview-column" aria-label={t('Camera experience')}>
            <div id="camera-preview" className="preview-frame" data-testid="camera-preview">
              {camera.stream && <video ref={camera.videoRef} className={`preview-video${camera.mirrored ? ' mirrored' : ''}`} autoPlay playsInline muted aria-label={t('Live camera preview')} data-testid="video-live-preview" />}
              {!camera.stream && <div className="preview-empty" data-testid="status-camera-idle"><div className="aperture"><span className="aperture-center" /></div><div className="preview-message">{t('A space held for you')}</div><div className="preview-hint">{t('Start the camera when you are ready.')}</div></div>}
              {camera.stream && (
                <VideoArtworkCanvas
                  videoRef={camera.videoRef}
                  tracks={detection.tracks}
                  expressions={faceAnalysis.expressions}
                  running={Boolean(camera.stream)}
                  mirrored={camera.mirrored}
                  mode={visualModes.visualMode}
                  previousMode={visualModes.previousMode}
                  transitionKey={visualModes.transitionKey}
                  transitionDurationSeconds={visualModes.transitionDurationSeconds}
                  renderScale={visualSettings.settings.transitions.renderScale}
                  settings={visualSettings.settings}
                  onRenderingFps={setArtworkFps}
                />
              )}
              {camera.stream && (
                <PersonConnectionsOverlay
                  videoRef={camera.videoRef}
                  tracks={detection.tracks}
                  running={Boolean(camera.stream)}
                  mirrored={camera.mirrored}
                  active={visualModes.visualMode === 'line' && visualSettings.settings.stages.line.personConnectionsEnabled}
                  settings={visualSettings.settings.stages.line}
                />
              )}
              {camera.stream && (
                <div className="preview-hud">
                  <span className="hud-live"><i className="tiny-dot" /> {t('LIVE · LOCAL')}</span>
                  <span>{t(({ normal: '01 NORMAL', anomaly: '02 ANOMALY', particle: '03 PARTICLE', line: '04 LINE' } as const)[visualModes.visualMode])} · {camera.fps > 0 ? `${camera.fps} FPS` : t('SYNCING')}</span>
                </div>
              )}
              <div className="preview-overlay" aria-hidden="true">
                <div className="overlay-detection" />
                <div className="overlay-generative" />
                <div className="preview-grain" />
              </div>
              <DetectionOverlay
                videoRef={camera.videoRef}
                tracks={detection.tracks}
                expressions={faceAnalysis.expressions}
                running={Boolean(camera.stream)}
                mirrored={camera.mirrored}
                showPersonIds={visualSettings.settings.stages.line.showPersonIds}
                onRenderingFps={setOverlayFps}
              />
            </div>
            <div className="preview-actions">
              <div className="camera-actions">
                  <button type="button" className="primary-button" onClick={startCamera} disabled={camera.isStarting} aria-busy={camera.isStarting} data-testid="button-start-camera" aria-label={t('Start camera')}>
                  <Camera size={15} strokeWidth={1.6} aria-hidden="true" /><span className="button-label">{camera.isStarting ? t('STARTING…') : t('START CAMERA')}</span>
                </button>
                <button type="button" className="text-button" onClick={stopCamera} disabled={!camera.stream} data-testid="button-stop-camera" aria-label={t('Stop camera')}><VideoOff size={15} strokeWidth={1.6} /><span className="button-label">{t('STOP CAMERA')}</span></button>
              </div>
              <button type="button" className="secondary-button" onClick={toggleFullscreen} data-testid="button-fullscreen" aria-label={t('Toggle fullscreen preview')}><Expand size={13} aria-hidden="true" /> &nbsp; {t('FULLSCREEN')}</button>
            </div>
            <div className={`status-note${camera.status === 'error' ? ' error' : camera.status === 'live' ? ' success' : ''}`} role="status" aria-live="polite" data-testid="status-camera-message">
              {camera.status === 'error' && <strong>{t('CAMERA NOT STARTED · ')}</strong>}{t(camera.message)}{fullscreenError && ` ${t(fullscreenError)}`}
            </div>
          </section>
          <aside className="control-panel" aria-label={t('Experience settings')}>
            <div className="panel-top"><span className="panel-title">{t('Session controls')}</span><span className="panel-number">01 / 03</span></div>
            <button type="button" className="settings-toggle" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)} data-testid="button-toggle-settings">
              <span><Settings2 size={13} style={{ verticalAlign: '-2px', marginRight: 8 }} /> {t('SETTINGS')}</span><ChevronDown size={14} className={`chevron${settingsOpen ? ' open' : ''}`} />
            </button>
            <div className={`settings-body${settingsOpen ? ' open' : ' closed'}`} aria-hidden={!settingsOpen}>
              <div className="panel-section">
                <div className="stats-row"><span className="section-label">{t('Frame rate')}</span><span className="stat-unit">FPS</span></div>
                <div className="stats-row"><span className="stat-value" data-testid="text-fps-value">{camera.stream ? camera.fps : '—'}</span><span className="stat-unit">{camera.stream ? t('LIVE ESTIMATE') : t('AWAITING CAMERA')}</span></div>
              </div>
              <div className="panel-section">
                <label className="section-label" htmlFor="camera-device">{t('Camera source')}</label>
                <select id="camera-device" className="setting-select" value={camera.selectedDevice} onChange={(event) => camera.setSelectedDevice(event.target.value)} disabled={!camera.devices.length} data-testid="select-camera-device" aria-label={t('Select camera device')}>
                  {camera.devices.length === 0 ? <option value="">{camera.permissionGranted ? t('No camera available') : t('Camera names appear after access')}</option> : camera.devices.map((device, index) => <option value={device.deviceId} key={device.deviceId || index}>{device.label}</option>)}
                </select>
                <p className="select-note">{camera.permissionGranted ? t('Choose a source, then press START CAMERA to apply it.') : t('Device names may be hidden until you grant camera access.')}</p>
              </div>
              <div className="panel-section" style={{ borderBottom: 0, paddingBottom: 0 }}>
                <span className="section-label">{t('What this work does')}</span>
                <p className="select-note" style={{ margin: 0 }}>{t('People and facial signals are processed locally. Expression labels are heuristic estimates, not readings of a person’s inner emotional state.')}</p>
              </div>
            </div>
            <DetectionDebugPanel
              debugMode={debugMode}
              onToggle={() => setDebugMode((enabled) => !enabled)}
              modelStatus={detection.modelStatus}
              modelMessage={detection.modelMessage}
              faceModelStatus={faceAnalysis.modelStatus}
              faceModelMessage={faceAnalysis.modelMessage}
              detectedFaces={faceAnalysis.detectedFaces}
              inferenceTimeMs={faceAnalysis.inferenceTimeMs}
              lastSuccessfulFaceAt={faceAnalysis.lastSuccessfulFaceAt}
              unknownReason={faceAnalysis.unknownReason}
              faceDiagnostics={faceAnalysis.faceDiagnostics}
              expressions={faceAnalysis.expressions}
              personCount={detection.personCount}
              averageScore={averageScore.averageScore}
              validScoreSamples={averageScore.validSamples}
              lastUpdatedAt={averageScore.lastUpdatedAt}
              detectionFps={detection.detectionFps}
              renderingFps={renderingFps}
              activeTrackIds={detection.activeTrackIds}
            />
            <VisualModeControls
              className="vmc-experience-controls"
              playbackMode={visualModes.playbackMode}
              onPlaybackModeChange={visualModes.setPlaybackMode}
              visualMode={visualModes.visualMode}
              onVisualModeChange={visualModes.chooseMode}
                settings={visualSettings.settings}
                savedPresets={visualSettings.savedPresets}
                presetMessage={visualSettings.presetMessage}
                presetError={visualSettings.presetError}
                onGlobalSettingChange={visualSettings.onGlobalSettingChange}
                onTransitionSettingChange={visualSettings.onTransitionSettingChange}
                onStageSettingChange={visualSettings.onStageSettingChange}
                onAudioSettingChange={changeAudioSetting}
                onAudioUnlock={() => { void stageAudio.unlock(); }}
                onResetImageSettings={visualSettings.onResetImageSettings}
                onResetStage={visualSettings.onResetStage}
                onSavePreset={visualSettings.onSavePreset}
                onLoadPreset={visualSettings.onLoadPreset}
                onExportPreset={visualSettings.onExportPreset}
                onImportPreset={visualSettings.onImportPreset}
            />
            <div className="privacy-block">
              <div className="privacy-mark"><ShieldCheck size={14} strokeWidth={1.5} /> {t('Private by design')}</div>
              <strong>{t('Your video and face landmarks stay in this browser.')}</strong> {t('Only model files are downloaded; camera frames and facial features are not uploaded or recorded. Expression labels are heuristic estimates, not statements about how someone truly feels.')}
            </div>
          </aside>
        </div>
        <footer className="experience-footer">
          <Link href="/" className="home-link" data-testid="link-return-home"><ArrowLeft size={13} style={{ verticalAlign: '-2px', marginRight: 7 }} /> {t('RETURN HOME')}</Link>
          <span><LockKeyhole size={11} style={{ verticalAlign: '-2px', marginRight: 6 }} /> {t('VIDEO REMAINS LOCAL')}</span>
          <span><ScanFace size={12} style={{ verticalAlign: '-2px', marginRight: 6 }} /> {t('LOCAL HEURISTIC EXPRESSION ESTIMATES')}</span>
        </footer>
      </main>
    </div>
  );
}

function NotFound() {
  const t = useTranslation();
  return <main className="app-shell"><Header /><div className="not-found"><div><div className="eyebrow">{t('Signal not found')}</div><h1>{t('This frame is empty.')}</h1><Link href="/" className="primary-link" data-testid="link-not-found-home">{t('RETURN HOME')} <ArrowUpRight size={14} /></Link></div></div></main>;
}

export default function App() {
  useEffect(() => () => {
    releaseCocoSsdModel();
    releaseFaceLandmarkerWorker();
  }, []);
  return <LanguageProvider><Switch><Route path="/" component={Home} /><Route path="/experience" component={Experience} /><Route component={NotFound} /></Switch></LanguageProvider>;
}
