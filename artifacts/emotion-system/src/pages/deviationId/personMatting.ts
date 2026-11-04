import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

const TASKS_VISION_VERSION = '1.2.0';
const WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const PERSON_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite';
const MAX_INFERENCE_EDGE = 960;
const MAX_OUTPUT_EDGE = 2048;

let segmenter: ImageSegmenter | null = null;
let segmenterPromise: Promise<ImageSegmenter> | null = null;
let segmenterGeneration = 0;

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const amount = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return amount * amount * (3 - 2 * amount);
}

async function getSegmenter() {
  if (segmenter) return segmenter;
  if (segmenterPromise) return segmenterPromise;
  const generation = segmenterGeneration;
  const pending = (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
    const canvas = document.createElement('canvas');
    const created = await ImageSegmenter.createFromOptions(vision, {
      canvas,
      baseOptions: { modelAssetPath: PERSON_MODEL_URL, delegate: 'CPU' },
      runningMode: 'IMAGE',
      outputCategoryMask: true,
      outputConfidenceMasks: true,
    });
    if (generation !== segmenterGeneration) {
      created.close();
      throw new Error('The person segmentation model was released.');
    }
    segmenter = created;
    return created;
  })();
  segmenterPromise = pending;
  try {
    return await pending;
  } catch (error) {
    if (segmenterPromise === pending) segmenterPromise = null;
    throw error;
  }
}

type DecodedPhoto = {
  source: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
  dispose: () => void;
};

async function decodePhoto(blob: Blob): Promise<DecodedPhoto> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close(),
      };
    } catch {
      // Older Safari builds can expose createImageBitmap without decoding every image type.
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('This browser cannot decode the selected photo for local person segmentation.'));
      element.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/**
 * Uses MediaPipe's local selfie/person segmentation model to create a transparent PNG.
 * Only the model files are fetched; the user's photo remains in the browser.
 */
