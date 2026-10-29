import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { ExpressionReadout } from './expressionTypes';
import type { PersonTrack } from './types';
import { useTranslation } from '../i18n';

interface DetectionOverlayProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  tracks: PersonTrack[];
  expressions: ExpressionReadout[];
  running: boolean;
  mirrored: boolean;
  showPersonIds?: boolean;
  onRenderingFps: (fps: number) => void;
}

interface OverlayGeometry {
  parent: DOMRect;
  video: DOMRect;
  sourceWidth: number;
  sourceHeight: number;
  scale: number;
  padX: number;
  padY: number;
}

const TARGET_FRAME_INTERVAL = 1000 / 30;

function getGeometry(video: HTMLVideoElement, canvas: HTMLCanvasElement): OverlayGeometry | null {
  const parent = canvas.parentElement?.getBoundingClientRect();
  const videoRect = video.getBoundingClientRect();
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!parent || !sourceWidth || !sourceHeight || videoRect.width <= 0 || videoRect.height <= 0) return null;

  const scale = Math.min(videoRect.width / sourceWidth, videoRect.height / sourceHeight);
  const padX = (videoRect.width - sourceWidth * scale) / 2;
  const padY = (videoRect.height - sourceHeight * scale) / 2;
  return { parent, video: videoRect, sourceWidth, sourceHeight, scale, padX, padY };
}

export function DetectionOverlay({
  videoRef,
  tracks,
  expressions,
  running,
  mirrored,
  showPersonIds = true,
  onRenderingFps,
}: DetectionOverlayProps) {
  const t = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tracksRef = useRef(tracks);
  const expressionsRef = useRef(expressions);
  const mirroredRef = useRef(mirrored);
  const showPersonIdsRef = useRef(showPersonIds);
  const fpsCallbackRef = useRef(onRenderingFps);
  const translateRef = useRef(t);
  tracksRef.current = tracks;
  expressionsRef.current = expressions;
  mirroredRef.current = mirrored;
  showPersonIdsRef.current = showPersonIds;
  fpsCallbackRef.current = onRenderingFps;
  translateRef.current = t;

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
    let pixelRatio = Math.min(1.25, Math.max(1, window.devicePixelRatio || 1));

    const resizeCanvas = () => {
      const bounds = canvas.parentElement?.getBoundingClientRect();
      if (!bounds) return;
      pixelRatio = Math.min(1.25, Math.max(1, window.devicePixelRatio || 1));
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
      const { parent, video: videoRect, sourceWidth, sourceHeight, scale, padX, padY } = geometry;
      const videoOffsetX = videoRect.left - parent.left;
      const videoOffsetY = videoRect.top - parent.top;
      const visibleTracks = tracksRef.current.filter((track) => track.visible);
      const expressionByTrack = new Map(expressionsRef.current.map((item) => [item.trackId, item]));

      context.save();
      context.beginPath();
      context.rect(videoOffsetX + padX, videoOffsetY + padY, sourceWidth * scale, sourceHeight * scale);
      context.clip();
      context.lineWidth = 1;
      context.font = '10px "DM Mono", monospace';
      context.textBaseline = 'top';
      visibleTracks.forEach((track) => {
        const sourceX = track.x * geometry.sourceWidth;
        const sourceY = track.y * geometry.sourceHeight;
        const sourceWidth = track.width * geometry.sourceWidth;
        const sourceHeight = track.height * geometry.sourceHeight;
        let x = videoOffsetX + padX + sourceX * scale;
        const y = videoOffsetY + padY + sourceY * scale;
        const width = sourceWidth * scale;
        const height = sourceHeight * scale;
        if (mirroredRef.current) {
          x = videoOffsetX + padX + geometry.sourceWidth * scale - sourceX * scale - width;
        }

        const right = x + width;
        const bottom = y + height;
        if (right <= videoOffsetX || x >= videoOffsetX + videoRect.width
          || bottom <= videoOffsetY || y >= videoOffsetY + videoRect.height
          || width <= 0 || height <= 0) return;

        const id = String(Math.max(0, Math.trunc(track.id))).padStart(3, '0');
        const expression = expressionByTrack.get(track.id);
        const expressionLabel = `${translateRef.current('EXPRESSION:')} ${translateRef.current(expression?.label ?? 'UNKNOWN')}`;
        const scoreLabel = `${translateRef.current('SCORE:')} ${expression?.score === null || expression?.score === undefined ? '--' : expression.score.toFixed(2)}`;
        const labels = showPersonIdsRef.current
          ? [`${translateRef.current('PERSON ID:')} ${id}`, expressionLabel, scoreLabel]
          : [expressionLabel, scoreLabel];
        const labelWidth = Math.max(...labels.map((label) => context.measureText(label).width));
        const labelHeight = labels.length * 13 + 3;
        const labelX = Math.max(videoOffsetX, Math.min(x, videoOffsetX + videoRect.width - labelWidth - 12));
        const labelY = Math.max(videoOffsetY, y - labelHeight);

        context.strokeStyle = 'rgba(239, 237, 226, 0.94)';
        context.shadowColor = 'rgba(93, 239, 167, 0.5)';
        context.shadowBlur = 7;
        context.strokeRect(x + 0.5, y + 0.5, width, height);
        context.shadowBlur = 0;
        context.fillStyle = 'rgba(3, 4, 5, 0.9)';
        context.fillRect(labelX, labelY, labelWidth + 12, labelHeight);
        context.strokeStyle = 'rgba(239, 237, 226, 0.58)';
        context.strokeRect(labelX + 0.5, labelY + 0.5, labelWidth + 11, labelHeight - 1);
        labels.forEach((label, index) => {
          const isId = showPersonIdsRef.current && index === 0;
          const isExpression = label.startsWith('EXPRESSION:');
          context.fillStyle = isId || (isExpression && expression?.label !== 'UNKNOWN')
            ? '#5defa7'
            : isExpression ? '#efeee8' : '#c4c2b9';
          context.fillText(label, labelX + 6, labelY + 4 + index * 13);
        });
      });

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
