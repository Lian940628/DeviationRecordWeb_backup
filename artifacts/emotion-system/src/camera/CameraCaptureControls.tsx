import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Circle, Eye, EyeOff, Square } from 'lucide-react';
import { useTranslation } from '../i18n';
import { captureArtworkFrame } from '../visualization/artworkCapture';
import './cameraCaptureControls.css';

interface CameraCaptureControlsProps {
  stream: MediaStream | null;
}

type DisplayMediaOptionsWithHints = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: 'include' | 'exclude';
};

let html2canvasPromise: Promise<(typeof import('html2canvas'))['default']> | null = null;

function loadHtml2Canvas() {
  html2canvasPromise ??= import('html2canvas').then((module) => module.default);
  return html2canvasPromise;
}

function requestVisibleTabCapture() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new DOMException('Screen capture is unavailable.', 'NotSupportedError');
  }
  return navigator.mediaDevices.getDisplayMedia({
    video: {
      displaySurface: 'browser',
      frameRate: { ideal: 30, max: 30 },
    },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
  } as DisplayMediaOptionsWithHints);
}

function getFullscreenPreview() {
  const preview = document.getElementById('camera-preview');
  const prefixedDocument = document as Document & { webkitFullscreenElement?: Element | null };
  const isFullscreen = Boolean(preview && (
    document.fullscreenElement === preview
    || prefixedDocument.webkitFullscreenElement === preview
    || preview.closest('.camera-css-fullscreen')
  ));
  return isFullscreen ? preview : null;
}

function snapshotVideoFrame(video: HTMLVideoElement, scale: number) {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return null;
  const bounds = video.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bounds.width * scale));
  canvas.height = Math.max(1, Math.round(bounds.height * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;

  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = canvas.width / canvas.height;
  const objectFit = getComputedStyle(video).objectFit;
  const background = getComputedStyle(video).backgroundColor;
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (objectFit === 'cover') {
    let sx = 0;
    let sy = 0;
    let sw = sourceWidth;
    let sh = sourceHeight;
    if (sourceAspect > targetAspect) {
      sw = sourceHeight * targetAspect;
      sx = (sourceWidth - sw) / 2;
    } else {
      sh = sourceWidth / targetAspect;
      sy = (sourceHeight - sh) / 2;
    }
    context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  } else {
    const fit = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
    const width = sourceWidth * fit;
    const height = sourceHeight * fit;
    context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  }
  return canvas;
}

function getContainedImageLayout(image: HTMLImageElement) {
  const container = image.parentElement;
  if (!container || !image.naturalWidth || !image.naturalHeight) return null;
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height) return null;

  const fit = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const imageWidth = image.naturalWidth * fit;
  const imageHeight = image.naturalHeight * fit;
  return {
    width: imageWidth,
    height: imageHeight,
    left: (width - imageWidth) / 2,
    top: (height - imageHeight) / 2,
  };
}

function cloneCanvas(source: HTMLCanvasElement, sourceElement: HTMLElement, targetDocument: Document) {
  const copy = targetDocument.createElement('canvas');
  copy.width = source.width;
  copy.height = source.height;
  copy.className = sourceElement.className;
  copy.style.cssText = sourceElement.getAttribute('style') ?? '';
  if (sourceElement.getAttribute('aria-hidden')) copy.setAttribute('aria-hidden', 'true');
  copy.getContext('2d')?.drawImage(source, 0, 0);
  return copy;
}

