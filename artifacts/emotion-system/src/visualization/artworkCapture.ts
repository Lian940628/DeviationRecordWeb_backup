export const ARTWORK_CAPTURE_EVENT = 'emotion-system:capture-artwork-frame';

export interface ArtworkCaptureEventDetail {
  copyFrame: (frame: HTMLCanvasElement | null) => void;
}

export function captureArtworkFrame(): HTMLCanvasElement | null {
  let frame: HTMLCanvasElement | null = null;
  const event = new CustomEvent<ArtworkCaptureEventDetail>(ARTWORK_CAPTURE_EVENT, {
    detail: {
      copyFrame: (capturedFrame) => { frame = capturedFrame; },
    },
  });
  window.dispatchEvent(event);
  return frame;
}
