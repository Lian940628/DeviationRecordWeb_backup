import type { CpuPersonRequest, CpuPersonResponse } from './cpuPersonSegmentation';

type CpuMask = { values: Float32Array; width: number; height: number };
type Pending = {
  resolve: (mask: CpuMask) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, Pending>();

export function disposeCpuPersonSegmentation(reason = 'The person segmentation model was released.') {
  worker?.terminate();
  worker = null;
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(new Error(reason));
  }
  pending.clear();
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./personSegmentation.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<CpuPersonResponse>) => {
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      clearTimeout(request.timer);
      if ('error' in data) request.reject(new Error(data.error));
      else request.resolve({ width: data.width, height: data.height, values: data.values });
    };
    worker.onerror = () => {
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error('Local CPU person segmentation failed to start. Please retry the photo.'));
      }
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

export function segmentPhotoOnCpu(source: HTMLCanvasElement): Promise<CpuMask> {
  // Bound CPU work while the final transparent image retains its original output resolution.
  const scale = Math.min(1, 512 / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return Promise.reject(new Error('This browser could not prepare the person segmentation image.'));
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data.buffer as ArrayBuffer;
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    try {
      const target = getWorker();
      const timer = setTimeout(() => {
        // Termination also rejects queued requests and releases all model/tensor resources.
        disposeCpuPersonSegmentation('Local CPU person segmentation timed out. Please retry the photo.');
      }, 120_000);
      pending.set(id, { resolve, reject, timer });
      const request: CpuPersonRequest = { id, width: canvas.width, height: canvas.height, pixels };
      target.postMessage(request, [pixels]);
    } catch (error) {
      const request = pending.get(id);
      if (request) clearTimeout(request.timer);
      pending.delete(id);
      reject(error instanceof Error ? error : new Error('Local CPU person segmentation failed.'));
    }
  });
}