async function captureFullscreenPreview(target: HTMLElement) {
  const html2canvas = await loadHtml2Canvas();
  const bounds = target.getBoundingClientRect();
  const scale = Math.min(window.devicePixelRatio || 1, 1.5);
  const video = target.querySelector<HTMLVideoElement>('.preview-video');
  const videoFrame = video ? snapshotVideoFrame(video, scale) : null;
  const bodyScanImage = target.querySelector<HTMLImageElement>('.body-scan-portrait');
  const bodyScanLayout = bodyScanImage ? getContainedImageLayout(bodyScanImage) : null;
  const artworkFrame = captureArtworkFrame();

  return html2canvas(target, {
    backgroundColor: '#03080d',
    scale,
    width: Math.ceil(bounds.width),
    height: Math.ceil(bounds.height),
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    scrollX: 0,
    scrollY: 0,
    logging: false,
    onclone: (clonedDocument) => {
      const clonedTarget = clonedDocument.getElementById('camera-preview');
      if (!clonedTarget) return;
      clonedTarget.style.width = `${bounds.width}px`;
      clonedTarget.style.height = `${bounds.height}px`;
      clonedTarget.style.minHeight = '0';
      clonedTarget.style.maxWidth = 'none';
      clonedTarget.style.aspectRatio = 'auto';
      clonedTarget.style.boxSizing = 'border-box';
      clonedTarget.style.position = 'relative';
      clonedTarget.style.overflow = 'hidden';
      clonedTarget.style.border = '0';
      clonedTarget.style.boxShadow = 'none';

      const clonedVideo = clonedTarget.querySelector<HTMLVideoElement>('.preview-video');
      if (videoFrame && clonedVideo) {
        clonedVideo.replaceWith(cloneCanvas(videoFrame, clonedVideo, clonedDocument));
      }

      const clonedBodyScanImage = clonedTarget.querySelector<HTMLImageElement>('.body-scan-portrait');
      if (bodyScanLayout && clonedBodyScanImage) {
        clonedBodyScanImage.style.position = 'absolute';
        clonedBodyScanImage.style.left = `${bodyScanLayout.left}px`;
        clonedBodyScanImage.style.top = `${bodyScanLayout.top}px`;
        clonedBodyScanImage.style.width = `${bodyScanLayout.width}px`;
        clonedBodyScanImage.style.height = `${bodyScanLayout.height}px`;
        clonedBodyScanImage.style.objectFit = 'fill';
      }

      const clonedArtworkCanvas = clonedTarget.querySelector<HTMLCanvasElement>('.video-artwork-canvas');
      if (clonedArtworkCanvas && artworkFrame) {
        clonedArtworkCanvas.replaceWith(cloneCanvas(artworkFrame, clonedArtworkCanvas, clonedDocument));
      } else if (clonedArtworkCanvas) {
        clonedArtworkCanvas.remove();
      }
    },
  });
}

async function waitForVideoFrame(video: HTMLVideoElement) {
  await video.play();
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for the captured screen.'));
    }, 8000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
    };
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Could not read the captured screen.'));
    };
    video.addEventListener('loadeddata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

function screenCaptureErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotSupportedError' || name === 'TypeError') {
    return 'Screen capture is unavailable in this browser.';
  }
  if (name === 'NotAllowedError' || name === 'AbortError') {
    return 'Screen capture was blocked or cancelled. Try opening this page in a new tab and select this tab.';
  }
  return 'Could not capture the screen. Try selecting this browser tab.';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
}

