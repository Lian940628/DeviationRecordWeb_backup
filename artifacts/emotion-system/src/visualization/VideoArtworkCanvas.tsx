import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import * as THREE from 'three';
import type { ExpressionReadout } from '../tracking/expressionTypes';
import type { PersonTrack } from '../tracking/types';
import type { VisualMode } from '../visual-controls/visualControlsTypes';
import { artworkFragmentShader, artworkVertexShader } from './artworkShaders';
import type { VisualSettings } from './visualSettings';

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
  settings: VisualSettings;
  onRenderingFps: (fps: number) => void;
  renderSize?: { width: number; height: number } | null;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
}

interface TransitionState {
  key: number;
  startTime: number;
  durationMs: number;
}

function modeValue(mode: VisualMode): number {
  switch (mode) {
    case 'anomaly': return 1;
    case 'particle': return 2;
    case 'line': return 3;
    default: return 0;
  }
}

function colorVector(color: string): [number, number, number] {
  const value = Number.parseInt(color.slice(1), 16);
  if (!Number.isFinite(value)) return [0.2, 0.8, 0.7];
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function setUniformColor(uniforms: THREE.ShaderMaterial['uniforms'], name: string, color: string) {
  const [red, green, blue] = colorVector(color);
  (uniforms[name]?.value as THREE.Vector3).set(red, green, blue);
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
  settings,
  onRenderingFps,
  renderSize = null,
  onCanvasReady,
}: VideoArtworkCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef(tracks);
  const expressionsRef = useRef(expressions);
  const mirroredRef = useRef(mirrored);
  const renderScaleRef = useRef(renderScale);
  const renderSizeRef = useRef(renderSize);
  const settingsRef = useRef(settings);
  const fpsCallbackRef = useRef(onRenderingFps);
  const canvasReadyCallbackRef = useRef(onCanvasReady);
  const uniformsRef = useRef<THREE.ShaderMaterial['uniforms'] | null>(null);
  const resizeCallbackRef = useRef<(() => void) | null>(null);
  const transitionRef = useRef<TransitionState | null>(null);
  const lastTransitionKeyRef = useRef(transitionKey);
  const errorRef = useRef<HTMLParagraphElement>(null);

  tracksRef.current = tracks;
  expressionsRef.current = expressions;
  mirroredRef.current = mirrored;
  renderScaleRef.current = renderScale;
  renderSizeRef.current = renderSize;
  settingsRef.current = settings;
  fpsCallbackRef.current = onRenderingFps;
  canvasReadyCallbackRef.current = onCanvasReady;

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
    const personSeed = new Float32Array(MAX_PERSONS);
    const drawingSize = new THREE.Vector2();
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
      uPersonSeed: { value: personSeed },
      uGlobal: { value: new Float32Array(10) },
      uNormalSettings: { value: new THREE.Vector4(100, 100, 100, 0) },
      uNormalScanline: { value: 0 },
      uAnomalySettings: { value: new THREE.Vector4(100, 1.6, 3.5, 4) },
      uAnomalyPulseSettings: { value: new THREE.Vector4(11, 11, 1, 0) },
      uAnomalyColor: { value: new THREE.Vector3(0.32, 0.83, 0.75) },
      uParticleSettings: { value: new THREE.Vector4(1.5, 40, 100, 1.8) },
      uParticleMotionSettings: { value: new THREE.Vector4(0.035, 100, 14, 0) },
      uParticleColor: { value: new THREE.Vector3(0.32, 0.83, 0.75) },
      uLineSettings: { value: new THREE.Vector4(1.5, 83, 0.05, 100) },
      uLineFragmentSettings: { value: new THREE.Vector4(83, 25, 2, 0) },
      uLineGlow: { value: 0 },
      uLineColor: { value: new THREE.Vector3(0.26, 0.72, 0.91) },
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
      const outputSize = renderSizeRef.current;
      if (outputSize) {
        renderer.setPixelRatio(1);
        renderer.setSize(outputSize.width, outputSize.height, false);
        renderer.getDrawingBufferSize(drawingSize);
        setUniformVector(uniforms, 'uResolution', drawingSize.x, drawingSize.y);
        return;
      }
      if (!bounds.width || !bounds.height) return;
      // Limit GPU fill rate on high-DPI displays while keeping enough detail for the HUD.
      const pixelRatio = Math.min(1.25, (window.devicePixelRatio || 1) * renderScaleRef.current);
      renderer.setPixelRatio(Math.max(0.35, pixelRatio));
      renderer.setSize(bounds.width, bounds.height, false);
      renderer.getDrawingBufferSize(drawingSize);
      setUniformVector(uniforms, 'uResolution', drawingSize.x, drawingSize.y);
    };
    resizeCallbackRef.current = resize;

    resize();
    canvasReadyCallbackRef.current?.(renderer.domElement);
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(resize)
      : null;
    resizeObserver?.observe(host);
    window.addEventListener('resize', resize);

    const updatePeople = () => {
      uniforms.uMirrored.value = mirroredRef.current ? 1 : 0;
      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      const bounds = host.getBoundingClientRect();
      if (!sourceWidth || !sourceHeight || bounds.width <= 0 || bounds.height <= 0) {
        uniforms.uBoxCount.value = 0;
        return;
      }

      const scale = Math.min(bounds.width / sourceWidth, bounds.height / sourceHeight);
      const imageWidth = sourceWidth * scale;
      const imageHeight = sourceHeight * scale;
      const padX = (bounds.width - imageWidth) / 2;
      const padY = (bounds.height - imageHeight) / 2;
      const boxes = uniforms.uPersonBoxes.value as THREE.Vector4[];
      const happyValues = uniforms.uPersonHappy.value as Float32Array;
      const allTracks = tracksRef.current;
      const expressionList = expressionsRef.current;
      let index = 0;
      for (let t = 0; t < allTracks.length && index < MAX_PERSONS; t += 1) {
        const track = allTracks[t];
        if (!track || !track.visible) continue;
        const sourceTrackWidth = track.width * sourceWidth * scale;
        const sourceTrackHeight = track.height * sourceHeight * scale;
        const width = sourceTrackWidth / bounds.width;
        const height = sourceTrackHeight / bounds.height;
        let x = (padX + track.x * sourceWidth * scale) / bounds.width;
        const y = (padY + track.y * sourceHeight * scale) / bounds.height;
        if (mirroredRef.current) {
          x = (padX + imageWidth - track.x * sourceWidth * scale - sourceTrackWidth) / bounds.width;
        }
        boxes[index]?.set(x, y, width, height);
        let happy = 0;
        for (let e = 0; e < expressionList.length; e += 1) {
          if (expressionList[e]?.trackId === track.id) {
            happy = expressionList[e]?.label === 'HAPPY' ? 1 : 0;
            break;
          }
        }
        happyValues[index] = happy;
        personSeed[index] = (track.id * 7.31) % 97;
        index += 1;
      }
      uniforms.uBoxCount.value = index;
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
      const currentSettings = settingsRef.current;
      const global = currentSettings.global;
      (uniforms.uGlobal.value as Float32Array).set([
        global.saturation,
        global.brightness,
        global.contrast,
        global.gamma,
        global.exposure,
        global.hueShift,
        global.inputBlack,
        global.inputWhite,
        global.outputBlack,
        global.outputWhite,
      ]);
      const normal = currentSettings.stages.normal;
      (uniforms.uNormalSettings.value as THREE.Vector4).set(
        normal.localBrightness,
        normal.localContrast,
        normal.localSaturation,
        normal.digitalNoiseIntensity,
      );
      uniforms.uNormalScanline.value = normal.scanlineOpacity;
      const anomaly = currentSettings.stages.anomaly;
      (uniforms.uAnomalySettings.value as THREE.Vector4).set(
        anomaly.intensity,
        anomaly.colorShiftAmount,
        anomaly.pixelDisplacement,
        anomaly.posterizationLevels,
      );
      (uniforms.uAnomalyPulseSettings.value as THREE.Vector4).set(
        anomaly.glitchFrequency,
        anomaly.flickerSpeed,
        anomaly.effectOpacity,
        0,
      );
      setUniformColor(uniforms, 'uAnomalyColor', anomaly.anomalyColor);
      const particle = currentSettings.stages.particle;
      (uniforms.uParticleSettings.value as THREE.Vector4).set(
        particle.particleSize,
        particle.particleDensity,
        particle.particleBrightness,
        particle.edgeSensitivity,
      );
      (uniforms.uParticleMotionSettings.value as THREE.Vector4).set(
        particle.luminanceThreshold,
        particle.particleJitter,
        particle.particleMovementSpeed,
        particle.glowIntensity,
      );
      setUniformColor(uniforms, 'uParticleColor', particle.particleColor);
      const line = currentSettings.stages.line;
      (uniforms.uLineSettings.value as THREE.Vector4).set(
        line.lineThickness,
        line.lineDensity,
        line.edgeThreshold,
        line.lineBrightness,
      );
      (uniforms.uLineFragmentSettings.value as THREE.Vector4).set(
        line.fragmentationIntensity,
        line.lineFlicker,
        line.personConnectionWidth,
        line.personConnectionOpacity,
      );
      uniforms.uLineGlow.value = line.personConnectionGlow;
      setUniformColor(uniforms, 'uLineColor', line.lineColor);
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
      canvasReadyCallbackRef.current?.(null);
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
    if (transitionKey !== lastTransitionKeyRef.current && transitionDurationSeconds <= 0) {
      transitionRef.current = null;
      uniforms.uTransitionProgress.value = -1;
      lastTransitionKeyRef.current = transitionKey;
    } else if (transitionKey !== lastTransitionKeyRef.current) {
      uniforms.uFromMode.value = modeValue(previousMode);
      uniforms.uTransitionProgress.value = 0;
      transitionRef.current = {
        key: transitionKey,
        startTime: performance.now(),
        durationMs: Math.max(80, Math.min(200, transitionDurationSeconds * 1000)),
      };
      lastTransitionKeyRef.current = transitionKey;
    }
  }, [mode, previousMode, transitionKey, transitionDurationSeconds]);

  useEffect(() => {
    resizeCallbackRef.current?.();
  }, [renderScale, renderSize?.width, renderSize?.height]);

  return (
    <div ref={hostRef} className="video-artwork">
      <p ref={errorRef} className="video-artwork-error" role="status" />
    </div>
  );
}
