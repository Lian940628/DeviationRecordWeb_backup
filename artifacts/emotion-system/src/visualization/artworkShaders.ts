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

  vec2 coverUv(vec2 uv) {
    float viewAspect = uResolution.x / max(uResolution.y, 1.0);
    float sourceAspect = uVideoResolution.x / max(uVideoResolution.y, 1.0);
    if (sourceAspect > viewAspect) {
      uv.x = (uv.x - 0.5) * viewAspect / sourceAspect + 0.5;
    } else {
      uv.y = (uv.y - 0.5) * sourceAspect / viewAspect + 0.5;
    }
    if (uMirrored > 0.5) uv.x = 1.0 - uv.x;
    return clamp(uv, 0.001, 0.999);
  }

  vec3 cam(vec2 uv) {
    return texture2D(uVideo, coverUv(uv)).rgb;
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
    return cam(uv);
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
      float slot = floor(uTime * 11.0 + seed * 3.7);
      float pulse = hash(vec2(seed * 13.1, slot));
      float on = step(0.42, pulse);
      float flavour = hash(vec2(slot, seed + 7.0));
      // Coarse digital blocks inside the box; most of the body flips when on.
      vec2 cell = floor(local * vec2(3.0 + floor(flavour * 4.0), 5.0 + floor(pulse * 6.0)));
      float blockRand = hash(cell + vec2(seed * 5.0, slot));
      float blockOn = on * step(0.22, blockRand);
      if (blockOn < 0.5) continue;

      // Pixel displacement and RGB channel offset of real pixels.
      float shift = (hash(vec2(cell.y, slot + seed)) - 0.5) * 0.035;
      vec2 suv = uv + vec2(shift, 0.0);
      float off = 0.006 + flavour * 0.01;
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
        float q = floor(l * 4.0 + 0.5) / 4.0;
        fx = q < 0.3 ? DEEP + TEAL * 0.25 : (q < 0.6 ? ICE : (q < 0.9 ? CYAN : vec3(0.85, 0.98, 1.0)));
      } else {
        // Posterised RGB with channel split.
        fx = floor(split * 3.0 + 0.5) / 3.0;
        fx = mix(fx, fx.bgr * vec3(0.4, 1.0, 1.1), 0.6);
      }
      // Rare accent blocks: gold for HAPPY, a hot red sliver otherwise.
      float accent = hash(cell + vec2(slot * 0.37, seed));
      if (accent > 0.99) {
        fx = uPersonHappy[i] > 0.5 ? GOLD * (0.55 + l) : vec3(0.82, 0.12, 0.2) * (0.5 + l);
      }
      color = clamp(fx, 0.0, 1.0);
    }
    return color;
  }

  // ---------- STAGE 2: PARTICLE ----------
  vec3 stageParticle(vec2 uv) {
    vec2 px = 1.0 / max(uResolution, vec2(1.0));
    float c = luma(uv);
    vec2 g = scharr(uv, px * 1.5);
    float edge = length(g);
    float around = (luma(uv + vec2(px.x * 3.0, 0.0)) + luma(uv - vec2(px.x * 3.0, 0.0))
      + luma(uv + vec2(0.0, px.y * 3.0)) + luma(uv - vec2(0.0, px.y * 3.0))) * 0.25;
    float detail = abs(c - around);
    float density = clamp(pow(c, 2.2) * 0.18 + edge * 1.8 + detail * 2.6 - 0.035, 0.0, 0.65);

    // Irregular, time-jittered specks; no lattice. Step at ~14Hz so it never freezes.
    float frameStep = floor(uTime * 14.0);
    vec2 fc = floor(gl_FragCoord.xy);
    float r = hash(fc + vec2(frameStep * 17.0, frameStep * 3.0));
    // Low-frequency clumping so density is uneven.
    float clump = hash(floor(gl_FragCoord.xy / 9.0) + frameStep * 0.5);
    float speck = step(r, density * (0.55 + clump * 0.75));

    float tone = clamp(edge * 3.0 + detail * 2.0, 0.0, 1.0);
    vec3 hue = mix(TEAL, mix(ICE, CYAN, tone), step(0.3, hash(fc + 91.0)));
    float bright = 0.24 + c * 0.35 + tone * 0.22;
    return DEEP * 0.45 + hue * speck * bright;
  }

  // ---------- STAGE 3: LINE ----------
  vec3 stageLine(vec2 uv) {
    vec2 px = 1.0 / max(uResolution, vec2(1.0));
    float frameStep = floor(uTime * 12.0);
    // Occasional horizontal band jitter (small, rare).
    float band = floor(gl_FragCoord.y / 14.0);
    float jit = hash(vec2(band, frameStep));
    vec2 juv = uv + vec2(jit > 0.93 ? (jit - 0.965) * 0.02 : 0.0, 0.0);

    vec2 g = scharr(juv, px * 1.2);
    float mag = length(g);
    vec2 dir = mag > 0.0001 ? g / mag : vec2(1.0, 0.0);
    // Non-maximum suppression along gradient for thin lines.
    float m1 = length(scharr(juv + dir * px * 1.2, px * 1.2));
    float m2 = length(scharr(juv - dir * px * 1.2, px * 1.2));
    float thin = step(m1, mag * 1.02) * step(m2, mag * 1.02);
    float line = smoothstep(0.05, 0.16, mag) * thin;
    // Weak inner detail lines kept faint.
    line = max(line, smoothstep(0.025, 0.05, mag) * thin * 0.28);

    // Breaks: drop short segments along irregular cells, re-rolled over time.
    vec2 segCell = floor(gl_FragCoord.xy / vec2(7.0, 5.0));
    float keep = step(0.17, hash(segCell + vec2(frameStep * 0.5, 3.0)));
    float flicker = 0.75 + 0.25 * hash(vec2(frameStep, segCell.x));
    line *= keep * flicker;

    vec3 col = mix(ICE, CYAN, clamp(mag * 3.0, 0.0, 1.0));
    float faintScan = 0.97 + 0.03 * step(0.5, fract(gl_FragCoord.y * 0.25));
    return DEEP * 0.7 + col * line * 0.95 * faintScan;
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
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;
