import * as tf from '@tensorflow/tfjs';
import { load, type BodyPix } from '@tensorflow-models/body-pix';

export type CpuPersonRequest = {
  id: number;
  width: number;
  height: number;
  pixels: ArrayBuffer;
};

export type CpuPersonResponse =
  | { id: number; width: number; height: number; values: Float32Array }
  | { id: number; error: string };

let modelPromise: Promise<BodyPix> | null = null;

async function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      // This module runs in its own worker, never changing the live detector's backend.
      await tf.setBackend('cpu');
      await tf.ready();
      return load({
        architecture: 'MobileNetV1',
        outputStride: 16,
        // Higher feature capacity helps retain small, lower-contrast people.
        multiplier: 0.75,
        quantBytes: 2,
      });
    })().catch((error: unknown) => {
      modelPromise = null;
      throw error;
    });
  }
  return modelPromise;
}

/** Local, genuinely WebGL-free inference. Only model weights are downloaded. */
export async function segmentRgbaOnCpu(pixels: ArrayBuffer, width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height)
      || width < 1 || height < 1 || width > 512 || height > 512
      || pixels.byteLength !== width * height * 4) {
    throw new Error('The CPU person segmentation input is invalid.');
  }
  const model = await getModel();
  const rgba = new Uint8Array(pixels);
  const rgb = new Int32Array(width * height * 3);
  for (let index = 0; index < width * height; index += 1) {
    rgb[index * 3] = rgba[index * 4];
    rgb[index * 3 + 1] = rgba[index * 4 + 1];
    rgb[index * 3 + 2] = rgba[index * 4 + 2];
  }
  // A Tensor input avoids browser.fromPixels and every Canvas/WebGL input path.
  const input = tf.tensor3d(rgb, [height, width, 3], 'int32');
  try {
    const result = await model.segmentPerson(input, {
      internalResolution: 'high',
      // BodyPix returns a binary mask here. A lower activation cutoff avoids
      // erasing low-contrast parts of the subject before edge softening.
      segmentationThreshold: 0.3,
      maxDetections: 3,
    });
    return {
      width: result.width,
      height: result.height,
      values: Float32Array.from(result.data),
    };
  } finally {
    input.dispose();
  }
}
