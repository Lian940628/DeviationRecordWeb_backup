export const artworkVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/*
 * Four distinct render stages share one VideoTexture:
 *   0 NORMAL   - untouched camera colour
 *   1 ANOMALY  - per-person pixel corruption inside tracked boxes
 *   2 PARTICLE - black field of irregular, image-driven specks
 *   3 LINE     - thin, broken Scharr contour lines
 */
export const artworkFragmentShader = `
  precision highp float;
  #define MAX_PERSONS 5

  uniform sampler2D uVideo;
  uniform vec2 uResolution;
  uniform vec2 uVideoResolution;
  uniform float uTime;
  uniform float uMode;
  uniform float uFromMode;
  uniform float uTransitionProgress;
  uniform float uMirrored;
  uniform float uBoxCount;
  uniform vec4 uPersonBoxes[MAX_PERSONS];
  uniform float uPersonHappy[MAX_PERSONS];
  uniform float uPersonSeed[MAX_PERSONS];
  uniform float uGlobal[10];
  uniform vec4 uNormalSettings;
  uniform float uNormalScanline;
  uniform vec4 uAnomalySettings;
  uniform vec4 uAnomalyPulseSettings;
  uniform vec3 uAnomalyColor;
  uniform vec4 uParticleSettings;
  uniform vec4 uParticleMotionSettings;
  uniform vec3 uParticleColor;
  uniform vec4 uLineSettings;
  uniform vec4 uLineFragmentSettings;
  uniform float uLineGlow;
  uniform vec3 uLineColor;
  varying vec2 vUv;

  const vec3 DEEP = vec3(0.0118, 0.0431, 0.0824);
  const vec3 ICE = vec3(0.2588, 0.7216, 0.9098);
  const vec3 CYAN = vec3(0.4902, 0.8627, 0.9569);
  const vec3 TEAL = vec3(0.3216, 0.8314, 0.7451);
  const vec3 GOLD = vec3(0.9098, 0.7804, 0.4784);

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec2 containUv(vec2 uv) {
    float viewAspect = uResolution.x / max(uResolution.y, 1.0);
    float sourceAspect = uVideoResolution.x / max(uVideoResolution.y, 1.0);
    if (sourceAspect > viewAspect) {
      float visibleHeight = viewAspect / sourceAspect;
      float padY = (1.0 - visibleHeight) * 0.5;
      uv.y = (uv.y - padY) / visibleHeight;
    } else {
      float visibleWidth = sourceAspect / viewAspect;
      float padX = (1.0 - visibleWidth) * 0.5;
      uv.x = (uv.x - padX) / visibleWidth;
    }
    if (uMirrored > 0.5) uv.x = 1.0 - uv.x;
    return uv;
  }

  vec3 cam(vec2 uv) {
    vec2 sourceUv = containUv(uv);
    if (sourceUv.x < 0.0 || sourceUv.x > 1.0 || sourceUv.y < 0.0 || sourceUv.y > 1.0) return DEEP;
    return texture2D(uVideo, clamp(sourceUv, 0.001, 0.999)).rgb;
  }

  float luma(vec2 uv) {
    return dot(cam(uv), vec3(0.2126, 0.7152, 0.0722));
  }

  // Scharr gradient of luminance at uv with tap distance px (in uv units).
  vec2 scharr(vec2 uv, vec2 px) {
    float tl = luma(uv + vec2(-px.x, px.y));
    float tc = luma(uv + vec2(0.0, px.y));
    float tr = luma(uv + vec2(px.x, px.y));
    float ml = luma(uv + vec2(-px.x, 0.0));
    float mr = luma(uv + vec2(px.x, 0.0));
    float bl = luma(uv + vec2(-px.x, -px.y));
    float bc = luma(uv + vec2(0.0, -px.y));
    float br = luma(uv + vec2(px.x, -px.y));
    float gx = 3.0 * (tr + br - tl - bl) + 10.0 * (mr - ml);
    float gy = 3.0 * (tl + tr - bl - br) + 10.0 * (tc - bc);
    return vec2(gx, gy) / 16.0;
  }

  // ---------- STAGE 0: NORMAL ----------
  vec3 stageNormal(vec2 uv) {
    vec3 color = cam(uv);
    color = (color - 0.5) * (uNormalSettings.y * 0.01) + 0.5;
    color *= uNormalSettings.x * 0.01;
    float gray = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(gray), color, uNormalSettings.z * 0.01);
    float noiseAmount = uNormalSettings.w * 0.01;
    float noise = (hash(gl_FragCoord.xy + floor(uTime * 24.0)) - 0.5) * noiseAmount;
    color += noise;
    float scan = 1.0 - uNormalScanline * 0.01 * step(0.5, fract(gl_FragCoord.y * 0.5));
    return color * scan;
  }

  // ---------- STAGE 1: ANOMALY ----------
  vec3 stageAnomaly(vec2 uv) {
    vec3 base = cam(uv);
    vec3 color = base;
    vec2 point = vec2(vUv.x, 1.0 - vUv.y);
    for (int i = 0; i < MAX_PERSONS; i++) {
      if (float(i) >= uBoxCount) break;
      vec4 box = uPersonBoxes[i];
      vec2 local = (point - box.xy) / max(box.zw, vec2(0.0001));
      if (local.x < 0.0 || local.y < 0.0 || local.x > 1.0 || local.y > 1.0) continue;
      float seed = uPersonSeed[i];
      // Asynchronous per-person pulse: ~11 slots/sec, each person on its own schedule.
      float slot = floor(uTime * uAnomalyPulseSettings.x + seed * 3.7);
      float pulse = hash(vec2(seed * 13.1, slot));
      float flickerPhase = 0.5 + 0.5 * sin(uTime * uAnomalyPulseSettings.y * 6.28318 + seed);
      float on = step(0.42, pulse) * mix(0.35, 1.0, flickerPhase);
      float flavour = hash(vec2(slot, seed + 7.0));
      // Coarse digital blocks inside the box; most of the body flips when on.
      vec2 cell = floor(local * vec2(3.0 + floor(flavour * 4.0), 5.0 + floor(pulse * 6.0)));
      float blockRand = hash(cell + vec2(seed * 5.0, slot));
      float intensity = uAnomalySettings.x * 0.01;
      float blockOn = on * step(0.38 - 0.16 * min(intensity, 2.0), blockRand);
      if (blockOn < 0.5) continue;

      // Pixel displacement and RGB channel offset of real pixels.
      float shiftPixels = (hash(vec2(cell.y, slot + seed)) - 0.5) * 2.0 * uAnomalySettings.z * intensity;
      vec2 suv = uv + vec2(shiftPixels / max(uResolution.x, 1.0), 0.0);
      float off = uAnomalySettings.y * intensity * (0.35 + flavour * 0.65) / max(uResolution.x, 1.0);
      vec3 split = vec3(cam(suv + vec2(off, 0.0)).r, cam(suv).g, cam(suv - vec2(off, 0.0)).b);
      float l = dot(split, vec3(0.2126, 0.7152, 0.0722));

      vec3 fx;
      float kind = fract(blockRand * 3.0 + flavour);
      if (kind < 0.34) {
        // Inversion pushed toward cyan.
        vec3 inv = 1.0 - split;
        fx = vec3(inv.r * 0.35, inv.g * 0.95, inv.b * 1.1);
      } else if (kind < 0.68) {
        // Hard posterised teal mapping.
        float levels = max(2.0, uAnomalySettings.w);
        float q = floor(l * levels + 0.5) / levels;
        fx = q < 0.3 ? DEEP + TEAL * 0.25 : (q < 0.6 ? ICE : (q < 0.9 ? CYAN : vec3(0.85, 0.98, 1.0)));
      } else {
        // Posterised RGB with channel split.
        float levels = max(2.0, uAnomalySettings.w);
        fx = floor(split * levels + 0.5) / levels;
        fx = mix(fx, fx.bgr * vec3(0.4, 1.0, 1.1), 0.6);
      }
      fx = mix(fx, fx * 0.35 + uAnomalyColor * (0.25 + l * 0.3), 0.42);
      // Rare accent blocks: gold for HAPPY, a hot red sliver otherwise.
      float accent = hash(cell + vec2(slot * 0.37, seed));
      if (accent > 0.99) {
        fx = uPersonHappy[i] > 0.5 ? GOLD * (0.55 + l) : vec3(0.82, 0.12, 0.2) * (0.5 + l);
      }
      color = mix(color, clamp(fx, 0.0, 1.0), clamp(uAnomalyPulseSettings.z * 0.01 * on, 0.0, 1.0));
    }
    return color;
  }

  // ---------- STAGE 2: PARTICLE ----------
  vec3 stageParticle(vec2 uv) {
    vec2 px = 1.0 / max(uResolution, vec2(1.0));
    float frameStep = floor(uTime * uParticleMotionSettings.z);
    vec2 fc = floor(gl_FragCoord.xy / 3.0);
    float jitter = uParticleMotionSettings.y * 0.01;
    vec2 jitterUv = vec2(
      hash(fc + vec2(frameStep, 4.0)),
      hash(fc + vec2(8.0, frameStep))
    );
    vec2 sampleUv = uv + (jitterUv - 0.5) * px * 2.0 * jitter;
    float c = luma(sampleUv);
    vec2 g = scharr(sampleUv, px * 1.5);
    float edge = length(g) * uParticleSettings.w;
    float around = (luma(sampleUv + vec2(px.x * 3.0, 0.0)) + luma(sampleUv - vec2(px.x * 3.0, 0.0))
      + luma(sampleUv + vec2(0.0, px.y * 3.0)) + luma(sampleUv - vec2(0.0, px.y * 3.0))) * 0.25;
    float detail = abs(c - around);
    float potential = clamp(pow(c, 2.2) * 0.18 + edge + detail * 2.6 - uParticleMotionSettings.x, 0.0, 1.0);
    float density = potential * uParticleSettings.y * 0.01;

    // Each 3px cell has an independent, jittered sample; density gates cells, size changes dot radius.
    float r = hash(fc + vec2(frameStep * 17.0, frameStep * 3.0));
    float clump = hash(floor(gl_FragCoord.xy / 9.0) + frameStep * 0.5);
    float sampleOn = step(r, density * (0.55 + clump * 0.75));
    vec2 localPixel = mod(gl_FragCoord.xy, 3.0);
    vec2 particleCenter = 0.5 + (jitterUv - 0.5) * 0.8 * jitter;
    float radius = max(0.15, uParticleSettings.x * 0.5);
    float dotMask = 1.0 - smoothstep(radius * 0.7, radius, length(localPixel - particleCenter * 3.0));

    float tone = clamp(edge * 3.0 + detail * 2.0, 0.0, 1.0);
    vec3 hue = mix(uParticleColor, mix(ICE, CYAN, tone), step(0.72, hash(fc + 91.0)));
    float bright = uParticleSettings.z * 0.01 * (0.24 + c * 0.35 + tone * 0.22);
    float speck = sampleOn * dotMask;
    float glow = uParticleMotionSettings.w * 0.01 * sampleOn
      * (1.0 - smoothstep(radius, radius + 1.8, length(localPixel - particleCenter * 3.0)));
    return DEEP * 0.45 + hue * (speck * bright + glow * bright * 0.35);
  }

  // ---------- STAGE 3: LINE ----------
  vec3 stageLine(vec2 uv) {
    vec2 px = 1.0 / max(uResolution, vec2(1.0));
    float frameStep = floor(uTime * uLineFragmentSettings.y * 0.2);
    // Occasional horizontal band jitter (small, rare).
    float band = floor(gl_FragCoord.y / 14.0);
    float jit = hash(vec2(band, frameStep));
    vec2 juv = uv + vec2(jit > 0.93 ? (jit - 0.965) * 0.02 : 0.0, 0.0);

    float lineStep = max(uLineSettings.x, 0.5);
    vec2 g = scharr(juv, px * lineStep);
    float mag = length(g);
    vec2 dir = mag > 0.0001 ? g / mag : vec2(1.0, 0.0);
    // Non-maximum suppression along gradient for thin lines.
    float m1 = length(scharr(juv + dir * px * lineStep, px * lineStep));
    float m2 = length(scharr(juv - dir * px * lineStep, px * lineStep));
    float thin = step(m1, mag * 1.02) * step(m2, mag * 1.02);
    // Breaks: drop short segments along irregular cells, re-rolled over time.
    float threshold = max(0.0001, uLineSettings.z);
    float line = smoothstep(threshold, threshold * 2.8 + 0.0001, mag) * thin;
    line = max(line, smoothstep(threshold * 0.5, threshold * 1.1 + 0.0001, mag) * thin * 0.28);
    vec2 segCell = floor(gl_FragCoord.xy / vec2(7.0, 5.0));
    float keep = step(1.0 - uLineSettings.y * 0.01, hash(segCell + vec2(frameStep * 0.5, 3.0)));
    keep *= step(uLineFragmentSettings.x * 0.01, hash(segCell + vec2(frameStep * 0.37, 13.0)));
    float flicker = mix(1.0, 0.55 + 0.45 * hash(vec2(frameStep, segCell.x)), uLineFragmentSettings.y * 0.01);
    line *= keep * flicker;

    vec3 col = mix(uLineColor, CYAN, clamp(mag * 3.0, 0.0, 1.0));
    float faintScan = 0.97 + 0.03 * step(0.5, fract(gl_FragCoord.y * 0.25));
    return DEEP * 0.7 + col * (line * uLineSettings.w * 0.01 * faintScan);
  }

  vec3 rgbToHsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }

  vec3 hsvToRgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
  }

  vec3 applyGlobalSettings(vec3 color) {
    float inputBlack = uGlobal[6] * 0.01;
    float inputWhite = max(inputBlack + 0.01, uGlobal[7] * 0.01);
    color = clamp((color - inputBlack) / (inputWhite - inputBlack), 0.0, 1.0);
    color *= exp2(uGlobal[4]);
    color *= uGlobal[1] * 0.01;
    color = (color - 0.5) * (uGlobal[2] * 0.01) + 0.5;
    color = pow(max(color, vec3(0.0)), vec3(1.0 / max(uGlobal[3], 0.2)));
    float gray = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(gray), color, uGlobal[0] * 0.01);
    vec3 hsv = rgbToHsv(clamp(color, 0.0, 1.0));
    hsv.x = fract(hsv.x + uGlobal[5] / 360.0);
    color = hsvToRgb(hsv);
    float outputBlack = uGlobal[8] * 0.01;
    float outputWhite = max(outputBlack + 0.01, uGlobal[9] * 0.01);
    return mix(vec3(outputBlack), vec3(outputWhite), clamp(color, 0.0, 1.0));
  }

  vec3 renderStage(float mode, vec2 uv) {
    vec3 result = vec3(0.0);
    if (mode < 0.5) result = stageNormal(uv);
    else if (mode < 1.5) result = stageAnomaly(uv);
    else if (mode < 2.5) result = stageParticle(uv);
    else result = stageLine(uv);
    return result;
  }

  void main() {
    float progress = uTransitionProgress;
    vec3 color = vec3(0.0);
    if (progress >= 0.0 && progress < 1.0) {
      // Short glitch cut: horizontal slices randomly show the old or new stage, shifted.
      float step8 = floor(progress * 8.0);
      float slice = floor(gl_FragCoord.y / (6.0 + 18.0 * hash(vec2(step8, 1.0))));
      float r = hash(vec2(slice, step8 + 4.0));
      vec2 shifted = vUv;
      if (r > 0.7) shifted.x = clamp(shifted.x + (r - 0.85) * 0.12, 0.0, 1.0);
      float useNew = step(1.0 - progress * 1.1, r);
      color = useNew > 0.5 ? renderStage(uMode, shifted) : renderStage(uFromMode, shifted);
    } else {
      color = renderStage(uMode, vUv);
    }
    gl_FragColor = vec4(clamp(applyGlobalSettings(color), 0.0, 1.0), 1.0);
  }
`;
