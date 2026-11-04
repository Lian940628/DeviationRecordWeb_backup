import { getOrCreateAnonymousUser } from '../../auth/firebaseAuth';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toSignRequest(payload: unknown): UploadSignature {
  if (!isRecord(payload)) {
    throw new Error('The signing service returned an invalid response.');
  }

  const params = isRecord(payload.params)
    ? payload.params as Record<string, string | number | boolean>
    : null;
  const uploadUrl = payload.uploadUrl;
  const apiKey = payload.apiKey;
  const signature = payload.signature;
  if (
    typeof uploadUrl !== 'string'
    || typeof apiKey !== 'string'
    || typeof signature !== 'string'
    || !params
  ) {
    throw new Error('The signing service response is missing uploadUrl, apiKey, params, or signature.');
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
    || !/\/(image|video)\/upload$/.test(url.pathname)
  ) {
    throw new Error('The signing service returned an unexpected Cloudinary destination.');
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
  };
}

async function getSignedUpload(
  request: UploadSignRequest,
  forceRefresh: boolean,
  signal: AbortSignal,
): Promise<UploadSignature> {
  const user = await getOrCreateAnonymousUser();
  if (!user.isAnonymous) throw new Error('The saved Firebase session is not anonymous.');

  const token = await user.getIdToken(forceRefresh);
  let response: Response;
  try {
    response = await fetch(signUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw new DOMException('Upload cancelled.', 'AbortError');
    throw new Error(directWorker
      ? 'Could not reach the signing service. Check the Worker origin allowlist for this site.'
      : 'Could not reach the signing service through the application API.');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`The signing service returned an invalid response (HTTP ${response.status}).`);
  }
  if (response.status === 401 && !forceRefresh) {
    const refreshed = await user.getIdToken(true);
    let retry: Response;
    try {
      retry = await fetch(signUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${refreshed}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal,
      });
    } catch {
      if (signal.aborted) throw new DOMException('Upload cancelled.', 'AbortError');
      throw new Error('Could not reach the signing service after refreshing the Firebase token.');
    }
    try {
      payload = await retry.json();
    } catch {
      throw new Error(`The signing service returned an invalid response (HTTP ${retry.status}).`);
    }
    if (!retry.ok) {
      throw new Error(isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : `The signing service rejected the request (HTTP ${retry.status}).`);
    }
    return toSignRequest(payload);
  }
  if (!response.ok) {
    throw new Error(isRecord(payload) && typeof payload.error === 'string'
      ? payload.error
      : `The signing service rejected the request (HTTP ${response.status}).`);
  }
  return toSignRequest(payload);
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
    request.open('POST', signature.uploadUrl);
    request.responseType = 'json';
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      const payload: unknown = request.response;
      if (request.status < 200 || request.status >= 300) {
        const errorMessage = isRecord(payload) && isRecord(payload.error)
          && typeof payload.error.message === 'string'
          ? payload.error.message
          : `Cloudinary rejected the ${assetType} upload (HTTP ${request.status}).`;
        reject(new Error(errorMessage));
        return;
      }
      if (
        !isRecord(payload)
        || typeof payload.asset_id !== 'string'
        || typeof payload.public_id !== 'string'
        || typeof payload.secure_url !== 'string'
        || payload.resource_type !== assetType
      ) {
        reject(new Error('Cloudinary returned an incomplete asset record.'));
        return;
      }
      resolve({
        assetId: payload.asset_id,
        publicId: payload.public_id,
        secureUrl: payload.secure_url,
        resourceType: assetType,
        format: typeof payload.format === 'string' ? payload.format : null,
        bytes: typeof payload.bytes === 'number' ? payload.bytes : null,
        width: typeof payload.width === 'number' ? payload.width : null,
        height: typeof payload.height === 'number' ? payload.height : null,
        createdAt: typeof payload.created_at === 'string' ? payload.created_at : null,
      });
    };
    request.onerror = () => reject(new Error('Network error while uploading to Cloudinary.'));
    request.onabort = () => reject(new DOMException('Upload cancelled.', 'AbortError'));
    signal.addEventListener('abort', () => request.abort(), { once: true });
    if (signal.aborted) {
      request.abort();
      return;
    }
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
  const signature = await getSignedUpload(signRequest, false, signal);
  const expectedPath = `/${assetType}/upload`;
  if (!new URL(signature.uploadUrl).pathname.endsWith(expectedPath)) {
    throw new Error(`The signing service returned a URL for the wrong ${assetType} resource type.`);
  }
  return uploadToCloudinary(blob, filename, assetType, signature, signal, onProgress);
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
