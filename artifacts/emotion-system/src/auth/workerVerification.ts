import { getOrCreateAnonymousUser } from './firebaseAuth';

const workerVerifyUrl = `${(import.meta.env.VITE_WORKER_VERIFY_URL?.trim()
  || 'https://deviationvalueweb.wang-elaine628.workers.dev').replace(/\/+$/, '')}/verify`;
const appBasePath = import.meta.env.BASE_URL.replace(/\/+$/, '');
const useDirectWorker = import.meta.env.VITE_IDENTITY_VERIFY_MODE === 'direct'
  || (!import.meta.env.VITE_IDENTITY_VERIFY_MODE
    && typeof window !== 'undefined'
    && window.location.hostname.endsWith('github.io'));
const verifyUrl = useDirectWorker
  ? workerVerifyUrl
  : `${appBasePath}/api/identity/verify`;

interface WorkerVerification {
  verified: true;
  uid: string;
  anonymous: true;
}

class VerificationError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'VerificationError';
  }
}

let verificationInFlight: Promise<WorkerVerification> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function postVerification(idToken: string, expectedUid: string): Promise<WorkerVerification> {
  let response: Response;
  try {
    response = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        Accept: 'application/json',
      },
    });
  } catch {
    throw new VerificationError(
      useDirectWorker
        ? 'Could not reach the identity verifier. Check the Worker CORS allowlist for this site origin.'
        : 'Could not reach the application identity-verification service.',
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new VerificationError(
      `The identity verifier returned an invalid response (HTTP ${response.status}).`,
      response.status,
    );
  }

  if (!response.ok) {
    throw new VerificationError(
      `The identity verifier rejected the request (HTTP ${response.status}).`,
      response.status,
    );
  }
  if (
    !isRecord(payload)
    || payload.verified !== true
    || payload.uid !== expectedUid
    || payload.anonymous !== true
  ) {
    throw new VerificationError('The identity verifier response did not match this anonymous Firebase user.');
  }

  return {
    verified: true,
    uid: payload.uid,
    anonymous: true,
  };
}

async function verify(forceRefresh: boolean): Promise<WorkerVerification> {
  const user = await getOrCreateAnonymousUser();
  if (!user.isAnonymous) {
    throw new VerificationError('The saved Firebase session is not anonymous.');
  }

  const idToken = await user.getIdToken(forceRefresh);
  try {
    return await postVerification(idToken, user.uid);
  } catch (error) {
    if (!(error instanceof VerificationError) || (error.status !== 401 && error.status !== 403)) {
      throw error;
    }
    const refreshedToken = await user.getIdToken(true);
    return postVerification(refreshedToken, user.uid);
  }
}

export function verifyWorkerIdentity(forceRefresh = false) {
  if (verificationInFlight) return verificationInFlight;
  const wrappedAttempt = verify(forceRefresh).finally(() => {
    if (verificationInFlight === wrappedAttempt) verificationInFlight = null;
  });
  verificationInFlight = wrappedAttempt;
  return wrappedAttempt;
}

export function logIdentityVerification(
  result: WorkerVerification | null,
  error?: unknown,
) {
  if (!import.meta.env.DEV) return;
  if (error) {
    console.error('[identity] Firebase / Worker verification failed:', error instanceof Error ? error.message : error);
    return;
  }
  if (result) {
    console.info('[identity] Firebase / Worker verification succeeded:', {
      verified: result.verified,
      anonymous: result.anonymous,
      uidMatched: Boolean(result.uid),
    });
  }
}

export function describeVerificationError(error: unknown) {
  return error instanceof Error ? error.message : 'Identity verification failed. Please retry.';
}
