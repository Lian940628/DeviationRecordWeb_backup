import type { VisualMode } from '../visual-controls/visualControlsTypes';
import type { VisualSettings } from './visualSettings';

type FrameOptions = {
  context: CanvasRenderingContext2D;
  sampleContext: CanvasRenderingContext2D;
  video: HTMLVideoElement;
  width: number;
  height: number;
  mode: VisualMode;
  mirrored: boolean;
  settings: VisualSettings;
  now: number;
};

function luminance(data: Uint8ClampedArray, index: number) {
  return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
}

function hash(value: number) {
  const result = Math.sin(value * 127.1 + 311.7) * 43758.5453;
  return result - Math.floor(result);
}

function drawContained(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
  mirrored: boolean,
) {
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  if (!videoWidth || !videoHeight) return null;
  const scale = Math.min(width / videoWidth, height / videoHeight);
  const drawWidth = videoWidth * scale;
  const drawHeight = videoHeight * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  context.save();
  if (mirrored) {
    context.translate(width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(video, x, y, drawWidth, drawHeight);
  context.restore();
  return { x, y, width: drawWidth, height: drawHeight };
}

/** Lightweight visual-mode backup for browsers where WebGL cannot start. */
export function drawArtworkFallbackFrame(options: FrameOptions) {
  const { context, sampleContext, video, width, height, mode, mirrored, settings, now } = options;
  if (width < 1 || height < 1 || !video.videoWidth || !video.videoHeight) return;
  const global = settings.global;
  const normal = settings.stages.normal;
  context.clearRect(0, 0, width, height);

  if (mode === 'particle' || mode === 'line') {
    context.fillStyle = '#06121a';
    context.fillRect(0, 0, width, height);
    const sampleWidth = sampleContext.canvas.width;
    const sampleHeight = sampleContext.canvas.height;
    sampleContext.clearRect(0, 0, sampleWidth, sampleHeight);
    drawContained(sampleContext, video, sampleWidth, sampleHeight, mirrored);
    const image = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight);
    const data = image.data;

    if (mode === 'particle') {
      const particle = settings.stages.particle;
      const threshold = Math.max(10, Math.min(240, particle.luminanceThreshold * 255));
      const stride = Math.max(2, Math.round(6 - particle.particleDensity / 25));
      const radius = Math.max(0.6, Math.min(3.4, particle.particleSize * 0.55));
      context.fillStyle = particle.particleColor;
      context.shadowColor = particle.particleColor;
      context.shadowBlur = Math.max(0, particle.glowIntensity * 0.08);
      for (let y = 1; y < sampleHeight - 1; y += stride) {
        for (let x = 1; x < sampleWidth - 1; x += stride) {
          const offset = (y * sampleWidth + x) * 4;
          const light = luminance(data, offset);
          const left = luminance(data, offset - 4);
          const top = luminance(data, offset - sampleWidth * 4);
          if (light < threshold && Math.abs(light - left) + Math.abs(light - top) < particle.edgeSensitivity * 24) continue;
          const seed = y * sampleWidth + x;
          const jitter = particle.particleJitter * 0.004;
          const drift = now * particle.particleMovementSpeed * 0.0005;
          const px = x + (hash(seed) - 0.5) * jitter * sampleWidth + Math.sin(drift + seed) * 0.8;
          const py = y + (hash(seed + 7) - 0.5) * jitter * sampleHeight + Math.cos(drift + seed) * 0.8;
          context.globalAlpha = Math.min(1, 0.35 + light / 255 * particle.particleBrightness / 100);
          context.fillRect(px / sampleWidth * width, py / sampleHeight * height, radius, radius);
        }
      }
      context.globalAlpha = 1;
      context.shadowBlur = 0;
    } else {
      const line = settings.stages.line;
      const threshold = Math.max(18, Math.min(180, line.edgeThreshold * 255));
      const stride = Math.max(1, Math.round(5 - line.lineDensity / 25));
      context.fillStyle = line.lineColor;
      context.shadowColor = line.lineColor;
      context.shadowBlur = Math.max(0, line.lineBrightness * 0.025);
      for (let y = 1; y < sampleHeight - 1; y += stride) {
        for (let x = 1; x < sampleWidth - 1; x += stride) {
          const offset = (y * sampleWidth + x) * 4;
          const gradient = Math.abs(luminance(data, offset) - luminance(data, offset + 4))
            + Math.abs(luminance(data, offset) - luminance(data, offset + sampleWidth * 4));
          if (gradient < threshold || hash(x * 13 + y * 31 + Math.floor(now / 110)) < line.fragmentationIntensity / 240) continue;
          context.globalAlpha = Math.min(1, 0.3 + gradient / 180);
          context.fillRect(x / sampleWidth * width, y / sampleHeight * height, Math.max(1, line.lineThickness * 0.65), Math.max(1, line.lineThickness * 0.65));
        }
      }
      context.globalAlpha = 1;
      context.shadowBlur = 0;
    }
    return;
  }

  context.save();
  context.filter = [
    `brightness(${Math.max(0, global.brightness * normal.localBrightness / 100)}%)`,
    `contrast(${Math.max(0, global.contrast * normal.localContrast / 100)}%)`,
    `saturate(${Math.max(0, global.saturation * normal.localSaturation / 100)}%)`,
    `hue-rotate(${global.hueShift}deg)`,
  ].join(' ');
  drawContained(context, video, width, height, mirrored);
  context.restore();

  if (mode === 'normal') {
    const opacity = Math.max(0, Math.min(0.45, normal.scanlineOpacity / 250));
    context.fillStyle = `rgba(3, 15, 23, ${opacity})`;
    for (let y = 0; y < height; y += 4) context.fillRect(0, y, width, 1);
    return;
  }

  const anomaly = settings.stages.anomaly;
  const frequency = Math.max(1, anomaly.glitchFrequency);
  const beat = Math.floor(now / (1000 / frequency));
  if (beat % 3 !== 0) return;
  const bandCount = Math.max(2, Math.min(9, Math.round(anomaly.intensity / 24)));
  const shift = Math.max(2, anomaly.pixelDisplacement * width * 0.012);
  context.save();
  context.globalCompositeOperation = 'screen';
  context.globalAlpha = Math.max(0.1, Math.min(0.82, anomaly.effectOpacity / 100));
  context.filter = `hue-rotate(${anomaly.colorShiftAmount * 34}deg) saturate(1.8)`;
  for (let index = 0; index < bandCount; index += 1) {
    const seed = beat * 7 + index * 19;
    const y = hash(seed) * height;
    const bandHeight = Math.max(2, height * (0.008 + hash(seed + 3) * 0.035));
    const offset = (hash(seed + 9) - 0.5) * shift;
    context.drawImage(context.canvas, 0, y, width, bandHeight, offset, y, width, bandHeight);
  }
  context.restore();
}
