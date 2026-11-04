import { segmentRgbaOnCpu, type CpuPersonRequest, type CpuPersonResponse } from './cpuPersonSegmentation';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<CpuPersonRequest>) => void) | null;
  postMessage: (response: CpuPersonResponse, transfer?: Transferable[]) => void;
};

// Serialize photo requests so that one cached model serves them without overlapping inference.
let queue = Promise.resolve();
scope.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      const result = await segmentRgbaOnCpu(data.pixels, data.width, data.height);
      scope.postMessage({ id: data.id, ...result }, [result.values.buffer as ArrayBuffer]);
    } catch (error) {
      scope.postMessage({
        id: data.id,
        error: error instanceof Error ? error.message : 'Local CPU person segmentation failed.',
      });
    }
  });
};