export function CameraCaptureControls({ stream }: CameraCaptureControlsProps) {
  const t = useTranslation();
  const [controlsVisible, setControlsVisible] = useState(true);
  const [recording, setRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [status, setStatus] = useState('');
  const preparingRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const photoStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const statusTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(false);

  const announce = useCallback((message: string) => {
    if (!mountedRef.current) return;
    setStatus(message);
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
    statusTimerRef.current = window.setTimeout(() => {
      if (mountedRef.current) setStatus('');
      statusTimerRef.current = null;
    }, 4200);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
      const recorder = recorderRef.current;
      if (recorder?.state === 'recording') {
        try { recorder.stop(); } catch { /* The recorder may already be stopping. */ }
      } else {
        screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      }
      photoStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!stream && recorderRef.current?.state === 'recording') {
      try { recorderRef.current.stop(); } catch { /* Camera shutdown can stop the recorder first. */ }
    }
    if (!stream) photoStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, [stream]);

  useEffect(() => {
    if (!stream) return;
    void loadHtml2Canvas().catch(() => { html2canvasPromise = null; });
  }, [stream]);

  const takePhoto = useCallback(() => {
    if (!stream || !stream.getVideoTracks().some((track) => track.readyState === 'live')) {
      announce('Camera image is not ready yet.');
      return;
    }
    if (preparingRef.current) return;
    preparingRef.current = true;
    const fullscreenPreview = getFullscreenPreview();
    if (!fullscreenPreview) setPreparing(true);
    void (async () => {
      let capturedStream: MediaStream | null = null;
      let capturedVideo: HTMLVideoElement | null = null;
      try {
        if (fullscreenPreview) {
          const canvas = await captureFullscreenPreview(fullscreenPreview);
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
          if (!blob) {
            announce('Could not capture the fullscreen preview. Try again.');
            return;
          }
          downloadBlob(blob, `emotion-system_${timestamp()}.png`);
          announce('Screenshot saved locally.');
          return;
        }

        announce('Choose this tab in the browser sharing dialog.');
        capturedStream = await requestVisibleTabCapture();
        photoStreamRef.current = capturedStream;
        capturedVideo = document.createElement('video');
        capturedVideo.muted = true;
        capturedVideo.playsInline = true;
        capturedVideo.srcObject = capturedStream;
        await waitForVideoFrame(capturedVideo);
        if (!capturedVideo.videoWidth || !capturedVideo.videoHeight) {
          throw new Error('The captured screen has no image dimensions.');
        }
        const canvas = document.createElement('canvas');
        canvas.width = capturedVideo.videoWidth;
        canvas.height = capturedVideo.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas is unavailable.');
        context.drawImage(capturedVideo, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) {
          announce('Could not capture the screen. Try selecting this browser tab.');
          return;
        }
        downloadBlob(blob, `emotion-system_${timestamp()}.png`);
        announce('Screenshot saved locally.');
      } catch (error) {
        announce(fullscreenPreview
          ? 'Could not capture the fullscreen preview. Try again.'
          : screenCaptureErrorMessage(error));
      } finally {
        capturedVideo?.pause();
        if (capturedVideo) capturedVideo.srcObject = null;
        capturedStream?.getTracks().forEach((track) => track.stop());
        if (photoStreamRef.current === capturedStream) photoStreamRef.current = null;
        preparingRef.current = false;
        if (mountedRef.current) setPreparing(false);
      }
    })();
  }, [announce, stream]);

  const toggleRecording = useCallback(() => {
    if (preparingRef.current) return;
    const currentRecorder = recorderRef.current;
    if (currentRecorder?.state === 'recording') {
      try {
        currentRecorder.stop();
      } catch {
        announce('Recording failed. Try again.');
      }
      return;
    }
    if (!stream || !stream.getVideoTracks().some((track) => track.readyState === 'live')) {
      announce('Camera image is not ready yet.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      announce('This browser does not support video recording.');
      return;
    }

    preparingRef.current = true;
    setPreparing(true);
    void (async () => {
      let capturedStream: MediaStream | null = null;
      try {
        announce('Choose this tab in the browser sharing dialog.');
        capturedStream = await requestVisibleTabCapture();
        screenStreamRef.current = capturedStream;
        const mimeType = [
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/webm',
          'video/mp4;codecs=avc1.42E01E',
          'video/mp4',
        ].find((type) => MediaRecorder.isTypeSupported?.(type));
        const recorder = mimeType
          ? new MediaRecorder(capturedStream, { mimeType })
          : new MediaRecorder(capturedStream);
        chunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorder.onerror = () => announce('Recording failed. Try again.');
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
          chunksRef.current = [];
          screenStreamRef.current?.getTracks().forEach((track) => track.stop());
          screenStreamRef.current = null;
          if (blob.size > 0) {
            const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
            downloadBlob(blob, `emotion-system_${timestamp()}.${extension}`);
            announce('Screen recording saved locally.');
          } else {
            announce('Recording failed. Try again.');
          }
          if (mountedRef.current) setRecording(false);
          if (recorderRef.current === recorder) recorderRef.current = null;
        };
        capturedStream.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (recorder.state === 'recording') recorder.stop();
        }, { once: true });
        recorderRef.current = recorder;
        recorder.start(250);
        setRecording(true);
        announce('Screen recording started. Stop to save the current screen.');
      } catch (error) {
        capturedStream?.getTracks().forEach((track) => track.stop());
        if (screenStreamRef.current === capturedStream) screenStreamRef.current = null;
        announce(screenCaptureErrorMessage(error));
      } finally {
        preparingRef.current = false;
        if (mountedRef.current) setPreparing(false);
      }
    })();
  }, [announce, stream]);

  if (!stream) return null;

  return (
    <div className="camera-capture-controls" data-testid="camera-capture-controls">
      <div className="camera-capture-topline">
        <button
          className="camera-capture-visibility"
          type="button"
          aria-expanded={controlsVisible}
          aria-label={t(controlsVisible ? 'HIDE CAPTURE CONTROLS' : 'SHOW CAPTURE CONTROLS')}
          data-testid="button-toggle-capture-controls"
          onClick={() => setControlsVisible((visible) => !visible)}
        >
          {controlsVisible ? <EyeOff size={13} /> : <Eye size={13} />}
          <span>{t(controlsVisible ? 'HIDE CAPTURE CONTROLS' : 'SHOW CAPTURE CONTROLS')}</span>
        </button>
        {recording && <span className="camera-recording-indicator" role="status"><i />{t('RECORDING')}</span>}
      </div>

      {controlsVisible && (
        <div className="camera-capture-toolbar">
          <button type="button" onClick={takePhoto} disabled={preparing || recording} data-testid="button-take-photo">
            <Camera size={14} /><span>{t('TAKE PHOTO')}</span>
          </button>
          <button
            className={recording ? 'is-recording' : ''}
            type="button"
            aria-pressed={recording}
            disabled={preparing}
            onClick={toggleRecording}
            data-testid="button-toggle-recording"
          >
            {recording ? <Square size={13} fill="currentColor" /> : <Circle size={14} />}
            <span>{t(recording ? 'STOP RECORDING' : 'START RECORDING')}</span>
          </button>
        </div>
      )}

      {controlsVisible && <p className="camera-capture-hint">{t('Select this tab to include effects and information panels.')}</p>}
      {status && <div className="camera-capture-status" role="status" aria-live="polite" data-testid="status-capture">{t(status)}</div>}
    </div>
  );
}
