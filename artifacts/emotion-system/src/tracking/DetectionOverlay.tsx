import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { PersonTrack } from './types';

interface DetectionOverlayProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  tracks: PersonTrack[];
  running: boolean;
  mirrored: boolean;
  onRenderingFps: (fps: number) => void;
}

interface OverlayGeometry {
  parent: DOMRect;
  video: DOMRect;
  sourceWidth: number;
  sourceHeight: number;
  scale: number;
  cropX: number;
  cropY: number;
}

const TARGET_FRAME_INTERVAL = 1000 / 30;

function getGeometry(video: HTMLVideoElement, canvas: HTMLCanvasElement): OverlayGeometry | null {
  const parent = canvas.parentElement?.getBoundingClientRect();
  const videoRect = video.getBoundingClientRect();
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!parent || !sourceWidth || !sourceHeight || videoRect.width <= 0 || videoRect.height <= 0) return null;

  const scale = Math.max(videoRect.width / sourceWidth, videoRect.height / sourceHeight);
  const cropX = (sourceWidth * scale - videoRect.width) / 2;
  const cropY = (sourceHeight * scale - videoRect.height) / 2;
  return { parent, video: videoRect, sourceWidth, sourceHeight, scale, cropX, cropY };
}

export function DetectionOverlay({
  videoRef,
  tracks,
  running,
  mirrored,
  onRenderingFps,
}: DetectionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tracksRef = useRef(tracks);
  const mirroredRef = useRef(mirrored);
  const fpsCallbackRef = useRef(onRenderingFps);
  tracksRef.current = tracks;
  mirroredRef.current = mirrored;
  fpsCallbackRef.current = onRenderingFps;

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !video || !context || !running) {
      if (canvas) {
        const stoppedContext = canvas.getContext('2d');
        stoppedContext?.clearRect(0, 0, canvas.width, canvas.height);
      }
      fpsCallbackRef.current(0);
      return;
    }

    let frameId = 0;
    let previousFrame = 0;
    let intervalStart = 0;
    let intervalFrames = 0;
    let lastReportedAt = 0;
    let pixelRatio = Math.max(1, window.devicePixelRatio || 1);

    const resizeCanvas = () => {
      const bounds = canvas.parentElement?.getBoundingClientRect();
      if (!bounds) return;
      pixelRatio = Math.max(1, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(bounds.width * pixelRatio));
      const height = Math.max(1, Math.round(bounds.height * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      canvas.style.width = `${bounds.width}px`;
      canvas.style.height = `${bounds.height}px`;
      canvas.style.left = '0px';
      canvas.style.top = '0px';
    };

    resizeCanvas();
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(resizeCanvas)
      : null;
    if (canvas.parentElement) observer?.observe(canvas.parentElement);
    observer?.observe(video);
    window.addEventListener('resize', resizeCanvas);

    const render = (now: number) => {
      frameId = requestAnimationFrame(render);
      if (now - previousFrame < TARGET_FRAME_INTERVAL) return;
      previousFrame = now;
      intervalFrames += 1;
      if (!intervalStart) intervalStart = now;
      if (now - intervalStart >= 500 && now - lastReportedAt >= 450) {
        const elapsed = now - intervalStart;
        fpsCallbackRef.current(elapsed > 0 ? Math.round(intervalFrames * 1000 / elapsed) : 0);
        intervalStart = now;
        intervalFrames = 0;
        lastReportedAt = now;
      }

      const bounds = canvas.getBoundingClientRect();
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);
      const geometry = getGeometry(video, canvas);
      if (!geometry) return;
      const { parent, video: videoRect, scale, cropX, cropY } = geometry;
      const videoOffsetX = videoRect.left - parent.left;
      const videoOffsetY = videoRect.top - parent.top;
      const visibleTracks = tracksRef.current.filter((track) => track.visible);

      context.save();
      context.beginPath();
      context.rect(videoOffsetX, videoOffsetY, videoRect.width, videoRect.height);
      context.clip();
      context.lineWidth = 1;
      context.font = '10px "DM Mono", monospace';
      context.textBaseline = 'top';
      visibleTracks.forEach((track) => {
        const sourceX = track.x * geometry.sourceWidth;
        const sourceY = track.y * geometry.sourceHeight;
        const sourceWidth = track.width * geometry.sourceWidth;
        const sourceHeight = track.height * geometry.sourceHeight;
        let x = videoOffsetX + sourceX * scale - cropX;
        const y = videoOffsetY + sourceY * scale - cropY;
        const width = sourceWidth * scale;
        const height = sourceHeight * scale;
        if (mirroredRef.current) x = videoOffsetX + videoRect.width - (sourceX * scale - cropX) - width;

        const right = x + width;
        const bottom = y + height;
        if (right <= videoOffsetX || x >= videoOffsetX + videoRect.width
          || bottom <= videoOffsetY || y >= videoOffsetY + videoRect.height
          || width <= 0 || height <= 0) return;

        const id = String(Math.max(0, Math.trunc(track.id))).padStart(3, '0');
        const label = `PERSON ID: ${id}`;
        const labelWidth = context.measureText(label).width;
        const labelHeight = 18;
        const labelX = Math.max(videoOffsetX, Math.min(x, videoOffsetX + videoRect.width - labelWidth - 12));
        const labelY = Math.max(videoOffsetY, y - labelHeight);

        context.strokeStyle = 'rgba(104, 237, 213, 0.9)';
        context.shadowColor = 'rgba(79, 239, 221, 0.58)';
        context.shadowBlur = 7;
        context.strokeRect(x + 0.5, y + 0.5, width, height);
        context.shadowBlur = 0;
        context.fillStyle = 'rgba(5, 16, 24, 0.86)';
        context.fillRect(labelX, labelY, labelWidth + 12, labelHeight);
        context.strokeStyle = 'rgba(104, 237, 213, 0.58)';
        context.strokeRect(labelX + 0.5, labelY + 0.5, labelWidth + 11, labelHeight - 1);
        context.fillStyle = '#b9fff0';
        context.fillText(label, labelX + 6, labelY + 4);
      });

      const countLabel = 'PERSON COUNT';
      const countValue = String(visibleTracks.length).padStart(2, '0');
      const countTextWidth = context.measureText(countLabel).width;
      const countX = Math.max(12, videoOffsetX + 18);
       const countY = Math.max(12, videoOffsetY + 42);
      context.fillStyle = 'rgba(5, 16, 24, 0.82)';
      context.fillRect(countX, countY, countTextWidth + 48, 26);
      context.fillStyle = 'rgba(108, 232, 205, 0.92)';
      context.fillRect(countX, countY, 2, 26);
      context.font = '9px "DM Mono", monospace';
      context.fillStyle = 'rgba(184, 218, 219, 0.88)';
      context.fillText(countLabel, countX + 9, countY + 4);
      context.font = '10px "DM Mono", monospace';
      context.fillStyle = '#a8ffe7';
      context.fillText(countValue, countX + 9 + countTextWidth + 8, countY + 4);
      context.restore();
    };

    frameId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frameId);
      observer?.disconnect();
      window.removeEventListener('resize', resizeCanvas);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      fpsCallbackRef.current(0);
    };
  }, [running, videoRef]);

  return <canvas ref={canvasRef} className="detection-overlay-canvas" aria-hidden="true" data-testid="canvas-detection-overlay" />;
}
