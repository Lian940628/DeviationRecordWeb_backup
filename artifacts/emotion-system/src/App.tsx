import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Switch, useLocation } from 'wouter';
import { ArrowLeft, ArrowUpRight, Camera, ChevronDown, Expand, LockKeyhole, ScanFace, Settings2, ShieldCheck, VideoOff } from 'lucide-react';
import VideoDistortion from './pages/VideoDistortion';
import { useCameraController } from './camera/useCameraController';
import { CameraCaptureControls } from './camera/CameraCaptureControls';
import { DetectionDebugPanel } from './tracking/DetectionDebugPanel';
import { DetectionOverlay } from './tracking/DetectionOverlay';
import { PersonConnectionsOverlay } from './tracking/PersonConnectionsOverlay';
import { releaseCocoSsdModel, usePersonDetection } from './tracking/usePersonDetection';
import { releaseFaceLandmarkerWorker } from './tracking/faceLandmarkerWorker';
import { useFaceExpressions } from './tracking/useFaceExpressions';
import { useSessionAverageScore } from './tracking/useSessionAverageScore';
import { ScanEffectOverlay, type ScanEffectSettings } from './dashboard/BiometricDashboard';
import { CameraHudOverlayV2 } from './dashboard/CameraHudOverlayV2';
import { useHudSettings } from './dashboard/useHudSettings';
import { useSessionAnalytics } from './dashboard/useSessionAnalytics';
import { useSystemEventLog } from './dashboard/useSystemEventLog';
import { VideoArtworkCanvas } from './visualization/VideoArtworkCanvas';
import { useVisualModes } from './visualization/useVisualModes';
import { useVisualSettings } from './visualization/useVisualSettings';
import { useStageTransitionAudio } from './visualization/useStageTransitionAudio';
import { VisualModeControls } from './visual-controls/VisualModeControls';
import { LanguageProvider, useAppLanguage, useTranslation } from './i18n';
import InteractiveLanding from './components/InteractiveLanding';
import { SiteInteractionEffects } from './components/SiteInteractionEffects';

function Header({ minimal = false }: { minimal?: boolean }) {
  const { language, setLanguage } = useAppLanguage();
  const t = useTranslation();
  const [location] = useLocation();
  return (
    <header className="topbar">
      <Link href="/" className="wordmark" data-testid="link-home-logo" aria-label={t('EMOTION / SYSTEM home')}>
        EMOTION / SYSTEM<span>{t('AN INTERACTIVE ARTWORK · DEVIATION RECORD')}</span>
      </Link>
      <nav className="site-nav" aria-label={t('Main navigation')} data-testid="nav-main">
        <Link href="/experience" className={`site-nav-link${location === '/experience' ? ' is-active' : ''}`} data-testid="link-live-experience">{t('LIVE EXPERIENCE')}</Link>
        <Link href="/video-distortion" className={`site-nav-link${location === '/video-distortion' ? ' is-active' : ''}`} data-testid="link-video-distortion">{t('VIDEO DISTORTION')}</Link>
      </nav>
      <div className="header-actions">
        <div className="language-switch" role="group" aria-label={t('Language')}>
          <button type="button" aria-pressed={language === 'en'} onClick={() => setLanguage('en')} data-testid="button-language-en">EN</button>
          <button type="button" aria-pressed={language === 'zh'} onClick={() => setLanguage('zh')} data-testid="button-language-zh">中文</button>
        </div>
        {!minimal && <div className="header-right"><span className="header-index"><i className="tiny-dot" /> {t('DIGITAL PRESENCE STUDY')}</span><span>2025 — 26</span></div>}
      </div>
    </header>
  );
}

function Home() {
  const { language } = useAppLanguage();
  return <InteractiveLanding header={<Header minimal />} language={language} />;
}

