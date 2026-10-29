import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export interface VideoOutputFormat {
  label: string;
  mimeType: string;
  extension: 'webm' | 'mp4';
}

const RECORDER_FORMATS: VideoOutputFormat[] = [
  { label: 'WebM · VP9', mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
  { label: 'WebM · VP8', mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
  { label: 'WebM', mimeType: 'video/webm', extension: 'webm' },
  { label: 'MP4 · H.264', mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
  { label: 'MP4', mimeType: 'video/mp4', extension: 'mp4' },
];

function getOutputSize(width: number, height: number) {
  const scale = Math.min(1, 1920 / Math.max(width, height));
  return {
    width: Math.max(2, Math.floor((width * scale) / 2) * 2),
    height: Math.max(2, Math.floor((height * scale) / 2) * 2),
  };
}

function safeBaseName(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 80) || 'emotion-system';
}

function waitForSeek(video: HTMLVideoElement, time: number) {
  if (Math.abs(video.currentTime - time) < 0.025) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('The video could not seek to the selected start time.'));
    }, 4000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    const onSeeked = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('The video could not seek to the selected start time.')); };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.currentTime = time;
  });
}

function waitForCanvas(
  getCanvas: () => HTMLCanvasElement | null,
  expectedSize: { width: number; height: number },
  isCancelled: () => boolean,
) {
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const startedAt = performance.now();
    const check = () => {
      if (isCancelled()) {
        reject(new Error('Export cancelled.'));
        return;
      }
      const canvas = getCanvas();
      if (canvas && canvas.width === expectedSize.width && canvas.height === expectedSize.height) {
        resolve(canvas);
        return;
      }
      if (performance.now() - startedAt > 5000) {
        reject(new Error('The processed preview is not ready. Enable processed mode and try again.'));
        return;
      }
      window.requestAnimationFrame(check);
    };
    check();
  });
}

