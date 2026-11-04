import type { DeviationDraft } from './types';

interface OccupiedCell {
  x: number;
  y: number;
  weight: number;
  key: number;
}

type BlockKind = 'large' | 'medium' | 'small';
type NormalizedRect = { x: number; y: number; width: number; height: number; kind: BlockKind };
type ActiveBlock = NormalizedRect & { alpha: number; index: number; tick: number };

interface PersonLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

const LOOP_SECONDS = 5;
const OCCUPANCY_SIZE = 48;
const MAX_BLOCKS = 9;
const PARTICLE_CAPACITY = 180;
const cellCache = new WeakMap<HTMLImageElement, OccupiedCell[]>();
const planCache = new WeakMap<HTMLImageElement, Map<string, NormalizedRect[]>>();

const PALETTES: Record<DeviationDraft['visualMode'], { accent: string; secondary: string }> = {
  ARCHIVE: { accent: '#9df3f2', secondary: '#d8fffa' },
  GLITCH: { accent: '#8fffe9', secondary: '#a7c9ff' },
  SIGNAL: { accent: '#63e7ff', secondary: '#d2ff9a' },
  MONO: { accent: '#edf7f7', secondary: '#91d6d5' },
};

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export function getPersonFrameStage(seconds: number) {
  const loopTime = ((seconds % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
  return Math.min(4, Math.floor(loopTime));
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFor(seed: number, index: number, tick: number, salt = 0) {
  let value = (
    seed ^
    Math.imul(index + 1, 0x9e3779b1) ^
    Math.imul(tick + 17, 0x85ebca6b) ^
    Math.imul(salt + 31, 0xc2b2ae35)
  ) | 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

function getOccupiedCells(image: HTMLImageElement) {
  const cached = cellCache.get(image);
  if (cached) return cached;

  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = OCCUPANCY_SIZE;
  sampleCanvas.height = OCCUPANCY_SIZE;
  const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
  if (!sampleContext) return [];

  try {
    sampleContext.drawImage(image, 0, 0, OCCUPANCY_SIZE, OCCUPANCY_SIZE);
    const pixels = sampleContext.getImageData(0, 0, OCCUPANCY_SIZE, OCCUPANCY_SIZE).data;
    const cells: OccupiedCell[] = [];
    for (let y = 0; y < OCCUPANCY_SIZE; y += 1) {
      for (let x = 0; x < OCCUPANCY_SIZE; x += 1) {
        const alpha = pixels[(y * OCCUPANCY_SIZE + x) * 4 + 3] / 255;
        if (alpha < 0.07) continue;
        const key = y * OCCUPANCY_SIZE + x;
        cells.push({
          x: (x + 0.5) / OCCUPANCY_SIZE,
          y: (y + 0.5) / OCCUPANCY_SIZE,
          weight: alpha,
          key,
        });
      }
    }
    cellCache.set(image, cells);
    return cells;
  } catch {
    return [];
  }
}

function getPersonLayout(
  image: HTMLImageElement,
  draft: DeviationDraft,
  width: number,
  height: number,
): PersonLayout {
  const frameWidth = width * 0.82;
  const frameHeight = height * 0.72;
  const scale = Math.min(frameWidth / image.naturalWidth, frameHeight / image.naturalHeight) * draft.crop.zoom;
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  return {
    x: (width - drawWidth) / 2 + draft.crop.x * Math.max(0, drawWidth - frameWidth) / 2,
    y: (height - drawHeight) / 2 + draft.crop.y * Math.max(0, drawHeight - frameHeight) / 2 - height * 0.015,
    width: drawWidth,
    height: drawHeight,
    scale,
  };
}

function getBlockKinds(count: number, size: DeviationDraft['animation']['blockSize']): BlockKind[] {
  const kinds: BlockKind[] = [];
  const smallCount = count >= 10 ? Math.floor(count * 0.08) : 0;
  const mediumCount = size === 'LARGE'
    ? Math.max(1, Math.floor(count * 0.28))
    : size === 'MEDIUM'
      ? Math.max(1, Math.floor(count * 0.58))
      : Math.max(1, Math.floor(count * 0.72));
  const largeCount = Math.max(1, count - smallCount - mediumCount);
  for (let index = 0; index < largeCount; index += 1) kinds.push('large');
  for (let index = 0; index < mediumCount; index += 1) kinds.push('medium');
  for (let index = 0; index < smallCount; index += 1) kinds.push('small');
  while (kinds.length < count) kinds.push('medium');
  return kinds.slice(0, count);
}

function getBlockSizes(kind: BlockKind, size: DeviationDraft['animation']['blockSize']) {
  const scale = size === 'LARGE' ? 1 : size === 'MEDIUM' ? 0.82 : 0.64;
  const source = kind === 'large'
    ? [[0.34, 0.5], [0.42, 0.42], [0.5, 0.36], [0.62, 0.28], [0.74, 0.2], [0.46, 0.48]]
    : kind === 'medium'
      ? [[0.15, 0.18], [0.22, 0.26], [0.3, 0.28], [0.35, 0.23]]
      : [[0.06, 0.06], [0.09, 0.1], [0.13, 0.11]];
  return source.map(([width, height]) => [width * scale, height * scale] as const);
}

function contains(rect: NormalizedRect, x: number, y: number) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function measureCoverage(cells: OccupiedCell[], rects: NormalizedRect[]) {
  const totalWeight = cells.reduce((sum, cell) => sum + cell.weight, 0);
  if (!totalWeight) return 0;
  let visibleWeight = 0;
  for (const cell of cells) {
    for (const rect of rects) {
      if (!contains(rect, cell.x, cell.y)) continue;
      visibleWeight += cell.weight;
      break;
    }
  }
  return visibleWeight / totalWeight;
}

function findBestRectangle(
  kind: BlockKind,
  size: DeviationDraft['animation']['blockSize'],
  cells: OccupiedCell[],
  coveredKeys: Set<number>,
  seed: number,
  index: number,
) {
  const sizes = getBlockSizes(kind, size);
  let best: NormalizedRect | null = null;
  let bestGain = -1;
  let candidateIndex = 0;

  for (const [blockWidth, blockHeight] of sizes) {
    for (let y = 0; y <= 1 - blockHeight; y += 0.09) {
      for (let x = 0; x <= 1 - blockWidth; x += 0.09) {
        const jitterX = (randomFor(seed, index, candidateIndex, 1) - 0.5) * 0.035;
        const jitterY = (randomFor(seed, index, candidateIndex, 2) - 0.5) * 0.035;
        const candidate = {
          x: clamp(x + jitterX, 0, 1 - blockWidth),
          y: clamp(y + jitterY, 0, 1 - blockHeight),
          width: blockWidth,
          height: blockHeight,
          kind,
        };
        let gain = 0;
        for (const cell of cells) {
          if (!coveredKeys.has(cell.key) && contains(candidate, cell.x, cell.y)) gain += cell.weight;
        }
        const tieBreak = randomFor(seed, index, candidateIndex, 3) * 0.01;
        if (gain + tieBreak > bestGain) {
          bestGain = gain + tieBreak;
          best = candidate;
        }
        candidateIndex += 1;
      }
    }
  }
  return best;
}

function addCoveredCells(rect: NormalizedRect, cells: OccupiedCell[], coveredKeys: Set<number>) {
  for (const cell of cells) if (contains(rect, cell.x, cell.y)) coveredKeys.add(cell.key);
}

function scaleBlocksToCoverage(blocks: ActiveBlock[], cells: OccupiedCell[], target: number) {
  let low = 0.35;
  let high = 1;
  let best = blocks;
  let bestDifference = Math.abs(measureCoverage(cells, blocks) - target);
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const scale = (low + high) / 2;
    const scaled = blocks.map((block) => {
      const nextWidth = block.width * scale;
      const nextHeight = block.height * scale;
      return {
        ...block,
        x: clamp(block.x + block.width / 2 - nextWidth / 2, 0, 1 - nextWidth),
        y: clamp(block.y + block.height / 2 - nextHeight / 2, 0, 1 - nextHeight),
        width: nextWidth,
        height: nextHeight,
      };
    });
    const coverage = measureCoverage(cells, scaled);
    const difference = Math.abs(coverage - target);
    if (difference < bestDifference) {
      best = scaled;
      bestDifference = difference;
    }
    if (coverage > target) high = scale;
    else low = scale;
  }
  return best;
}

function getMaskPlan(image: HTMLImageElement, draft: DeviationDraft, seed: number, cells: OccupiedCell[]) {
  const cache = planCache.get(image) ?? new Map<string, NormalizedRect[]>();
  planCache.set(image, cache);
  const key = [
    draft.animation.blockCount,
    draft.animation.blockSize,
    draft.animation.revealDensity,
  ].join(':');
  const cached = cache.get(key);
  if (cached) return cached;

  const desiredCount = clamp(Math.round(draft.animation.blockCount), 4, MAX_BLOCKS);
  const kinds = getBlockKinds(desiredCount, draft.animation.blockSize);
  const revealTarget = clamp(0.38 + draft.animation.revealDensity / 100 * 0.46, 0.52, 0.82);
  const blocks: NormalizedRect[] = [];
  const coveredKeys = new Set<number>();
  const appendBlock = (kind: BlockKind, index: number) => {
    const block = findBestRectangle(kind, draft.animation.blockSize, cells, coveredKeys, seed, index);
    if (!block) return false;
    blocks.push(block);
    addCoveredCells(block, cells, coveredKeys);
    return true;
  };

  for (let index = 0; index < kinds.length; index += 1) appendBlock(kinds[index], index);
  while (
    cells.length &&
    blocks.length < MAX_BLOCKS &&
    measureCoverage(cells, blocks) < revealTarget
  ) {
    appendBlock(blocks.length % 4 === 3 ? 'medium' : 'large', blocks.length);
  }

  cache.set(key, blocks);
  return blocks;
}

function getAnimatedBlocks(
  plan: NormalizedRect[],
  cells: OccupiedCell[],
  draft: DeviationDraft,
  seed: number,
  loopTime: number,
  duration: number,
): ActiveBlock[] {
  const flickerSpeed = draft.animation.flickerSpeed;
  const eventCount = Math.max(1, Math.round(duration * flickerSpeed));
  const frameTick = Math.floor(loopTime * flickerSpeed);
  const stableTick = frameTick >= eventCount - 1 ? 0 : frameTick;
  const displacement = draft.animation.fragmentDisplacement / 100;
  const initialHold = loopTime < 0.06;

  const blocks: Array<ActiveBlock & { visible: boolean }> = plan.map((base, index) => {
    const phase = Math.floor(randomFor(seed, index, 0, 4) * eventCount);
    const eventTick = (stableTick + phase) % eventCount;
    const xJitter = (randomFor(seed, index, eventTick, 5) - 0.5) * displacement * 0.08;
    const yJitter = (randomFor(seed, index, eventTick, 6) - 0.5) * displacement * 0.065;
    const sizeJitter = 1 + (randomFor(seed, index, eventTick, 7) - 0.5) * displacement * 0.2;
    const rect: NormalizedRect = {
      ...base,
      x: clamp(base.x + xJitter, 0, 1 - base.width * sizeJitter),
      y: clamp(base.y + yJitter, 0, 1 - base.height * sizeJitter),
      width: Math.min(1, base.width * sizeJitter),
      height: Math.min(1, base.height * sizeJitter),
    };
    const alwaysAnchor = index < 2;
    const visible = initialHold || alwaysAnchor || randomFor(seed, index, eventTick, 8) > 0.34;
    return {
      ...rect,
      alpha: 0.82 + randomFor(seed, index, eventTick, 9) * 0.18,
      index,
      tick: eventTick,
      kind: base.kind,
      visible,
    };
  });

  const target = clamp(0.38 + draft.animation.revealDensity / 100 * 0.46, 0.52, 0.82);
  const minimum = initialHold ? Math.min(0.65, target) : Math.max(0.5, target - 0.13);
  const maximum = Math.min(0.85, target + 0.08);
  const visible = blocks.filter((block) => block.visible);
  let coverage = measureCoverage(cells, visible);

  const minBlocks = Math.min(4, blocks.length);
  while (visible.length < minBlocks || coverage < target - 0.012) {
    const hidden = blocks.filter((block) => !visible.includes(block));
    if (!hidden.length) break;
    hidden.sort((left, right) =>
      measureCoverage(cells, [...visible, right]) - coverage -
      (measureCoverage(cells, [...visible, left]) - coverage),
    );
    visible.push(hidden[0]);
    coverage = measureCoverage(cells, visible);
  }

  while (coverage > target + 0.025 && visible.length > minBlocks) {
    const removable = visible
      .filter((block) => block.index >= 2)
      .map((block) => ({
        block,
        loss: coverage - measureCoverage(cells, visible.filter((candidate) => candidate !== block)),
      }))
      .sort((left, right) => left.loss - right.loss);
    const candidate = removable[0]?.block;
    if (!candidate) break;
    const next = visible.filter((block) => block !== candidate);
    const nextCoverage = measureCoverage(cells, next);
    if (nextCoverage < minimum) break;
    visible.splice(visible.indexOf(candidate), 1);
    coverage = nextCoverage;
  }

  if (coverage > maximum && visible.length) {
    const fitted = scaleBlocksToCoverage(visible, cells, target);
    visible.splice(0, visible.length, ...fitted.map((block) => ({ ...block, visible: true })));
    coverage = measureCoverage(cells, visible);
  }
  if (coverage < minimum && visible.length < blocks.length) {
    const hidden = blocks.filter((block) => !visible.includes(block));
    hidden.sort((left, right) =>
      measureCoverage(cells, [...visible, right]) - coverage -
      (measureCoverage(cells, [...visible, left]) - coverage),
    );
    for (const block of hidden) {
      visible.push(block);
      coverage = measureCoverage(cells, visible);
      if (coverage >= minimum) break;
    }
  }
  if (coverage > maximum && visible.length) {
    const fitted = scaleBlocksToCoverage(visible, cells, target);
    visible.splice(0, visible.length, ...fitted.map((block) => ({ ...block, visible: true })));
  }

  return visible;
}

function rectangleDistance(x: number, y: number, rect: NormalizedRect) {
  const dx = x < rect.x ? rect.x - x : x > rect.x + rect.width ? x - rect.x - rect.width : 0;
  const dy = y < rect.y ? rect.y - y : y > rect.y + rect.height ? y - rect.y - rect.height : 0;
  if (dx || dy) return Math.hypot(dx, dy);
  return Math.min(x - rect.x, rect.x + rect.width - x, y - rect.y, rect.y + rect.height - y);
}

function distanceToBlocks(
  x: number,
  y: number,
  blocks: ActiveBlock[],
  layout: PersonLayout,
  width: number,
  height: number,
) {
  const localX = (x * width - layout.x) / Math.max(1, layout.width);
  const localY = (y * height - layout.y) / Math.max(1, layout.height);
  let distance = 1;
  for (const block of blocks) distance = Math.min(distance, rectangleDistance(localX, localY, block));
  return distance;
}

function drawParticleBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  layout: PersonLayout,
  blocks: ActiveBlock[],
  draft: DeviationDraft,
  seed: number,
  loopTime: number,
  duration: number,
) {
  const density = clamp(draft.animation.particleDensity / 100);
  const glow = clamp(draft.animation.particleGlow / 100);
  const motion = clamp(draft.animation.particleMotion / 100);
  const count = Math.round(PARTICLE_CAPACITY * density);
  const loopPhase = loopTime / duration * Math.PI * 2;
  const palette = PALETTES[draft.visualMode];
  const sizeScale = width / 720;
  const buckets: Array<Array<{ x: number; y: number; size: number }>> = [[], [], [], []];

  for (let index = 0; index < count; index += 1) {
    const xBase = randomFor(seed, index, 0, 31);
    const yBase = randomFor(seed, index, 0, 32);
    const phase = randomFor(seed, index, 0, 33) * Math.PI * 2;
    const orbit = 0.55 + randomFor(seed, index, 0, 34) * 1.8;
    const x = xBase + Math.sin(loopPhase * orbit + phase) * motion * 0.018;
    const y = yBase + Math.cos(loopPhase * orbit + phase * 0.73) * motion * 0.018;
    const edgeDistance = distanceToBlocks(x, y, blocks, layout, width, height);
    const edgeBoost = edgeDistance < 0.045 ? (0.045 - edgeDistance) * 5 : 0;
    const alpha = clamp(0.12 + glow * 0.29 + edgeBoost, 0.06, 0.68);
    const size = Math.max(1, draft.animation.particleSize * sizeScale * (0.35 + randomFor(seed, index, 0, 35) * 0.75));
    buckets[Math.min(3, Math.floor(alpha * 4))].push({ x: x * width, y: y * height, size });
  }
  context.save();
  context.globalCompositeOperation = 'screen';
  context.fillStyle = palette.accent;
  context.shadowColor = palette.accent;
  context.shadowBlur = width * 0.009 * glow;
  const alphas = [0.22, 0.34, 0.48, 0.62];
  for (let bucket = 0; bucket < buckets.length; bucket += 1) {
    if (!buckets[bucket].length) continue;
    context.globalAlpha = alphas[bucket];
    context.beginPath();
    for (const particle of buckets[bucket]) context.rect(particle.x, particle.y, particle.size, particle.size);
    context.fill();
  }
  context.shadowBlur = 0;
  context.globalAlpha = 0.28;
  context.beginPath();
  for (const bucket of buckets) {
    for (const particle of bucket) {
      const core = Math.max(1, particle.size * 0.38);
      context.rect(particle.x, particle.y, core, core);
    }
  }
  context.fill();
  context.restore();
}

function drawSilhouetteParticles(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  layout: PersonLayout,
  cells: OccupiedCell[],
  blocks: ActiveBlock[],
  draft: DeviationDraft,
  seed: number,
  loopTime: number,
  duration: number,
) {
  if (!cells.length) return;
  const density = clamp(draft.animation.particleDensity / 100);
  const glow = clamp(draft.animation.particleGlow / 100);
  const motion = clamp(draft.animation.particleMotion / 100);
  const count = Math.round(96 * density);
  const loopPhase = loopTime / duration * Math.PI * 2;
  const palette = PALETTES[draft.visualMode];
  const sizeScale = width / 720;
  const buckets: Array<Array<{ x: number; y: number; size: number }>> = [[], [], []];

  for (let index = 0; index < count; index += 1) {
    const cell = cells[Math.floor(randomFor(seed, index, 0, 41) * cells.length)];
    const phase = randomFor(seed, index, 0, 42) * Math.PI * 2;
    const x = cell.x + Math.sin(loopPhase + phase) * motion * 0.009;
    const y = cell.y + Math.cos(loopPhase * 1.15 + phase) * motion * 0.009;
    const globalX = (layout.x + x * layout.width) / width;
    const globalY = (layout.y + y * layout.height) / height;
    const edgeDistance = distanceToBlocks(globalX, globalY, blocks, layout, width, height);
    const interaction = edgeDistance < 0.035 ? 0.2 : 0;
    const size = Math.max(1, draft.animation.particleSize * sizeScale * (0.38 + randomFor(seed, index, 0, 43) * 0.5));
    const alpha = clamp(0.045 + glow * 0.14 + interaction, 0.03, 0.38);
    buckets[Math.min(2, Math.floor(alpha * 8))].push({
      x: layout.x + x * layout.width,
      y: layout.y + y * layout.height,
      size,
    });
  }
  context.save();
  context.globalCompositeOperation = 'screen';
  context.fillStyle = palette.secondary;
  context.shadowColor = palette.accent;
  context.shadowBlur = width * 0.006 * glow;
  const alphas = [0.1, 0.2, 0.32];
  for (let bucket = 0; bucket < buckets.length; bucket += 1) {
    if (!buckets[bucket].length) continue;
    context.globalAlpha = alphas[bucket];
    context.beginPath();
    for (const particle of buckets[bucket]) context.rect(particle.x, particle.y, particle.size, particle.size);
    context.fill();
  }
  context.restore();
}

function drawMaskedBlock(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  layout: PersonLayout,
  block: ActiveBlock,
  draft: DeviationDraft,
  seed: number,
  width: number,
) {
  const targetX = layout.x + block.x * layout.width;
  const targetY = layout.y + block.y * layout.height;
  const targetWidth = block.width * layout.width;
  const targetHeight = block.height * layout.height;
  const glitch = clamp((draft.animation.glitchIntensity + draft.animation.rgbSplit * 0.4) / 120);
  const sourceDrift = draft.animation.fragmentDisplacement / 100 * 0.055;
  const sourceXNorm = clamp(block.x + (randomFor(seed, block.index, block.tick, 51) - 0.5) * sourceDrift, 0, 1 - block.width);
  const sourceYNorm = clamp(block.y + (randomFor(seed, block.index, block.tick, 52) - 0.5) * sourceDrift, 0, 1 - block.height);
  const sourceX = sourceXNorm * image.naturalWidth;
  const sourceY = sourceYNorm * image.naturalHeight;
  const sourceWidth = Math.min(image.naturalWidth - sourceX, block.width * image.naturalWidth);
  const sourceHeight = Math.min(image.naturalHeight - sourceY, block.height * image.naturalHeight);
  const palette = PALETTES[draft.visualMode];
  const offset = width * (0.001 + glitch * 0.012);
  const filter = draft.visualMode === 'MONO'
    ? 'grayscale(1) contrast(1.2) brightness(1.04)'
    : `grayscale(${0.16 + glitch * 0.12}) contrast(${1.14 + glitch * 0.22}) brightness(1.04) saturate(.92)`;

  context.save();
  context.beginPath();
  context.rect(targetX, targetY, targetWidth, targetHeight);
  context.clip();
  context.globalCompositeOperation = 'screen';
  context.imageSmoothingEnabled = block.kind !== 'small';
  if (glitch > 0.01) {
    context.globalAlpha = block.alpha * glitch * 0.24;
    context.filter = 'grayscale(1) sepia(1) saturate(6) hue-rotate(150deg) brightness(1.35)';
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, targetX - offset, targetY, targetWidth, targetHeight);
    context.filter = 'grayscale(1) sepia(1) saturate(5) hue-rotate(260deg) brightness(1.26)';
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, targetX + offset, targetY + offset * 0.14, targetWidth, targetHeight);
  }
  context.globalAlpha = block.alpha;
  context.filter = filter;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, targetX, targetY, targetWidth, targetHeight);

  const flashChance = draft.animation.flashIntensity / 100 * glitch * 0.12;
  if (randomFor(seed, block.index, block.tick, 53) < flashChance) {
    context.globalAlpha = 0.08 + draft.animation.flashIntensity / 100 * 0.2;
    context.filter = 'none';
    context.fillStyle = palette.accent;
    context.fillRect(targetX, targetY, targetWidth, targetHeight);
  }
  context.restore();
}

