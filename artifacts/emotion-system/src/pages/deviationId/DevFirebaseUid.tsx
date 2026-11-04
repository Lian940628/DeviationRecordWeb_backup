import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth } from '../../auth/firebaseAuth';

type AuthReadState = 'loading' | 'ready' | 'empty' | 'error';

export function DevFirebaseUid() {
  const [uid, setUid] = useState('');
  const [readState, setReadState] = useState<AuthReadState>('loading');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    const readCurrentUser = async () => {
      try {
        const auth = getFirebaseAuth();
        await auth.authStateReady();
        if (!active) return;

        const currentUid = auth.currentUser?.uid ?? '';
        setUid(currentUid);
        setReadState(currentUid ? 'ready' : 'empty');

        unsubscribe = onAuthStateChanged(auth, (user) => {
          if (!active) return;
          const nextUid = user?.uid ?? '';
          setUid(nextUid);
          setReadState(nextUid ? 'ready' : 'empty');
          setCopied(false);
        }, () => {
          if (active) setReadState('error');
        });
      } catch {
        if (active) setReadState('error');
      }
    };

    void readCurrentUser();
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const copyUid = async () => {
    if (!uid) return;
    try {
      await navigator.clipboard.writeText(uid);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <aside className="deviation-dev-uid" aria-live="polite">
      <div className="deviation-dev-uid-heading">
        <span>DEV ONLY / FIREBASE ANONYMOUS AUTH</span>
        <small>{readState === 'loading' ? 'INITIALIZING AUTH…' : readState === 'error' ? 'AUTH READ ERROR' : uid ? 'CURRENT USER' : 'NO CURRENT USER'}</small>
      </div>
      <div className="deviation-dev-uid-value">
        <code>{readState === 'loading' ? 'WAITING FOR FIREBASE AUTH' : uid || 'NO USER IN CURRENT SESSION'}</code>
        <button type="button" onClick={() => { void copyUid(); }} disabled={!uid} aria-label="Copy Firebase UID">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'COPIED' : 'COPY UID'}
        </button>
      </div>
    </aside>
  );
}
