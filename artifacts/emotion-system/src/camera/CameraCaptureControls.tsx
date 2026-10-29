import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Camera, Circle, Eye, EyeOff, Square } from 'lucide-react';
import { useTranslation } from '../i18n';
import './cameraCaptureControls.css';

interface CameraCaptureControlsProps {
  stream: MediaStream | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  mirrored: boolean;
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

export function CameraCaptureControls({ stream, videoRef, mirrored }: CameraCaptureControlsProps) {
  const t = useTranslation();
  const [controlsVisible, setControlsVisible] = useState(true);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
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
      }
    };
  }, []);

  useEffect(() => {
    if (!stream && recorderRef.current?.state === 'recording') {
      try { recorderRef.current.stop(); } catch { /* Camera shutdown can stop the recorder first. */ }
    }
  }, [stream]);

  const takePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!stream || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      announce('Camera image is not ready yet.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      announce('Photo capture is not supported in this browser.');
      return;
    }
    if (mirrored) {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        announce('Could not capture a photo from this camera.');
        return;
      }
      downloadBlob(blob, `emotion-system_${timestamp()}.png`);
      announce('Photo saved locally.');
    }, 'image/png');
  }, [announce, mirrored, stream, videoRef]);

  const toggleRecording = useCallback(() => {
    const currentRecorder = recorderRef.current;
    if (currentRecorder?.state === 'recording') {
      try {
        currentRecorder.stop();
      } catch {
        announce('Recording failed. Try again.');
      }
      return;
    }
    if (!stream || typeof MediaRecorder === 'undefined') {
      announce('This browser does not support video recording.');
      return;
    }
    if (!stream.getVideoTracks().some((track) => track.readyState === 'live')) {
      announce('Camera image is not ready yet.');
      return;
    }

    try {
      const mimeType = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4;codecs=avc1.42E01E',
        'video/mp4',
      ].find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => announce('Recording failed. Try again.');
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
        chunksRef.current = [];
        if (blob.size > 0) {
          const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
          downloadBlob(blob, `emotion-system_${timestamp()}.${extension}`);
          announce('Recording saved locally.');
        } else {
          announce('Recording failed. Try again.');
        }
        if (mountedRef.current) setRecording(false);
        if (recorderRef.current === recorder) recorderRef.current = null;
      };
      recorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
      announce('Recording started. Use STOP RECORDING to finish.');
    } catch {
      announce('This browser does not support video recording.');
    }
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
          <button type="button" onClick={takePhoto} data-testid="button-take-photo">
            <Camera size={14} /><span>{t('TAKE PHOTO')}</span>
          </button>
          <button
            className={recording ? 'is-recording' : ''}
            type="button"
            aria-pressed={recording}
            onClick={toggleRecording}
            data-testid="button-toggle-recording"
          >
            {recording ? <Square size={13} fill="currentColor" /> : <Circle size={14} />}
            <span>{t(recording ? 'STOP RECORDING' : 'START RECORDING')}</span>
          </button>
        </div>
      )}

      {status && <div className="camera-capture-status" role="status" aria-live="polite" data-testid="status-capture">{t(status)}</div>}
    </div>
  );
}
