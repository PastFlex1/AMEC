'use client';

import React, { useEffect, useMemo } from 'react';
import { initializeFirebase } from './index';
import { FirebaseProvider } from './provider';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { syncSessionCookie } from './auth/session-cookie';

export function FirebaseClientProvider({ children }: { children: React.ReactNode }) {
  const { app, db, auth } = useMemo(() => initializeFirebase(), []);

  useEffect(() => syncSessionCookie(auth), [auth]);

  return (
    <FirebaseProvider app={app} db={db} auth={auth}>
      <FirebaseErrorListener />
      {children}
    </FirebaseProvider>
  );
}
