import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, type Auth, type User, signInAnonymously } from 'firebase/auth';

const firebaseApiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim();
const firebaseOptions = {
  apiKey: firebaseApiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim()
    || 'deviation-value-99503.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim()
    || 'deviation-value-99503',
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() || undefined,
};

let authInstance: Auth | null = null;
let anonymousUserPromise: Promise<User> | null = null;

function getFirebaseAuth() {
  if (!firebaseApiKey) {
    throw new Error('Firebase is not configured. Add VITE_FIREBASE_API_KEY to the deployment environment.');
  }
  if (!authInstance) {
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseOptions);
    authInstance = getAuth(app);
  }
  return authInstance;
}

export function getOrCreateAnonymousUser(): Promise<User> {
  if (!anonymousUserPromise) {
    anonymousUserPromise = (async () => {
      const auth = getFirebaseAuth();
      await auth.authStateReady();
      if (auth.currentUser) return auth.currentUser;
      const credential = await signInAnonymously(auth);
      return credential.user;
    })().catch((error: unknown) => {
      anonymousUserPromise = null;
      throw error;
    });
  }
  return anonymousUserPromise;
}
