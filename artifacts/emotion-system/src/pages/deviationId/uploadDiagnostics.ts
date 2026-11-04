import type { CloudinaryAssetType, CloudinaryUploadResult } from './cloudinaryUpload';

export interface UploadDiagnostic {
  time: string;
  stage: string;
  assetType?: CloudinaryAssetType;
  httpStatus?: number;
  message?: string;
  imageReady?: boolean;
  videoReady?: boolean;
  results?: Partial<Record<CloudinaryAssetType, CloudinaryUploadResult>>;
}

const listeners = new Set<(event: UploadDiagnostic) => void>();

export function safeUploadMessage(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value);
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[REDACTED TOKEN]')
    .replace(/(\bsignature\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/((?:signature|api_secret|id_token|token|authorization)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]');
}

export function uploadTrace(stage: string, details: Omit<UploadDiagnostic, 'time' | 'stage'> = {}) {
  if (!import.meta.env.DEV) return;
  const event: UploadDiagnostic = {
    ...details,
    message: details.message ? safeUploadMessage(details.message) : undefined,
    time: new Date().toISOString(),
    stage,
  };
  // Never pass Firebase users, request headers, signature payloads or FormData here.
  console.info(`[DEVIATION UPLOAD] ${stage}`, event);
  listeners.forEach((listener) => listener(event));
}

export function subscribeUploadDiagnostics(listener: (event: UploadDiagnostic) => void) {
  if (import.meta.env.DEV) listeners.add(listener);
  return () => { listeners.delete(listener); };
}
