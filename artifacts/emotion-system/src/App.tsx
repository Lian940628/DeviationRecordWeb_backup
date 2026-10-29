import { useEffect, useState } from 'react';
import { Link, Route, Switch } from 'wouter';
import { ArrowLeft, ArrowUpRight, Camera, ChevronDown, Expand, LockKeyhole, ScanFace, Settings2, ShieldCheck, VideoOff } from 'lucide-react';
import { useCameraController } from './camera/useCameraController';
import { SceneCanvas } from './scene/SceneCanvas';
import { DetectionDebugPanel } from './tracking/DetectionDebugPanel';
import { DetectionOverlay } from './tracking/DetectionOverlay';
import { releaseCocoSsdModel, usePersonDetection } from './tracking/usePersonDetection';
import { releaseFaceLandmarkerWorker } from './tracking/faceLandmarkerWorker';
import { useFaceExpressions } from './tracking/useFaceExpressions';

function Header() {
  return (
    <header className="topbar">
      <Link href="/" className="wordmark" data-testid="link-home-logo" aria-label="EMOTION / SYSTEM home">
        EMOTION / SYSTEM<span>AN INTERACTIVE ARTWORK</span>
      </Link>
      <div className="header-right"><span className="header-index"><i className="tiny-dot" /> DIGITAL PRESENCE STUDY</span><span>2025 — 26</span></div>
    </header>
  );
}

function Home() {
  return (
    <div className="app-shell">
      <Header />
      <main className="landing">
        <div className="scene-backdrop"><SceneCanvas /></div>
        <div className="landing-content">
          <div className="eyebrow">An experiment in presence</div>
          <h1 className="hero-title">THE ART OF<br /><span className="line-two">BEING SEEN<span className="period">.</span></span></h1>
          <p className="hero-intro"><strong>EMOTION / SYSTEM</strong> is a quiet encounter between a person and a machine. Step into the frame. Notice what it means to be present without being named.</p>
          <div className="action-row">
            <Link href="/experience" className="primary-link" data-testid="link-start-experience">START EXPERIENCE <ArrowUpRight size={15} strokeWidth={1.5} className="arrow" aria-hidden="true" /></Link>
            <div className="hero-note">Camera access is optional.<br />Your image stays on this device.</div>
          </div>
        </div>
        <div className="hero-index">01 / PRESENCE BEFORE INTERPRETATION</div>
        <footer className="landing-footer"><span>LOCAL INTERACTION · NO RECORDING</span><span>A WORK ABOUT LOOKING, NOT KNOWING</span></footer>
      </main>
    </div>
  );
}

