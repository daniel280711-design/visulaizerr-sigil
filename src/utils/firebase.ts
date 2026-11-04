/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Firebase & Google Auth Integration for Sigil Viz
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  User,
  signOut
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  collection,
  query,
  where,
  onSnapshot,
  setDoc,
  deleteDoc,
  serverTimestamp,
  Unsubscribe
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file'
];

export const googleAuthProvider = new GoogleAuthProvider();
DRIVE_SCOPES.forEach(scope => googleAuthProvider.addScope(scope));

// In-memory token cache (never stored in localStorage as per security policy)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const initAuth = (
  onAuthSuccess?: (user: User, token?: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string | null } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleAuthProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedAccessToken = credential?.accessToken || null;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign In error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const logoutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

/* ───────── Firestore Error Handling as per Firebase Skill guidelines ───────── */
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Mandatory connection test on boot
export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline. Please check your network and configuration.');
    }
  }
}

/* ───────── Cloud Presets Persistence with Firestore ───────── */
export interface CloudPreset {
  id: string;
  userId: string;
  name: string;
  c1: string;
  c2: string;
  c3: string;
  am: string;
  presetType?: string;
  shapeIndex?: number;
  fxPreset?: string;
  createdAt?: any;
  updatedAt?: any;
}

export async function savePresetToCloud(data: {
  name: string;
  c1: string;
  c2: string;
  c3: string;
  am?: string;
  presetType?: string;
  shapeIndex?: number;
  fxPreset?: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Debes iniciar sesión para guardar presets en la nube.');
  }

  // Generate hardened alphanumeric ID
  const presetId = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
  const path = `presets/${presetId}`;

  const payload: Record<string, any> = {
    id: presetId,
    userId: user.uid,
    name: data.name.trim().substring(0, 100),
    c1: data.c1.substring(0, 16),
    c2: data.c2.substring(0, 16),
    c3: data.c3.substring(0, 16),
    am: (data.am || '#08090c').substring(0, 16),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (data.presetType) payload.presetType = data.presetType.substring(0, 32);
  if (typeof data.shapeIndex === 'number' && Number.isFinite(data.shapeIndex)) {
    payload.shapeIndex = Math.max(0, Math.min(100, Math.round(data.shapeIndex)));
  }
  if (data.fxPreset) payload.fxPreset = data.fxPreset.substring(0, 64);

  try {
    await setDoc(doc(db, 'presets', presetId), payload);
    return presetId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeToUserPresets(
  userId: string,
  onUpdate: (presets: CloudPreset[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const path = 'presets';
  const q = query(
    collection(db, path),
    where('userId', '==', userId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const presets: CloudPreset[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data() as CloudPreset;
        presets.push(d);
      });
      // Sort in-memory to avoid needing composite index
      presets.sort((a, b) => {
        const tA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
        const tB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
        return tB - tA;
      });
      onUpdate(presets);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function deletePresetFromCloud(presetId: string): Promise<void> {
  const path = `presets/${presetId}`;
  try {
    await deleteDoc(doc(db, 'presets', presetId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