export async function removePersonBackground(photo: Blob): Promise<Blob> {
  const decoded = await decodePhoto(photo);
  try {
    const outputScale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(decoded.width, decoded.height));
    const outputWidth = Math.max(1, Math.round(decoded.width * outputScale));
    const outputHeight = Math.max(1, Math.round(decoded.height * outputScale));
    const inferenceScale = Math.min(1, MAX_INFERENCE_EDGE / Math.max(outputWidth, outputHeight));
    const inferenceWidth = Math.max(1, Math.round(outputWidth * inferenceScale));
    const inferenceHeight = Math.max(1, Math.round(outputHeight * inferenceScale));
    const inputCanvas = makeCanvas(inferenceWidth, inferenceHeight);
    const inputContext = inputCanvas.getContext('2d', { willReadFrequently: true });
    if (!inputContext) throw new Error('This browser could not prepare the person segmentation image.');
    inputContext.drawImage(decoded.source, 0, 0, inferenceWidth, inferenceHeight);

    const model = await getSegmenter();
    const result = model.segment(inputCanvas);
    try {
      const labels = model.getLabels().map((label) => label.trim().toLowerCase());
      const personIndexFromLabels = labels.findIndex((label) => label === 'person' || label.includes('person'));
      const personIndex = personIndexFromLabels >= 0
        ? personIndexFromLabels
        : Math.max(0, (result.confidenceMasks?.length ?? 1) - 1);
      const confidenceMask = result.confidenceMasks?.[personIndex];
      const categoryMask = result.categoryMask;
      const mask = confidenceMask ?? categoryMask;
      if (!mask) {
        throw new Error(`The person segmentation model returned no usable mask (confidence masks: ${result.confidenceMasks?.length ?? 0}, category mask: ${Boolean(categoryMask)}).`);
      }

      const maskValues = mask.hasFloat32Array()
        ? mask.getAsFloat32Array()
        : mask.hasWebGLTexture()
          ? mask.getAsFloat32Array()
          : mask.hasUint8Array()
            ? mask.getAsUint8Array()
            : null;
      const values = maskValues && confidenceMask === mask
        ? maskValues instanceof Uint8Array
          ? Float32Array.from(maskValues, (value) => value / 255)
          : maskValues
        : maskValues
          ? Float32Array.from(maskValues, (value) => Number(value) === personIndex ? 1 : 0)
          : null;
      if (!values) throw new Error('The person segmentation model returned no usable person mask.');
      const maskWidth = mask.width;
      const maskHeight = mask.height;
      if (!maskWidth || !maskHeight || values.length !== maskWidth * maskHeight) {
        throw new Error('The person segmentation model returned an invalid person mask.');
      }

      let foreground = 0;
      let maskLeft = maskWidth;
      let maskTop = maskHeight;
      let maskRight = -1;
      let maskBottom = -1;
      const alphaPixels = new Uint8ClampedArray(values.length * 4);
      for (let index = 0; index < values.length; index += 1) {
        const confidence = Math.max(0, Math.min(1, values[index]));
        if (confidence >= 0.4) foreground += 1;
        if (confidence > 0.24) {
          const x = index % maskWidth;
          const y = Math.floor(index / maskWidth);
          if (x < maskLeft) maskLeft = x;
          if (x > maskRight) maskRight = x;
          if (y < maskTop) maskTop = y;
          if (y > maskBottom) maskBottom = y;
        }
        const alpha = Math.round(smoothstep(0.27, 0.68, confidence) * 255);
        const offset = index * 4;
        alphaPixels[offset] = 255;
        alphaPixels[offset + 1] = 255;
        alphaPixels[offset + 2] = 255;
        alphaPixels[offset + 3] = alpha;
      }

      const personRatio = foreground / values.length;
      if (import.meta.env.DEV) {
        console.debug('[person-segmentation] mask result', {
          labels,
          confidenceMaskCount: result.confidenceMasks?.length ?? 0,
          hasCategoryMask: Boolean(categoryMask),
          maskWidth,
          maskHeight,
          personRatio,
        });
      }
      if (personRatio < 0.0005 || personRatio > 0.998) {
        throw new Error('No clear person was found. Choose a photo with one visible person and a distinct background.');
      }

      const maskCanvas = makeCanvas(maskWidth, maskHeight);
      const maskContext = maskCanvas.getContext('2d');
      if (!maskContext) throw new Error('This browser could not apply the person mask.');
      maskContext.putImageData(new ImageData(alphaPixels, maskWidth, maskHeight), 0, 0);

      const cutoutCanvas = makeCanvas(outputWidth, outputHeight);
      const cutoutContext = cutoutCanvas.getContext('2d');
      if (!cutoutContext) throw new Error('This browser could not create the transparent person image.');
      cutoutContext.drawImage(decoded.source, 0, 0, outputWidth, outputHeight);
      cutoutContext.globalCompositeOperation = 'destination-in';
      cutoutContext.imageSmoothingEnabled = true;
      cutoutContext.filter = `blur(${Math.max(0.7, outputScale * 1.25)}px)`;
      cutoutContext.drawImage(maskCanvas, 0, 0, outputWidth, outputHeight);
      cutoutContext.filter = 'none';
      cutoutContext.globalCompositeOperation = 'source-over';

      if (maskRight < maskLeft || maskBottom < maskTop) {
        throw new Error('The person segmentation model returned no visible person pixels.');
      }
      const left = Math.floor(maskLeft / maskWidth * outputWidth);
      const top = Math.floor(maskTop / maskHeight * outputHeight);
      const right = Math.ceil((maskRight + 1) / maskWidth * outputWidth) - 1;
      const bottom = Math.ceil((maskBottom + 1) / maskHeight * outputHeight) - 1;
      const personWidth = right - left + 1;
      const personHeight = bottom - top + 1;
      const padding = Math.round(Math.max(personWidth, personHeight) * 0.055);
      const cropX = Math.max(0, left - padding);
      const cropY = Math.max(0, top - padding);
      const cropWidth = Math.min(outputWidth - cropX, personWidth + padding * 2);
      const cropHeight = Math.min(outputHeight - cropY, personHeight + padding * 2);
      const croppedCanvas = makeCanvas(cropWidth, cropHeight);
      const croppedContext = croppedCanvas.getContext('2d');
      if (!croppedContext) throw new Error('This browser could not crop the isolated person image.');
      croppedContext.drawImage(cutoutCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

      const cutoutBlob = await new Promise<Blob>((resolve, reject) => {
        croppedCanvas.toBlob((blob) => blob
          ? resolve(blob)
          : reject(new Error('The transparent person image could not be created.')), 'image/png');
      });
      return cutoutBlob;
    } finally {
      result.confidenceMasks?.forEach((maskItem) => maskItem.close());
      result.categoryMask?.close();
    }
  } finally {
    decoded.dispose();
  }
}

export function disposePersonSegmenter() {
  segmenterGeneration += 1;
  segmenter?.close();
  segmenter = null;
  segmenterPromise = null;
}
