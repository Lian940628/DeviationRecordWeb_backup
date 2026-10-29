export const artworkVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

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
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
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

  vec3 cameraColor(vec2 uv, float mode) {
    float row = floor(gl_FragCoord.y / 4.0);
    float tearNoise = hash(vec2(row, floor(uTime * 3.0)));
    vec2 shiftedUv = uv;
    if (mode < 0.5 && tearNoise > 0.992) {
      shiftedUv.x += (tearNoise - 0.5) * 0.012;
    }
    vec3 color = texture2D(uVideo, coverUv(shiftedUv)).rgb;
    if (mode < 0.5) {
      color *= vec3(0.985, 1.0, 1.025);
      color += (hash(gl_FragCoord.xy + floor(uTime * 12.0)) - 0.5) * 0.012;
      vec2 point = vec2(vUv.x, 1.0 - vUv.y);
      for (int i = 0; i < MAX_PERSONS; i++) {
        if (float(i) >= uBoxCount) break;
        vec4 box = uPersonBoxes[i];
        vec2 insideBox = step(box.xy, point) * step(point, box.xy + box.zw);
        float inside = insideBox.x * insideBox.y;
        vec2 tile = floor((point - box.xy) * vec2(15.0, 21.0));
        float tilePatch = hash(tile + vec2(float(i) * 17.0, float(i) * 31.0));
        if (inside > 0.5 && tilePatch > 0.69) {
          float palette = hash(tile + vec2(float(i) * 9.0, 4.0));
          vec3 blockColor = palette > 0.96
            ? vec3(0.91, 0.78, 0.48)
            : (palette > 0.56 ? vec3(0.32, 0.83, 0.75) : vec3(0.26, 0.72, 0.91));
          if (uPersonHappy[i] > 0.5 && palette > 0.84) {
            blockColor = vec3(0.91, 0.78, 0.48);
          }
          color = mix(color, blockColor, 0.24 * inside);
        }
      }
    }
    return clamp(color, 0.0, 1.0);
  }

  float sampleLuma(vec2 uv) {
    return dot(texture2D(uVideo, coverUv(uv)).rgb, vec3(0.2126, 0.7152, 0.0722));
  }

  vec3 scanColor(vec2 uv) {
    vec2 pixel = 1.0 / max(uResolution, vec2(1.0));
    float tl = sampleLuma(uv + vec2(-pixel.x, pixel.y));
    float tc = sampleLuma(uv + vec2(0.0, pixel.y));
    float tr = sampleLuma(uv + vec2(pixel.x, pixel.y));
    float ml = sampleLuma(uv + vec2(-pixel.x, 0.0));
    float mc = sampleLuma(uv);
    float mr = sampleLuma(uv + vec2(pixel.x, 0.0));
    float bl = sampleLuma(uv + vec2(-pixel.x, -pixel.y));
    float bc = sampleLuma(uv + vec2(0.0, -pixel.y));
    float br = sampleLuma(uv + vec2(pixel.x, -pixel.y));
    float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    float gy = -bl - 2.0 * bc - br + tl + 2.0 * tc + tr;
    float edge = length(vec2(gx, gy));
    float neighborhood = (tl + tc + tr + ml + mr + bl + bc + br) * 0.125;
    float detail = abs(mc - neighborhood);
    float signal = clamp(edge * 2.25 + detail * 4.0 + mc * 0.16, 0.0, 1.0);

    vec2 cell = floor(gl_FragCoord.xy / 2.4);
    float noise = hash(cell + floor(uTime * 7.0));
    float speck = step(0.105 + hash(cell + vec2(11.0, 29.0)) * 0.2, signal);
    vec2 dotPos = fract(gl_FragCoord.xy / 2.4);
    float tinyDot = 1.0 - step(0.48, distance(dotPos, vec2(0.5)));
    float scanline = fract(gl_FragCoord.y * 0.42 + uTime * 0.22) > 0.17 ? 1.0 : 0.42;
    float fragmented = hash(vec2(floor(gl_FragCoord.y / 3.0), floor(uTime * 5.0))) > 0.055 ? 1.0 : 0.0;
    float points = speck * mix(0.18, 1.0, tinyDot) * scanline * fragmented;

    vec3 deep = vec3(3.0, 11.0, 21.0) / 255.0;
    vec3 blue = vec3(66.0, 184.0, 232.0) / 255.0;
    vec3 cyan = vec3(125.0, 220.0, 244.0) / 255.0;
    vec3 teal = vec3(82.0, 212.0, 190.0) / 255.0;
    vec3 color = deep + mix(blue, cyan, clamp(edge * 2.0 + detail * 2.5, 0.0, 1.0)) * points * (0.48 + signal);
    color += blue * step(0.32, edge) * 0.08;
    color += (noise - 0.5) * points * 0.025;

    vec2 point = vec2(vUv.x, 1.0 - vUv.y);
    for (int i = 0; i < MAX_PERSONS; i++) {
      if (float(i) >= uBoxCount) break;
      vec4 box = uPersonBoxes[i];
      vec2 insideBox = step(box.xy, point) * step(point, box.xy + box.zw);
      float inside = insideBox.x * insideBox.y;
      if (inside > 0.5) {
        float localActivity = points * inside;
        vec3 accent = uPersonHappy[i] > 0.5 ? mix(teal, vec3(232.0, 199.0, 122.0) / 255.0, noise > 0.91 ? 0.58 : 0.0) : teal;
        color = mix(color, accent, localActivity * 0.42);
      }
    }
    return clamp(color, 0.0, 1.0);
  }

  vec3 renderMode(float mode, vec2 uv) {
    vec3 result = scanColor(uv);
    if (mode < 0.5) result = cameraColor(uv, mode);
    return result;
  }

  void main() {
    vec3 color = renderMode(uMode, vUv);
    if (uTransitionProgress >= 0.0 && uTransitionProgress < 1.0) {
      float progress = clamp(uTransitionProgress, 0.0, 1.0);
      float pulse = sin(progress * 3.14159265);
      float row = floor(gl_FragCoord.y / 4.0);
      float tear = (hash(vec2(row, floor(progress * 23.0))) - 0.5) * 0.15 * pulse;
      float boundary = 1.18 - progress * 1.36 + tear;
      float reveal = step(boundary, vUv.x);
      vec2 shifted = vUv;
      float slice = hash(vec2(row, floor(progress * 37.0)));
      if (slice > 0.82 && pulse > 0.1) {
        shifted.x = clamp(shifted.x + (slice - 0.82) * 0.11 * pulse, 0.0, 1.0);
      }
      vec3 fromColor = renderMode(uFromMode, shifted);
      vec3 toColor = renderMode(uMode, shifted);
      color = mix(fromColor, toColor, reveal);
      float glitchPixel = step(0.991, hash(floor(gl_FragCoord.xy / vec2(6.0, 3.0)) + floor(progress * 51.0)));
      color = mix(color, vec3(0.26, 0.72, 0.91), glitchPixel * pulse * 0.55);
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;
