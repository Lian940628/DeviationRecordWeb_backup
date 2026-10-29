import type { PersonTrack, TimedPersonTracks } from './types';

function blend(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

export function shouldUseAnalyzedPersonTracks(
  hasSamples: boolean,
  isRecording: boolean,
  isPlaying: boolean,
): boolean {
  return hasSamples && (isRecording || !isPlaying);
}

/** Interpolate pre-analysis tracks at playback time without running AI per frame. */
export function samplePersonTracks(samples: TimedPersonTracks[], time: number): PersonTrack[] {
  if (!samples.length) return [];

  let low = 0;
  let high = samples.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((samples[middle]?.time ?? 0) <= time) low = middle + 1;
    else high = middle - 1;
  }

  const leftIndex = Math.max(0, Math.min(samples.length - 1, high));
  const left = samples[leftIndex];
  if (!left) return [];
  const right = samples[Math.min(leftIndex + 1, samples.length - 1)] ?? left;
  if (left === right) return left.tracks.filter((track) => track.visible);

  const amount = Math.max(0, Math.min(1, (time - left.time) / Math.max(0.001, right.time - left.time)));
  const leftById = new Map(left.tracks.map((track) => [track.id, track]));
  const rightById = new Map(right.tracks.map((track) => [track.id, track]));
  const ids = new Set([...leftById.keys(), ...rightById.keys()]);
  const sampled: PersonTrack[] = [];

  for (const id of ids) {
    const from = leftById.get(id);
    const to = rightById.get(id);
    if (!from && !to) continue;
    const source = from ?? to;
    const target = to ?? from;
    if (!source || !target) continue;
    const visible = from?.visible && to?.visible
      ? true
      : from?.visible
        ? amount < 0.85
        : Boolean(to?.visible && amount >= 0.5);
    if (!visible) continue;
    sampled.push({
      id,
      x: blend(source.x, target.x, amount),
      y: blend(source.y, target.y, amount),
      width: blend(source.width, target.width, amount),
      height: blend(source.height, target.height, amount),
      confidence: blend(source.confidence, target.confidence, amount),
      visible: true,
    });
  }

  return sampled;
}
