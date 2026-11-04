import { renderPersonFrame } from './renderPersonFrame';
import type { DeviationDraft } from './types';

export function getPostcardOutputSize(resolution: DeviationDraft['output']['resolution']) {
  return resolution === '1080p'
    ? { width: 1080, height: 1920 }
    : { width: 720, height: 1280 };
}

export function renderPostcardPng(draft: DeviationDraft, image: HTMLImageElement): Promise<Blob> {
  const { width, height } = getPostcardOutputSize(draft.output.resolution);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('The browser could not create the PNG image.'));

  renderPersonFrame(
    context,
    width,
    height,
    draft,
    image,
    draft.animation.durationSeconds * 0.94,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The browser could not create the PNG image.'));
    }, 'image/png');
  });
}
