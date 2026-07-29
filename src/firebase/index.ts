'use client';

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { firebaseConfig } from './config';

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;

export function initializeFirebase(): { app: FirebaseApp; db: Firestore; auth: Auth } {
  if (!appInstance) {
    appInstance = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  if (!dbInstance) {
    try {
      dbInstance = initializeFirestore(appInstance, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      });
    } catch {
      dbInstance = getFirestore(appInstance);
    }
  }
  if (!authInstance) {
    authInstance = getAuth(appInstance);
  }

  return { app: appInstance, db: dbInstance, auth: authInstance };
}

export * from './provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './auth/use-user';
