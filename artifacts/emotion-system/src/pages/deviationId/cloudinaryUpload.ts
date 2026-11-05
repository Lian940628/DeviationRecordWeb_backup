import { getOrCreateAnonymousUser } from '../../auth/firebaseAuth';
import { safeUploadMessage, uploadTrace } from './uploadDiagnostics';

export type CloudinaryAssetType = 'image' | 'video';

export interface CloudinaryUploadResult {
  assetId: string;
  publicId: string;
  secureUrl: string;
  resourceType: CloudinaryAssetType;
  format: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  createdAt: string | null;
}

interface UploadSignRequest {
  submissionId: string;
  assetType: CloudinaryAssetType;
  mimeType: string;
  bytes: number;
  publicConsent: true;
}

interface UploadSignature {
  uploadUrl: string;
  apiKey: string;
  params: Record<string, string | number | boolean>;
  signature: string;
  publicId: string;
  resourceType: CloudinaryAssetType;
}

const workerBaseUrl = 'https://deviationvalueweb.wang-elaine628.workers.dev';
const cloudName = 'wqw0n08u';
const uploadPreset = 'deviation_id_upload';
const activeSubmissionStorageKey = 'emotion-system.deviation-id.active-upload.v1';
const directWorker = import.meta.env.VITE_UPLOAD_SIGN_MODE === 'direct'
  || (!import.meta.env.VITE_UPLOAD_SIGN_MODE
    && typeof window !== 'undefined'
    && window.location.hostname.endsWith('github.io'));
const signUrl = directWorker
  ? `${workerBaseUrl}/upload/sign`
  : `${import.meta.env.BASE_URL.replace(/\/+$/, '')}/api/upload/sign`;