function Experience() {
  const t = useTranslation();
  const camera = useCameraController();
  const detection = usePersonDetection(camera.videoRef, Boolean(camera.stream));
  const faceAnalysis = useFaceExpressions(camera.videoRef, Boolean(camera.stream), detection.tracks);
  const visualSettings = useVisualSettings();
  const { hudSettings, onHudSettingChange } = useHudSettings();
  const visualModes = useVisualModes(Boolean(camera.stream), visualSettings.settings);
  const averageScore = useSessionAverageScore(
    Boolean(camera.stream),
    faceAnalysis.inferenceSequence,
    faceAnalysis.expressions,
  );
  const sessionAnalytics = useSessionAnalytics(
    Boolean(camera.stream),
    faceAnalysis.inferenceSequence,
    detection.tracks,
    faceAnalysis.expressions,
  );
  const visibleTracks = useMemo(
    () => detection.tracks.filter((track) => track.visible),
    [detection.tracks],
  );
  const activeTrackIds = useMemo(
    () => visibleTracks.map((track) => track.id).sort((a, b) => a - b),
    [visibleTracks],
  );
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [scanSettings, setScanSettings] = useState<ScanEffectSettings>({
    enabled: true,
    speedSeconds: 8,
    opacity: 0.12,
    color: 'cyan',
  });
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
  const [cssFullscreen, setCssFullscreen] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const isFullscreen = cssFullscreen || nativeFullscreen;
  const renderingFps = artworkFps || overlayFps;
  const systemEvents = useSystemEventLog({
    cameraStatus: camera.status,
    cameraMessage: camera.message,
    personModelStatus: detection.modelStatus,
    personModelMessage: detection.modelMessage,
    faceModelStatus: faceAnalysis.modelStatus,
    faceModelMessage: faceAnalysis.modelMessage,
    personCount: detection.personCount,
    activeTrackIds,
    expressions: faceAnalysis.expressions,
    visualStage: visualModes.visualMode,
    analysisUpdatedAt: sessionAnalytics.lastUpdatedAt,
    validSamples: sessionAnalytics.validSamples,
  });

  useEffect(() => {
    if (selectedTrackId === null || !activeTrackIds.includes(selectedTrackId)) {
      setSelectedTrackId(activeTrackIds[0] ?? null);
    }
  }, [activeTrackIds, selectedTrackId]);

  useEffect(() => {
    const syncFullscreen = () => {
      const prefixedDocument = document as Document & { webkitFullscreenElement?: Element | null };
      const preview = document.getElementById('camera-preview');
      setNativeFullscreen(
        Boolean(preview && (document.fullscreenElement === preview || prefixedDocument.webkitFullscreenElement === preview)),
      );
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    syncFullscreen();
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
    };
  }, []);

  useEffect(() => {
    if (!cssFullscreen) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
    };
  }, [cssFullscreen]);

  const updateScanSettings = (next: Partial<ScanEffectSettings>) => {
    setScanSettings((previous) => ({ ...previous, ...next }));
  };
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
    const prefixedDocument = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const prefixedFrame = frame as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const nativeTarget = document.fullscreenElement ?? prefixedDocument.webkitFullscreenElement;

    if (cssFullscreen) {
      setCssFullscreen(false);
      setFullscreenError('');
      return;
    }

    if (nativeTarget) {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await prefixedDocument.webkitExitFullscreen?.();
        setFullscreenError('');
      } catch {
        setFullscreenError('Fullscreen is unavailable in this browser or page context.');
      }
      return;
    }

    try {
      if (typeof frame.requestFullscreen === 'function') {
        await frame.requestFullscreen({ navigationUI: 'hide' });
      } else if (prefixedFrame.webkitRequestFullscreen) {
        await prefixedFrame.webkitRequestFullscreen();
      } else {
        setCssFullscreen(true);
      }
      setFullscreenError('');
    } catch {
      // Mobile Safari and embedded browsers may reject element fullscreen.
      setFullscreenError('');
      setCssFullscreen(true);
    }
  };

  return (
    <div className={`app-shell experience-shell${cssFullscreen ? ' camera-css-fullscreen' : ''}`}>
      <Header />
      <main className="experience-page">
        <div className="workspace">
          <section className="preview-column" aria-label={t('Camera experience')}>
            <div id="camera-preview" className="preview-frame" data-testid="camera-preview">
              <button
                type="button"
                className="preview-fullscreen-toggle"
                onClick={toggleFullscreen}
                aria-label={t(isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen')}
                data-testid="button-preview-fullscreen-toggle"
              >
                <Expand size={14} aria-hidden="true" />
                <span>{t(isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen')}</span>
              </button>
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
              <div className="preview-overlay" aria-hidden="true">
                <div className="overlay-detection" />
                <div className="overlay-generative" />
                <div className="preview-grain" />
              </div>
              <ScanEffectOverlay settings={scanSettings} cameraActive={Boolean(camera.stream)} />
              <DetectionOverlay
                videoRef={camera.videoRef}
                tracks={detection.tracks}
                expressions={faceAnalysis.expressions}
                running={Boolean(camera.stream)}
                mirrored={camera.mirrored}
                showPersonIds={visualSettings.settings.stages.line.showPersonIds}
                onRenderingFps={setOverlayFps}
              />
              <CameraHudOverlayV2
                cameraStatus={camera.status}
                personModelStatus={detection.modelStatus}
                faceModelStatus={faceAnalysis.modelStatus}
                personCount={detection.personCount}
                tracks={visibleTracks}
                detectionFps={detection.detectionFps}
                renderingFps={renderingFps}
                visualStage={visualModes.visualMode}
                selectedTrackId={selectedTrackId}
                onSelectTrack={setSelectedTrackId}
                sessionDurationSeconds={sessionAnalytics.durationSeconds}
                averageScore={averageScore}
                analytics={sessionAnalytics}
                systemEvents={systemEvents}
                scanSettings={scanSettings}
                hudSettings={hudSettings}
                onHudSettingChange={onHudSettingChange}
              />
              <CameraCaptureControls
                stream={camera.stream}
                videoRef={camera.videoRef}
                mirrored={camera.mirrored}
              />
            </div>
            <div className="preview-actions">
              <div className="camera-actions">
                  <button type="button" className="primary-button" onClick={startCamera} disabled={camera.isStarting} aria-busy={camera.isStarting} data-testid="button-start-camera" aria-label={t('Start camera')}>
                  <Camera size={15} strokeWidth={1.6} aria-hidden="true" /><span className="button-label">{camera.isStarting ? t('STARTING…') : t('START CAMERA')}</span>
                </button>
                <button type="button" className="text-button" onClick={stopCamera} disabled={!camera.stream} data-testid="button-stop-camera" aria-label={t('Stop camera')}><VideoOff size={15} strokeWidth={1.6} /><span className="button-label">{t('STOP CAMERA')}</span></button>
              </div>
              <button type="button" className="secondary-button" onClick={toggleFullscreen} data-testid="button-fullscreen" aria-label={t(isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen')}><Expand size={13} aria-hidden="true" /> &nbsp; {t(isFullscreen ? 'Exit fullscreen' : 'FULLSCREEN')}</button>
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
              activeTrackIds={activeTrackIds}
            />
            <VisualModeControls
              className="vmc-experience-controls"
              playbackMode={visualModes.playbackMode}
              onPlaybackModeChange={visualModes.setPlaybackMode}
              visualMode={visualModes.visualMode}
              onVisualModeChange={visualModes.chooseMode}
                settings={visualSettings.settings}
                hudSettings={hudSettings}
                onHudSettingChange={onHudSettingChange}
                scanSettings={scanSettings}
                onScanSettingsChange={updateScanSettings}
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
              <strong>{t('Your video and face landmarks stay in this browser.')}</strong> {t('Only model files are downloaded by the site; camera frames and facial features are not uploaded. Photos and recordings are saved to this device only when you choose capture. Expression labels are heuristic estimates, not statements about how someone truly feels.')}
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

function VideoDistortionRoute() {
  return (
    <div className="app-shell video-distortion-shell">
      <Header />
      <VideoDistortion />
    </div>
  );
}

export default function App() {
  useEffect(() => () => {
    releaseCocoSsdModel();
    releaseFaceLandmarkerWorker();
  }, []);
  return (
    <LanguageProvider>
      <SiteInteractionEffects />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/experience" component={Experience} />
        <Route path="/video-distortion" component={VideoDistortionRoute} />
        <Route component={NotFound} />
      </Switch>
    </LanguageProvider>
  );
}
