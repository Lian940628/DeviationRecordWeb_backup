import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'idle' | 'live' | 'error';
export interface CameraDevice { deviceId: string; label: string; }

function cameraErrorMessage(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera access was denied. Allow camera access in your browser or operating-system privacy settings, then try again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No available camera was found. Connect a camera and check that it is enabled, then try again.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The camera could not be read. Another app may be using it; close that app and try again.';
  }
  if (name === 'AbortError') {
    return 'The camera request was interrupted. Check your browser and operating-system camera settings, then try again.';
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'This camera does not support the requested settings. Choose another camera or try again.';
  }
  return 'The camera could not start. Check that your browser supports camera access and that no privacy setting is blocking it.';
}

export function useCameraController() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const startingRef = useRef(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [message, setMessage] = useState('Your camera stays in this browser. Nothing is recorded or sent.');
  const [fps, setFps] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const stopTracks = useCallback((active: MediaStream | null) => {
    active?.getTracks().forEach((track) => track.stop());
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const available = (await navigator.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === 'videoinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label.trim() || `Camera ${index + 1}`,
        }));
      setDevices(available);
      if (!selectedDevice && available.length > 0) setSelectedDevice(available[0].deviceId);
      if (selectedDevice && !available.some((device) => device.deviceId === selectedDevice)) {
        setSelectedDevice(available[0]?.deviceId ?? '');
      }
    } catch {
      setDevices([]);
    }
  }, [selectedDevice]);

  useEffect(() => {
    void refreshDevices();
    const devicesChanged = () => { void refreshDevices(); };
    navigator.mediaDevices?.addEventListener?.('devicechange', devicesChanged);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', devicesChanged);
  }, [refreshDevices]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    if (stream) {
      void video.play().catch(() => {
        setMessage('The live preview is paused. Use the video controls or restart the camera to continue.');
      });
    }
  }, [stream]);

  useEffect(() => {
    if (!stream) { setFps(0); return; }
    const video = videoRef.current;
    if (!video) return;
    let frameRequest = 0;
    let cancelled = false;
    let lastTime = 0;
    let samples = 0;
    const frameVideo = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: (now: number) => void) => number;
      cancelVideoFrameCallback?: (id: number) => void;
    };
    const onFrame = (now: number) => {
      if (cancelled) return;
      samples += 1;
      if (!lastTime) lastTime = now;
      if (now - lastTime >= 900) {
        setFps(Math.round(samples * 1000 / (now - lastTime)));
        samples = 0;
        lastTime = now;
      }
      if (frameVideo.requestVideoFrameCallback) frameRequest = frameVideo.requestVideoFrameCallback(onFrame);
    };
    if (frameVideo.requestVideoFrameCallback) frameRequest = frameVideo.requestVideoFrameCallback(onFrame);
    else {
      let previousTime = -1;
      const fallback = () => {
        if (cancelled) return;
        if (video.readyState >= 2 && video.currentTime !== previousTime) {
          previousTime = video.currentTime;
          onFrame(performance.now());
        }
        frameRequest = requestAnimationFrame(fallback);
      };
      frameRequest = requestAnimationFrame(fallback);
    }
    return () => {
      cancelled = true;
      if (frameVideo.cancelVideoFrameCallback) frameVideo.cancelVideoFrameCallback(frameRequest);
      else cancelAnimationFrame(frameRequest);
    };
  }, [stream]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopTracks(streamRef.current);
      streamRef.current = null;
    };
  }, [stopTracks]);

  // This function is called only from the explicit START CAMERA control.
  const startCamera = useCallback(async () => {
    if (startingRef.current) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setMessage('Camera access needs a secure page (HTTPS or localhost) and a browser with camera support.');
      return;
    }
    startingRef.current = true;
    setIsStarting(true);
    setMessage('Waiting for camera permission…');
    try {
      if (streamRef.current) {
        stopTracks(streamRef.current);
        streamRef.current = null;
        setStream(null);
        setStatus('idle');
      }
      const videoConstraints: MediaTrackConstraints = selectedDevice
        ? { deviceId: { exact: selectedDevice }, aspectRatio: { ideal: 16 / 9 } }
        : { aspectRatio: { ideal: 16 / 9 } };
      const nextStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
      if (!mountedRef.current) {
        stopTracks(nextStream);
        return;
      }
      streamRef.current = nextStream;
      setStream(nextStream);
      setPermissionGranted(true);
      setStatus('live');
      setMessage('Live preview active. Your video remains local to this browser.');
      void refreshDevices();
    } catch (error) {
      if (mountedRef.current) {
        setStatus('error');
        setMessage(cameraErrorMessage(error));
      }
    } finally {
      startingRef.current = false;
      if (mountedRef.current) setIsStarting(false);
    }
  }, [refreshDevices, selectedDevice, stopTracks]);

  const stopCamera = useCallback(() => {
    stopTracks(streamRef.current);
    streamRef.current = null;
    setStream(null);
    setStatus('idle');
    setFps(0);
    setMessage('Camera stopped. No video was recorded or sent.');
  }, [stopTracks]);

  const selectedLabel = devices.find((device) => device.deviceId === selectedDevice)?.label ?? '';
  const mirrored = /front|user|facetime|built-in.*camera|integrated.*camera/i.test(selectedLabel)
    || stream?.getVideoTracks()[0]?.getSettings().facingMode === 'user';

  return {
    videoRef, stream, devices, selectedDevice, setSelectedDevice, status, message, fps,
    permissionGranted, mirrored, startCamera, stopCamera, isStarting,
    secureSupported: typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia,
  };
}