export async function withUploadTimeout<T>(operation: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toSignRequest(payload: unknown, expectedAssetType: CloudinaryAssetType): UploadSignature {
  if (!isRecord(payload)) {
    throw new Error('The signing service returned an invalid response.');
  }

  const params = isRecord(payload.params)
    ? payload.params as Record<string, string | number | boolean>
    : null;
  const uploadUrl = payload.uploadUrl;
  const apiKey = payload.apiKey;
  const signature = payload.signature;
  const publicId = payload.publicId;
  const resourceType = payload.resourceType;
  const validResourceType = resourceType === 'image' || resourceType === 'video'
    ? resourceType
    : null;
  const validParams = params && Object.entries(params).every(([key, value]) =>
    key.length > 0
    && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'));
  if (
    typeof uploadUrl !== 'string'
    || typeof apiKey !== 'string'
    || typeof signature !== 'string'
    || !validParams
    || typeof publicId !== 'string'
    || !publicId.trim()
    || validResourceType !== expectedAssetType
  ) {
    throw new Error('The signing service response is missing valid uploadUrl, apiKey, params, signature, publicId, or resourceType.');
  }

  let url: URL;
  try {
    url = new URL(uploadUrl);
  } catch {
    throw new Error('The signing service returned an invalid Cloudinary upload URL.');
  }
  if (
    url.protocol !== 'https:'
    || url.hostname !== 'api.cloudinary.com'
    || !url.pathname.startsWith(`/v1_1/${cloudName}/`)
    || !url.pathname.endsWith(`/${expectedAssetType}/upload`)
  ) {
    throw new Error('The signing service returned an unexpected Cloudinary destination.');
  }
  if (
    typeof params.public_id !== 'string' || params.public_id !== publicId
  ) {
    throw new Error('Worker params must contain a signed public_id matching publicId. No unsigned public_id will be added.');
  }
  if (params.upload_preset !== uploadPreset) {
    throw new Error(`The signing service must sign the "${uploadPreset}" upload preset.`);
  }
  if (typeof params.timestamp !== 'number' && typeof params.timestamp !== 'string') {
    throw new Error('The signing service response is missing the signed timestamp.');
  }

  return {
    uploadUrl,
    apiKey,
    params,
    signature,
    publicId,
    resourceType: validResourceType,
  };
}

async function getSignedUpload(
  request: UploadSignRequest,
  forceRefresh: boolean,
  signal: AbortSignal,
): Promise<UploadSignature> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let token: string;
    try {
      signal.throwIfAborted();
      const user = await withUploadTimeout(getOrCreateAnonymousUser(), 15_000, 'Firebase Auth initialization timed out.');
      signal.throwIfAborted();
      if (!user.isAnonymous) throw new Error('The saved Firebase session is not anonymous.');
      token = await withUploadTimeout(user.getIdToken(forceRefresh || attempt > 0), 15_000, 'Firebase token retrieval timed out.');
      signal.throwIfAborted();
      uploadTrace('TOKEN_OK', { assetType: request.assetType });
    } catch (error) {
      uploadTrace('TOKEN_FAILED', { assetType: request.assetType, message: safeUploadMessage(error) });
      throw error;
    }

    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 20_000);
    let httpStatus: number | undefined;
    try {
      signal.throwIfAborted();
      uploadTrace('SIGN_REQUEST', { assetType: request.assetType, message: `POST ${signUrl}` });
      const response = await fetch(signUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      httpStatus = response.status;
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error(`Signing API returned non-JSON (HTTP ${response.status}). Check the /api/upload/sign route, not the Vite page fallback.`);
      }
      if (!response.ok) {
        const reason = isRecord(payload) && typeof payload.error === 'string' ? safeUploadMessage(payload.error) : 'Request rejected.';
        if (response.status === 401 && attempt === 0 && !forceRefresh) {
          uploadTrace('SIGN_FAILED', { assetType: request.assetType, httpStatus, message: `${reason} Retrying once with a refreshed token.` });
          continue;
        }
        throw new Error(`Signing API HTTP ${response.status}: ${reason}`);
      }
      const signature = toSignRequest(payload, request.assetType);
      uploadTrace('SIGN_OK', { assetType: request.assetType, httpStatus });
      return signature;
    } catch (error) {
      const failure = signal.aborted ? new DOMException('Upload cancelled.', 'AbortError')
        : controller.signal.aborted ? new Error('Signing API timed out after 20 seconds.')
          : error;
      uploadTrace('SIGN_FAILED', { assetType: request.assetType, httpStatus, message: safeUploadMessage(failure) });
      throw failure;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }
  throw new Error('Signing API authorization failed after refreshing the existing token.');
}