export function useLocalVideoExport({
  videoRef,
  canvasRef,
  sourceName,
  trimStart,
  trimEnd,
  onEnableProcessed,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  sourceName: string;
  trimStart: number;
  trimEnd: number;
  onEnableProcessed: () => void;
}) {
  const [formats, setFormats] = useState<VideoOutputFormat[]>([]);
  const [format, setFormat] = useState('');
  const [includeAudio, setIncludeAudio] = useState(true);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [renderSize, setRenderSize] = useState<{ width: number; height: number } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const activeRef = useRef(false);
  const preparingRef = useRef(false);
  const cancelledRef = useRef(false);
  const animationRef = useRef(0);
  const lastProgressAtRef = useRef(0);
  const trimRef = useRef({ start: trimStart, end: trimEnd });
  const downloadUrlsRef = useRef<string[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  trimRef.current = { start: trimStart, end: trimEnd };

  useEffect(() => {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
      setFormats([]);
      return;
    }
    const supported = RECORDER_FORMATS.filter((item) => MediaRecorder.isTypeSupported(item.mimeType));
    const unique = supported.filter((item, index) =>
      supported.findIndex((candidate) => candidate.extension === item.extension) === index,
    );
    setFormats(unique);
    setFormat((current) => unique.some((item) => item.mimeType === current) ? current : unique[0]?.mimeType ?? '');
  }, []);

  const stopMediaTracks = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const finalizeRecording = useCallback((save: boolean) => {
    const existingRecorder = recorderRef.current;
    if (
      !activeRef.current &&
      !preparingRef.current &&
      (!existingRecorder || existingRecorder.state === 'inactive') &&
      !mediaStreamRef.current &&
      !audioDestinationRef.current
    ) return;
    activeRef.current = false;
    preparingRef.current = false;
    cancelledRef.current = !save;
    window.cancelAnimationFrame(animationRef.current);
    const video = videoRef.current;
    video?.pause();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        stopMediaTracks();
      }
    } else {
      stopMediaTracks();
      audioDestinationRef.current?.stream.getTracks().forEach((track) => track.stop());
      audioDestinationRef.current = null;
      if (audioSourceRef.current && audioContextRef.current) {
        audioSourceRef.current.disconnect();
        audioSourceRef.current.connect(audioContextRef.current.destination);
      }
      setRenderSize(null);
    }
    setRecording(false);
  }, [stopMediaTracks, videoRef]);

  const startExport = useCallback(async () => {
    const video = videoRef.current;
    const selectedFormat = formats.find((item) => item.mimeType === format);
    if (!video || !selectedFormat) {
      setError('This browser does not support local video export.');
      return;
    }
    if (!trimEnd || trimEnd <= trimStart || trimEnd - trimStart > 30.01) {
      setError('Choose a valid clip between 1 and 30 seconds.');
      return;
    }
    if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
      setError('This browser cannot record a processed canvas stream.');
      return;
    }

    setError('');
    setStatus('');
    setProgress(0);
    const outputSize = getOutputSize(video.videoWidth, video.videoHeight);
    setRenderSize(outputSize);
    onEnableProcessed();
    cancelledRef.current = false;
    preparingRef.current = true;
    setRecording(true);

    try {
      let audioResumePromise: Promise<void> | null = null;
      if (includeAudio) {
        const browserWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
        const AudioContextConstructor = window.AudioContext ?? browserWindow.webkitAudioContext;
        if (!AudioContextConstructor) throw new Error('This browser cannot mix the source audio for export.');
        const context = audioContextRef.current ?? new AudioContextConstructor();
        audioContextRef.current = context;
        if (!audioSourceRef.current) {
          audioSourceRef.current = context.createMediaElementSource(video);
          audioSourceRef.current.connect(context.destination);
        }
        audioSourceRef.current.disconnect();
        audioSourceRef.current.connect(context.destination);
        audioDestinationRef.current = context.createMediaStreamDestination();
        audioSourceRef.current.connect(audioDestinationRef.current);
        audioResumePromise = context.resume();
      }

      const canvas = await waitForCanvas(() => canvasRef.current, outputSize, () => cancelledRef.current);
      if (cancelledRef.current) return;
      const videoStream = canvas.captureStream(30);
      const tracks = [...videoStream.getVideoTracks()];

      if (includeAudio) {
        await audioResumePromise;
        const audioTracks = audioDestinationRef.current?.stream.getAudioTracks() ?? [];
        tracks.push(...audioTracks);
      }

      if (tracks.length === 0) throw new Error('No video stream is available for recording.');
      const stream = new MediaStream(tracks);
      mediaStreamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: selectedFormat.mimeType,
        videoBitsPerSecond: 8_000_000,
        audioBitsPerSecond: 160_000,
      });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError('The browser encoder stopped unexpectedly. Try a shorter clip or another format.');
        setStatus('');
        finalizeRecording(false);
      };
      recorder.onstop = () => {
        recorderRef.current = null;
        stopMediaTracks();
        audioDestinationRef.current = null;
        if (audioSourceRef.current && audioContextRef.current) {
          audioSourceRef.current.disconnect();
          audioSourceRef.current.connect(audioContextRef.current.destination);
        }
        setRenderSize(null);
        if (!cancelledRef.current && chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: selectedFormat.mimeType });
          const url = URL.createObjectURL(blob);
          downloadUrlsRef.current.push(url);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${safeBaseName(sourceName)}_processed.${selectedFormat.extension}`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setStatus(`Export ready · ${selectedFormat.label} · ${(blob.size / (1024 * 1024)).toFixed(1)} MB`);
        } else if (cancelledRef.current) {
          setStatus('Export cancelled.');
        } else {
          setError('The encoder did not produce a video file.');
        }
        chunksRef.current = [];
      };

      await waitForSeek(video, trimStart);
      if (cancelledRef.current) return;
      if (video.requestVideoFrameCallback) {
        await new Promise<void>((resolve) => {
          let completed = false;
          const finish = () => {
            if (completed) return;
            completed = true;
            window.clearTimeout(timeout);
            resolve();
          };
          const timeout = window.setTimeout(finish, 600);
          video.requestVideoFrameCallback(finish);
        });
      }
      if (cancelledRef.current) return;
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
      recorder.start(250);
      activeRef.current = true;
      preparingRef.current = false;
      await video.play();
      setStatus('Recording processed playback in this browser…');

      const monitor = (now: number) => {
        if (!activeRef.current) return;
        const windowRange = trimRef.current;
        const elapsed = Math.max(0, Math.min(windowRange.end - windowRange.start, video.currentTime - windowRange.start));
        if (now - lastProgressAtRef.current > 100) {
          setProgress(elapsed / Math.max(0.001, windowRange.end - windowRange.start));
          lastProgressAtRef.current = now;
        }
        if (video.currentTime >= windowRange.end) {
          setProgress(1);
          finalizeRecording(true);
          return;
        }
        animationRef.current = window.requestAnimationFrame(monitor);
      };
      animationRef.current = window.requestAnimationFrame(monitor);
    } catch (exportError) {
      const wasCancelled = cancelledRef.current;
      preparingRef.current = false;
      finalizeRecording(false);
      setRenderSize(null);
      if (!wasCancelled) {
        setRecording(false);
        setError(exportError instanceof Error ? exportError.message : 'Could not export this video.');
        setStatus('');
      }
    }
  }, [canvasRef, finalizeRecording, format, formats, includeAudio, onEnableProcessed, sourceName, stopMediaTracks, trimEnd, trimStart, videoRef]);

  const cancelExport = useCallback(() => {
    if (activeRef.current || preparingRef.current) finalizeRecording(false);
  }, [finalizeRecording]);

  useEffect(() => () => {
    cancelledRef.current = true;
    activeRef.current = false;
    preparingRef.current = false;
    window.cancelAnimationFrame(animationRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* already stopping */ }
    }
    stopMediaTracks();
    audioSourceRef.current?.disconnect();
    void audioContextRef.current?.close();
    downloadUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, [stopMediaTracks]);

  const updateProgress = useCallback((time: number) => {
    if (!activeRef.current) return;
    const range = trimRef.current;
    setProgress(Math.max(0, Math.min(1, (time - range.start) / Math.max(0.001, range.end - range.start))));
    if (time >= range.end) finalizeRecording(true);
  }, [finalizeRecording]);

  return {
    formats,
    format,
    setFormat,
    includeAudio,
    setIncludeAudio,
    recording,
    progress,
    status,
    error,
    renderSize,
    startExport,
    cancelExport,
    updateProgress,
  };
}