function Experience() {
  const camera = useCameraController();
  const detection = usePersonDetection(camera.videoRef, Boolean(camera.stream));
  const faceAnalysis = useFaceExpressions(camera.videoRef, Boolean(camera.stream), detection.tracks);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [renderingFps, setRenderingFps] = useState(0);
  const [fullscreenError, setFullscreenError] = useState('');

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
    <div className="app-shell">
      <Header />
      <main className="experience-page">
        <div className="experience-heading">
          <div><div className="eyebrow">The encounter</div><h1>Enter the <span>frame.</span></h1></div>
          <div className="experience-meta">A PRIVATE MOMENT<br />NO IMAGE LEAVES THIS DEVICE</div>
        </div>
        <div className="workspace">
          <section className="preview-column" aria-label="Camera experience">
            <div id="camera-preview" className="preview-frame" data-testid="camera-preview">
              {camera.stream && <video ref={camera.videoRef} className={`preview-video${camera.mirrored ? ' mirrored' : ''}`} autoPlay playsInline muted aria-label="Live camera preview" data-testid="video-live-preview" />}
              {!camera.stream && <div className="preview-empty" data-testid="status-camera-idle"><div className="aperture"><span className="aperture-center" /></div><div className="preview-message">A space held for you</div><div className="preview-hint">Start the camera when you are ready.</div></div>}
              {camera.stream && <div className="preview-hud"><span className="hud-live"><i className="tiny-dot" /> LIVE · LOCAL</span><span>{camera.fps > 0 ? `${camera.fps} FPS` : 'SYNCING'}</span></div>}
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
                onRenderingFps={setRenderingFps}
              />
            </div>
            <div className="preview-actions">
              <div className="camera-actions">
                <button type="button" className="primary-button" onClick={camera.startCamera} disabled={camera.isStarting} aria-busy={camera.isStarting} data-testid="button-start-camera" aria-label="Start camera">
                  <Camera size={15} strokeWidth={1.6} aria-hidden="true" /><span className="button-label">{camera.isStarting ? 'STARTING…' : 'START CAMERA'}</span>
                </button>
                <button type="button" className="text-button" onClick={camera.stopCamera} disabled={!camera.stream} data-testid="button-stop-camera" aria-label="Stop camera"><VideoOff size={15} strokeWidth={1.6} /><span className="button-label">STOP CAMERA</span></button>
              </div>
              <button type="button" className="secondary-button" onClick={toggleFullscreen} data-testid="button-fullscreen" aria-label="Toggle fullscreen preview"><Expand size={13} aria-hidden="true" /> &nbsp; FULLSCREEN</button>
            </div>
            <div className={`status-note${camera.status === 'error' ? ' error' : camera.status === 'live' ? ' success' : ''}`} role="status" aria-live="polite" data-testid="status-camera-message">
              {camera.status === 'error' && <strong>CAMERA NOT STARTED · </strong>}{camera.message}{fullscreenError && ` ${fullscreenError}`}
            </div>
          </section>
          <aside className="control-panel" aria-label="Experience settings">
            <div className="panel-top"><span className="panel-title">Session controls</span><span className="panel-number">01 / 03</span></div>
            <button type="button" className="settings-toggle" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)} data-testid="button-toggle-settings">
              <span><Settings2 size={13} style={{ verticalAlign: '-2px', marginRight: 8 }} /> SETTINGS</span><ChevronDown size={14} className={`chevron${settingsOpen ? ' open' : ''}`} />
            </button>
            <div className={`settings-body${settingsOpen ? ' open' : ' closed'}`} aria-hidden={!settingsOpen}>
              <div className="panel-section">
                <div className="stats-row"><span className="section-label">Frame rate</span><span className="stat-unit">FPS</span></div>
                <div className="stats-row"><span className="stat-value" data-testid="text-fps-value">{camera.stream ? camera.fps : '—'}</span><span className="stat-unit">{camera.stream ? 'LIVE ESTIMATE' : 'AWAITING CAMERA'}</span></div>
              </div>
              <div className="panel-section">
                <label className="section-label" htmlFor="camera-device">Camera source</label>
                <select id="camera-device" className="setting-select" value={camera.selectedDevice} onChange={(event) => camera.setSelectedDevice(event.target.value)} disabled={!camera.devices.length} data-testid="select-camera-device" aria-label="Select camera device">
                  {camera.devices.length === 0 ? <option value="">{camera.permissionGranted ? 'No camera available' : 'Camera names appear after access'}</option> : camera.devices.map((device, index) => <option value={device.deviceId} key={device.deviceId || index}>{device.label}</option>)}
                </select>
                <p className="select-note">{camera.permissionGranted ? 'Choose a source, then press START CAMERA to apply it.' : 'Device names may be hidden until you grant camera access.'}</p>
              </div>
              <div className="panel-section" style={{ borderBottom: 0, paddingBottom: 0 }}>
                <span className="section-label">What this work does</span>
                <p className="select-note" style={{ margin: 0 }}>People and facial signals are processed locally. Expression labels are heuristic estimates, not readings of a person’s inner emotional state.</p>
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
              expressions={faceAnalysis.expressions}
              personCount={detection.personCount}
              detectionFps={detection.detectionFps}
              renderingFps={renderingFps}
              activeTrackIds={detection.activeTrackIds}
            />
            <div className="privacy-block">
              <div className="privacy-mark"><ShieldCheck size={14} strokeWidth={1.5} /> Private by design</div>
              <strong>Your video and face landmarks stay in this browser.</strong> Only model files are downloaded; camera frames and facial features are not uploaded or recorded. Expression labels are heuristic estimates, not statements about how someone truly feels.
            </div>
          </aside>
        </div>
        <footer className="experience-footer">
          <Link href="/" className="home-link" data-testid="link-return-home"><ArrowLeft size={13} style={{ verticalAlign: '-2px', marginRight: 7 }} /> RETURN HOME</Link>
          <span><LockKeyhole size={11} style={{ verticalAlign: '-2px', marginRight: 6 }} /> VIDEO REMAINS LOCAL</span>
          <span><ScanFace size={12} style={{ verticalAlign: '-2px', marginRight: 6 }} /> LOCAL HEURISTIC EXPRESSION ESTIMATES</span>
        </footer>
      </main>
    </div>
  );
}

function NotFound() {
  return <main className="app-shell"><Header /><div className="not-found"><div><div className="eyebrow">Signal not found</div><h1>This frame is empty.</h1><Link href="/" className="primary-link" data-testid="link-not-found-home">RETURN HOME <ArrowUpRight size={14} /></Link></div></div></main>;
}

export default function App() {
  useEffect(() => () => {
    releaseCocoSsdModel();
    releaseFaceLandmarkerWorker();
  }, []);
  return <Switch><Route path="/" component={Home} /><Route path="/experience" component={Experience} /><Route component={NotFound} /></Switch>;
}
