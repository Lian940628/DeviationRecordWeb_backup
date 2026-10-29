import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { LineStageSettings } from '../visualization/visualSettings';
import type { PersonTrack } from './types';
import { buildPersonConnectionTree } from './personConnections';

const FRAME_INTERVAL_MS = 1000 / 30;

interface PersonConnectionsOverlayProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  tracks: PersonTrack[];
  running: boolean;
  mirrored: boolean;
  active: boolean;
  settings: Pick<
    LineStageSettings,
    | 'personConnectionWidth'
    | 'personConnectionOpacity'
    | 'personConnectionGlow'
    | 'personConnectionAnimationSpeed'
  >;
}

interface VideoGeometry {
  parent: DOMRect;
  video: DOMRect;
  sourceWidth: number;
  sourceHeight: number;
  scale: number;
  padX: number;
  padY: number;
}

function getGeometry(video: HTMLVideoElement, canvas: HTMLCanvasElement): VideoGeometry | null {
  const parent = canvas.parentElement?.getBoundingClientRect();
  const videoRect = video.getBoundingClientRect();
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!parent || !sourceWidth || !sourceHeight || videoRect.width <= 0 || videoRect.height <= 0) return null;
  const scale = Math.min(videoRect.width / sourceWidth, videoRect.height / sourceHeight);
  return {
    parent,
    video: videoRect,
    sourceWidth,
    sourceHeight,
    scale,
    padX: (videoRect.width - sourceWidth * scale) / 2,
    padY: (videoRect.height - sourceHeight * scale) / 2,
  };
}

export function PersonConnectionsOverlay({
  videoRef,
  tracks,
  running,
  mirrored,
  active,
  settings,
}: PersonConnectionsOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tracksRef = useRef(tracks);
  const mirroredRef = useRef(mirrored);
  const activeRef = useRef(active);
  const settingsRef = useRef(settings);
  tracksRef.current = tracks;
  mirroredRef.current = mirrored;
  activeRef.current = active;
  settingsRef.current = settings;

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !video || !context || !running) {
      context?.clearRect(0, 0, canvas?.width ?? 0, canvas?.height ?? 0);
      return;
    }
    if (!active || settings.personConnectionOpacity <= 0) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    let frameId = 0;
    let previousFrame = 0;
    let pixelRatio = Math.min(1.25, Math.max(1, window.devicePixelRatio || 1));

    const resize = () => {
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

    resize();
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (canvas.parentElement) resizeObserver?.observe(canvas.parentElement);
    resizeObserver?.observe(video);
    window.addEventListener('resize', resize);

    const render = (now: number) => {
      frameId = window.requestAnimationFrame(render);
      if (now - previousFrame < FRAME_INTERVAL_MS) return;
      previousFrame = now;
      const bounds = canvas.getBoundingClientRect();
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);
      if (!activeRef.current || settingsRef.current.personConnectionOpacity <= 0) return;

      const geometry = getGeometry(video, canvas);
      if (!geometry) return;
      const { parent, video: videoRect, sourceWidth, sourceHeight, scale, padX, padY } = geometry;
      const offsetX = videoRect.left - parent.left;
      const offsetY = videoRect.top - parent.top;
      const visibleTracks = tracksRef.current.filter((track) => track.visible);
      const byId = new Map(visibleTracks.map((track) => [track.id, track]));
      const edges = buildPersonConnectionTree(visibleTracks);
      if (!edges.length) return;

      const centerFor = (track: PersonTrack) => {
        const sourceCenterX = (track.x + track.width / 2) * sourceWidth * scale;
        const sourceCenterY = (track.y + track.height / 2) * sourceHeight * scale;
        return {
          x: offsetX + padX + (mirroredRef.current ? sourceWidth * scale - sourceCenterX : sourceCenterX),
          y: offsetY + padY + sourceCenterY,
        };
      };

      const connections = edges.flatMap((edge) => {
        const fromTrack = byId.get(edge.fromId);
        const toTrack = byId.get(edge.toId);
        if (!fromTrack || !toTrack) return [];
        return [{ ...edge, from: centerFor(fromTrack), to: centerFor(toTrack) }];
      });
      const options = settingsRef.current;
      const opacity = Math.max(0, Math.min(1, options.personConnectionOpacity / 100));
      const lineWidth = Math.max(0.5, options.personConnectionWidth);
      const glow = Math.max(0, Math.min(1, options.personConnectionGlow / 100));

      context.save();
      context.beginPath();
      context.rect(offsetX + padX, offsetY + padY, sourceWidth * scale, sourceHeight * scale);
      context.clip();
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      for (const connection of connections) {
        context.moveTo(connection.from.x, connection.from.y);
        context.lineTo(connection.to.x, connection.to.y);
      }
      context.strokeStyle = 'rgba(232, 232, 222, 1)';
      context.globalAlpha = opacity * 0.52;
      context.lineWidth = lineWidth;
      context.shadowColor = `rgba(93, 239, 167, ${glow})`;
      context.shadowBlur = glow * 14;
      context.stroke();

      if (options.personConnectionAnimationSpeed > 0) {
        context.setLineDash([Math.max(1.5, lineWidth), Math.max(7, lineWidth * 5)]);
        context.lineDashOffset = -(now * 0.018 * options.personConnectionAnimationSpeed);
        context.globalAlpha = opacity * 0.9;
        context.lineWidth = Math.max(0.75, lineWidth * 0.55);
        context.shadowBlur = glow * 18;
        context.stroke();
        context.setLineDash([]);
      }

      const phase = (now * 0.00016 * options.personConnectionAnimationSpeed) % 1;
      context.globalAlpha = opacity;
      context.fillStyle = '#f1efe6';
      context.shadowBlur = glow * 12;
      for (const [index, connection] of connections.entries()) {
        const progress = (phase + index / connections.length) % 1;
        const x = connection.from.x + (connection.to.x - connection.from.x) * progress;
        const y = connection.from.y + (connection.to.y - connection.from.y) * progress;
        context.beginPath();
        context.arc(x, y, Math.max(1.15, lineWidth * 0.8), 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    };

    frameId = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [running, videoRef, active, settings.personConnectionOpacity]);

  return <canvas ref={canvasRef} className="person-connections-canvas" aria-hidden="true" data-testid="canvas-person-connections" />;
}