function drawCardHud(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  draft: DeviationDraft,
) {
  const { accent, secondary } = PALETTES[draft.visualMode];
  const marginX = width * 0.055;
  const labelSize = Math.max(9, Math.round(width * 0.018));
  const nameSize = Math.max(18, Math.round(width * 0.037));
  const mono = '"IBM Plex Mono", "Source Code Pro", monospace';
  const name = (draft.cardName.trim() || 'SUBJECT').slice(0, 40);
  const id = (draft.subjectId.trim() || 'PENDING').slice(0, 30);
  const selfDefinition = draft.selfDefinition.trim().replace(/\s+/g, ' ').slice(0, 64);
  const top = height * 0.045;
  const footer = height * 0.835;

  context.save();
  context.globalCompositeOperation = 'screen';
  context.lineWidth = Math.max(1, width / 900);
  context.strokeStyle = `${accent}85`;
  context.fillStyle = secondary;
  context.beginPath();
  const corner = width * 0.045;
  context.moveTo(marginX, top + corner);
  context.lineTo(marginX, top);
  context.lineTo(marginX + corner, top);
  context.moveTo(width - marginX - corner, top);
  context.lineTo(width - marginX, top);
  context.lineTo(width - marginX, top + corner);
  context.moveTo(marginX, height * 0.965 - corner);
  context.lineTo(marginX, height * 0.965);
  context.lineTo(marginX + corner, height * 0.965);
  context.moveTo(width - marginX - corner, height * 0.965);
  context.lineTo(width - marginX, height * 0.965);
  context.lineTo(width - marginX, height * 0.965 - corner);
  context.stroke();

  context.globalAlpha = 0.72;
  context.font = `500 ${labelSize}px ${mono}`;
  context.textAlign = 'left';
  context.fillText('DEVIATION ID  /  SUBJECT RECORD', marginX + 2, top + labelSize + 3);
  context.textAlign = 'right';
  context.fillText(`LOOP  ${draft.animation.durationSeconds.toString().padStart(2, '0')} SEC`, width - marginX - 2, top + labelSize + 3);

  context.globalAlpha = 0.88;
  context.strokeStyle = `${accent}70`;
  context.beginPath();
  context.moveTo(marginX, footer);
  context.lineTo(width - marginX, footer);
  context.stroke();

  context.textAlign = 'left';
  context.font = `600 ${nameSize}px ${mono}`;
  context.fillStyle = '#f2fffd';
  context.fillText(name.toUpperCase(), marginX + 2, footer + nameSize * 1.35, width - marginX * 2);
  context.font = `500 ${labelSize}px ${mono}`;
  context.fillStyle = accent;
  context.fillText(`USER ID  ${id}`, marginX + 2, footer + nameSize * 2.05, width * 0.64);
  context.textAlign = 'right';
  context.fillText(`DEVIATION  ${draft.deviationLevel.toString().padStart(2, '0')}`, width - marginX - 2, footer + nameSize * 2.05);

  context.globalAlpha = 0.65;
  context.textAlign = 'left';
  context.fillStyle = secondary;
  if (selfDefinition) context.fillText(selfDefinition.toUpperCase(), marginX + 2, footer + nameSize * 2.85, width - marginX * 2);
  context.restore();
}

