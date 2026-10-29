import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import * as THREE from 'three';
import type { ExpressionReadout } from '../tracking/expressionTypes';
import type { PersonTrack } from '../tracking/types';
import type { VisualMode } from '../visual-controls/VisualModeControls';
import { artworkFragmentShader, artworkVertexShader } from './artworkShaders';

const MAX_PERSONS = 5;
const TARGET_FRAME_INTERVAL_MS = 1000 / 30;

interface VideoArtworkCanvasProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  tracks: PersonTrack[];
  expressions: ExpressionReadout[];
  running: boolean;
  mirrored: boolean;
  mode: VisualMode;
  previousMode: VisualMode;
  transitionKey: number;
  transitionDurationSeconds: number;
  renderScale: number;
  onRenderingFps: (fps: number) => void;
}

interface TransitionState {
  key: number;
  startTime: number;
  durationMs: number;
}

function modeValue(mode: VisualMode): number {
  return mode === 'scan' ? 1 : 0;
}

function setUniformVector(
  uniforms: THREE.ShaderMaterial['uniforms'],
  name: string,
  x: number,
  y: number,
): void {
  (uniforms[name]?.value as THREE.Vector2).set(x, y);
}

export function VideoArtworkCanvas({
  videoRef,
  tracks,
  expressions,
  running,
  mirrored,
  mode,
  previousMode,
  transitionKey,
  transitionDurationSeconds,
  renderScale,
  onRenderingFps,
}: VideoArtworkCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef(tracks);
  const expressionsRef = useRef(expressions);
  const mirroredRef = useRef(mirrored);
  const renderScaleRef = useRef(renderScale);
  const fpsCallbackRef = useRef(onRenderingFps);
  const uniformsRef = useRef<THREE.ShaderMaterial['uniforms'] | null>(null);
  const resizeCallbackRef = useRef<(() => void) | null>(null);
  const transitionRef = useRef<TransitionState | null>(null);
  const lastTransitionKeyRef = useRef(transitionKey);
  const errorRef = useRef<HTMLParagraphElement>(null);

  tracksRef.current = tracks;
  expressionsRef.current = expressions;
  mirroredRef.current = mirrored;
  renderScaleRef.current = renderScale;
  fpsCallbackRef.current = onRenderingFps;

  useEffect(() => {
    const host = hostRef.current;
    const video = videoRef.current;
    if (!host || !video || !running) {
      fpsCallbackRef.current(0);
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: false,
        antialias: false,
        powerPreference: 'high-performance',
        stencil: false,
        depth: false,
      });
    } catch {
      if (errorRef.current) {
        errorRef.current.textContent = 'WEBGL UNAVAILABLE · CAMERA PREVIEW CONTINUES';
      }
      fpsCallbackRef.current(0);
      return;
    }

    renderer.domElement.className = 'video-artwork-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.setClearColor(0x030b15, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    host.appendChild(renderer.domElement);

    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.NoColorSpace;
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.generateMipmaps = false;

    const personBoxes = Array.from({ length: MAX_PERSONS }, () => new THREE.Vector4());
    const personHappy = new Float32Array(MAX_PERSONS);
    const uniforms: THREE.ShaderMaterial['uniforms'] = {
      uVideo: { value: videoTexture },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uVideoResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uMode: { value: modeValue(mode) },
      uFromMode: { value: modeValue(mode) },
      uTransitionProgress: { value: -1 },
      uMirrored: { value: 0 },
      uBoxCount: { value: 0 },
      uPersonBoxes: { value: personBoxes },
      uPersonHappy: { value: personHappy },
    };
    uniformsRef.current = uniforms;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: artworkVertexShader,
      fragmentShader: artworkFragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    scene.add(new THREE.Mesh(geometry, material));

    let frameId = 0;
    let lastRenderAt = 0;
    let fpsWindowStart = 0;
    let fpsFrames = 0;
    let lastFpsReportAt = 0;

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const pixelRatio = Math.min(2, (window.devicePixelRatio || 1) * renderScaleRef.current);
      renderer.setPixelRatio(Math.max(0.35, pixelRatio));
      renderer.setSize(bounds.width, bounds.height, false);
      const resolution = new THREE.Vector2();
      renderer.getDrawingBufferSize(resolution);
      setUniformVector(uniforms, 'uResolution', resolution.x, resolution.y);
    };
    resizeCallbackRef.current = resize;

    resize();
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(resize)
      : null;
    resizeObserver?.observe(host);
    window.addEventListener('resize', resize);

    const updatePeople = () => {
      const visibleTracks = tracksRef.current.filter((track) => track.visible).slice(0, MAX_PERSONS);
      const expressionByTrack = new Map(expressionsRef.current.map((item) => [item.trackId, item]));
      uniforms.uMirrored.value = mirroredRef.current ? 1 : 0;
      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      const bounds = host.getBoundingClientRect();
      if (!sourceWidth || !sourceHeight || bounds.width <= 0 || bounds.height <= 0) {
        uniforms.uBoxCount.value = 0;
        return;
      }

      const scale = Math.max(bounds.width / sourceWidth, bounds.height / sourceHeight);
      const cropX = (sourceWidth * scale - bounds.width) / 2;
      const cropY = (sourceHeight * scale - bounds.height) / 2;
      const boxes = uniforms.uPersonBoxes.value as THREE.Vector4[];
      const happyValues = uniforms.uPersonHappy.value as Float32Array;
      visibleTracks.forEach((track, index) => {
        const width = (track.width * sourceWidth * scale) / bounds.width;
        const height = (track.height * sourceHeight * scale) / bounds.height;
        let x = (track.x * sourceWidth * scale - cropX) / bounds.width;
        const y = (track.y * sourceHeight * scale - cropY) / bounds.height;
        if (mirroredRef.current) x = 1 - x - width;
        boxes[index]?.set(x, y, width, height);
        happyValues[index] = expressionByTrack.get(track.id)?.label === 'HAPPY' ? 1 : 0;
      });
      uniforms.uBoxCount.value = visibleTracks.length;
      uniforms.uMirrored.value = mirroredRef.current ? 1 : 0;
    };

    const render = (now: number) => {
      frameId = window.requestAnimationFrame(render);
      if (now - lastRenderAt < TARGET_FRAME_INTERVAL_MS) return;
      lastRenderAt = now;
      if (!fpsWindowStart) fpsWindowStart = now;
      fpsFrames += 1;
      if (now - fpsWindowStart >= 900 && now - lastFpsReportAt >= 850) {
        fpsCallbackRef.current(Math.round((fpsFrames * 1000) / (now - fpsWindowStart)));
        fpsFrames = 0;
        fpsWindowStart = now;
        lastFpsReportAt = now;
      }

      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      if (videoWidth > 0 && videoHeight > 0) {
        setUniformVector(uniforms, 'uVideoResolution', videoWidth, videoHeight);
      }
      uniforms.uTime.value = now / 1000;
      updatePeople();

      const transition = transitionRef.current;
      if (transition) {
        const progress = Math.min(1, (now - transition.startTime) / transition.durationMs);
        uniforms.uTransitionProgress.value = progress;
        if (progress >= 1) {
          uniforms.uTransitionProgress.value = -1;
          transitionRef.current = null;
        }
      }
      renderer.render(scene, camera);
    };

    frameId = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      resizeCallbackRef.current = null;
      transitionRef.current = null;
      uniformsRef.current = null;
      videoTexture.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      fpsCallbackRef.current(0);
    };
  }, [videoRef, running]);

  useEffect(() => {
    const uniforms = uniformsRef.current;
    if (!uniforms) return;
    uniforms.uMode.value = modeValue(mode);
    if (transitionKey !== lastTransitionKeyRef.current) {
      uniforms.uFromMode.value = modeValue(previousMode);
      uniforms.uTransitionProgress.value = 0;
      transitionRef.current = {
        key: transitionKey,
        startTime: performance.now(),
        durationMs: Math.max(150, Math.min(350, transitionDurationSeconds * 1000)),
      };
      lastTransitionKeyRef.current = transitionKey;
    }
  }, [mode, previousMode, transitionKey, transitionDurationSeconds]);

  useEffect(() => {
    resizeCallbackRef.current?.();
  }, [renderScale]);

  return (
    <div ref={hostRef} className="video-artwork">
      <p ref={errorRef} className="video-artwork-error" role="status" />
    </div>
  );
}
