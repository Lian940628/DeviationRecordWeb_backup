import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCw, ShieldAlert } from 'lucide-react';
import {
  describeVerificationError,
  logIdentityVerification,
  verifyWorkerIdentity,
} from './workerVerification';
import './identity-verification.css';

export function IdentityVerificationStatus() {
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const mountedRef = useRef(false);

  const runVerification = useCallback(async (forceRefresh = false) => {
    setChecking(true);
    setRetrying(forceRefresh);
    setError('');
    try {
      const result = await verifyWorkerIdentity(forceRefresh);
      logIdentityVerification(result);
    } catch (verificationError) {
      logIdentityVerification(null, verificationError);
      if (mountedRef.current) setError(describeVerificationError(verificationError));
    } finally {
      if (mountedRef.current) {
        setChecking(false);
        setRetrying(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void runVerification();
    return () => {
      mountedRef.current = false;
    };
  }, [runVerification]);

  if (checking && !retrying) return null;
  if (!error) return null;

  return (
    <aside className="identity-verification-error" role="alert" aria-live="assertive">
      <ShieldAlert size={15} aria-hidden="true" />
      <div className="identity-verification-copy">
        <strong>IDENTITY VERIFICATION FAILED</strong>
        <span>{error}</span>
      </div>
      <button
        type="button"
        onClick={() => { void runVerification(true); }}
        disabled={retrying}
        aria-label="Retry identity verification"
      >
        <RotateCw size={13} className={retrying ? 'identity-verification-spin' : ''} />
        {retrying ? 'RETRYING' : 'RETRY'}
      </button>
    </aside>
  );
}