function uploadToCloudinary(
  blob: Blob,
  filename: string,
  assetType: CloudinaryAssetType,
  signature: UploadSignature,
  signal: AbortSignal,
  onProgress: (progress: number) => void,
): Promise<CloudinaryUploadResult> {
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('api_key', signature.apiKey);
  form.append('signature', signature.signature);
  for (const [key, value] of Object.entries(signature.params)) {
    if (key === 'api_key' || key === 'signature' || value === undefined || value === null) continue;
    form.append(key, String(value));
  }

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanup = () => signal.removeEventListener('abort', abort);
    request.open('POST', signature.uploadUrl);
    request.responseType = 'json';
    request.timeout = 180_000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      cleanup();
      const payload: unknown = request.response;
      uploadTrace('CLOUDINARY_RESPONSE', { assetType, httpStatus: request.status });
      if (request.status < 200 || request.status >= 300) {
        const errorMessage = isRecord(payload) && isRecord(payload.error)
          && typeof payload.error.message === 'string'
          ? payload.error.message
          : `Cloudinary rejected the ${assetType} upload (HTTP ${request.status}).`;
        const safeError = safeUploadMessage(errorMessage.replaceAll(signature.signature, '[REDACTED SIGNATURE]'));
        reject(new Error(`Cloudinary ${assetType} HTTP ${request.status}: ${safeError}`));
        return;
      }
      if (
        !isRecord(payload)
        || typeof payload.asset_id !== 'string'
        || typeof payload.public_id !== 'string'
        || typeof payload.secure_url !== 'string'
        || payload.resource_type !== signature.resourceType
        || payload.public_id !== signature.publicId
      ) {
        reject(new Error('Cloudinary returned an incomplete asset record.'));
        return;
      }
      resolve({
        assetId: payload.asset_id,
        publicId: payload.public_id,
        secureUrl: payload.secure_url,
        resourceType: signature.resourceType,
        format: typeof payload.format === 'string' ? payload.format : null,
        bytes: typeof payload.bytes === 'number' ? payload.bytes : null,
        width: typeof payload.width === 'number' ? payload.width : null,
        height: typeof payload.height === 'number' ? payload.height : null,
        createdAt: typeof payload.created_at === 'string' ? payload.created_at : null,
      });
    };
    request.onerror = () => { cleanup(); reject(new Error('Network error while uploading to Cloudinary (HTTP 0).')); };
    request.ontimeout = () => { cleanup(); reject(new Error('Cloudinary upload timed out after 180 seconds (HTTP 0).')); };
    request.onabort = () => { cleanup(); reject(new DOMException('Upload cancelled.', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      cleanup();
      reject(new DOMException('Upload cancelled.', 'AbortError'));
      return;
    }
    uploadTrace('CLOUDINARY_REQUEST', { assetType });
    request.send(form);
  });
}

export async function uploadFinishedAsset(
  blob: Blob,
  filename: string,
  assetType: CloudinaryAssetType,
  submissionId: string,
  signal: AbortSignal,
  onProgress: (progress: number) => void,
): Promise<CloudinaryUploadResult> {
  if (blob.size <= 0) throw new Error(`The finished ${assetType} file is empty.`);
  if (assetType === 'image' && blob.type !== 'image/png') {
    throw new Error('Only the finished PNG postcard can be uploaded as an image.');
  }
  if (assetType === 'video' && !blob.type.startsWith('video/')) {
    throw new Error('Only the finished exported video can be uploaded as a video.');
  }

  const signRequest: UploadSignRequest = {
    submissionId,
    assetType,
    mimeType: blob.type.split(';')[0],
    bytes: blob.size,
    publicConsent: true,
  };
  try {
    const signature = await getSignedUpload(signRequest, false, signal);
    signal.throwIfAborted();
    if (
      signature.resourceType !== assetType
      || !new URL(signature.uploadUrl).pathname.endsWith(`/${assetType}/upload`)
    ) {
      throw new Error(`The signing service returned a URL for the wrong ${assetType} resource type.`);
    }
    return await uploadToCloudinary(blob, filename, assetType, signature, signal, onProgress);
  } catch (error) {
    uploadTrace(assetType === 'image' ? 'PNG_FAILED' : 'VIDEO_FAILED', { message: safeUploadMessage(error) });
    throw error;
  }
}

export function createUploadId(subjectId: string) {
  if (!globalThis.crypto?.randomUUID) throw new Error('This browser cannot create a secure upload identifier.');
  try {
    const raw = sessionStorage.getItem(activeSubmissionStorageKey);
    if (raw) {
      const existing = JSON.parse(raw) as { id?: unknown; subjectId?: unknown };
      if (
        existing.subjectId === subjectId
        && typeof existing.id === 'string'
        && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(existing.id)
      ) return existing.id;
    }
    const next = globalThis.crypto.randomUUID();
    sessionStorage.setItem(activeSubmissionStorageKey, JSON.stringify({ id: next, subjectId }));
    return next;
  } catch {
    return globalThis.crypto.randomUUID();
  }
}

export function clearUploadId() {
  try {
    sessionStorage.removeItem(activeSubmissionStorageKey);
  } catch {
    // Session storage may be unavailable; uploads still work for the current page session.
  }
}