/**
 * Renders a loopable, alpha-mask-driven portrait. Preview and video export
 * share this seeded five-second timeline and the same person-mask coverage.
 */
export function renderPersonFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  draft: DeviationDraft,
  image: HTMLImageElement | null,
  seconds: number,
) {
  const renderStart = performance.now();
  const duration = Math.max(1, draft.animation.durationSeconds);
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const loopTime = ((safeSeconds % duration) + duration) % duration;
  const loopPhase = loopTime / duration * Math.PI * 2;
  const palette = PALETTES[draft.visualMode];
  const seed = hashSeed(`${draft.subjectId.trim()}|${draft.cardName}|DEVIATION`);

  context.save();
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#020507';
  context.fillRect(0, 0, width, height);
  const pulse = 0.025 + (Math.sin(loopPhase - Math.PI / 2) + 1) * 0.012;
  const backgroundGlow = context.createRadialGradient(
    width * 0.5,
    height * 0.49,
    width * 0.025,
    width * 0.5,
    height * 0.49,
    width * 0.72,
  );
  backgroundGlow.addColorStop(0, `rgba(15, 92, 104, ${pulse})`);
  backgroundGlow.addColorStop(0.62, 'rgba(4, 38, 47, .075)');
  backgroundGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = backgroundGlow;
  context.fillRect(0, 0, width, height);

  let visibleArea = 0;
  let visibleBlockCount = 0;
  if (image?.naturalWidth && image.naturalHeight) {
    const cells = getOccupiedCells(image);
    const layout = getPersonLayout(image, draft, width, height);
    const plan = getMaskPlan(image, draft, seed, cells);
    const blocks = getAnimatedBlocks(plan, cells, draft, seed, loopTime, duration);
    visibleArea = measureCoverage(cells, blocks);
    visibleBlockCount = blocks.length;

    drawParticleBackground(context, width, height, layout, blocks, draft, seed, loopTime, duration);
    for (const block of blocks) drawMaskedBlock(context, image, layout, block, draft, seed, width);
    drawSilhouetteParticles(context, width, height, layout, cells, blocks, draft, seed, loopTime, duration);
  } else {
    const emptyLayout: PersonLayout = { x: 0, y: 0, width, height, scale: 1 };
    drawParticleBackground(context, width, height, emptyLayout, [], draft, seed, loopTime, duration);
  }

  drawCardHud(context, width, height, draft);
  const canvas = context.canvas as HTMLCanvasElement;
  if (canvas.dataset) {
    canvas.dataset.personCoverage = (visibleArea * 100).toFixed(1);
    canvas.dataset.loopTime = loopTime.toFixed(2);
    canvas.dataset.activeBlocks = String(visibleBlockCount);
    canvas.dataset.renderTimeMs = (performance.now() - renderStart).toFixed(1);
  }
  context.restore();
  return visibleArea;
}
