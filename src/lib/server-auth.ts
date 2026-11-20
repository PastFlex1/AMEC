import { cookies } from 'next/headers';
import { firebaseConfig } from '@/firebase/config';

/**
 * Verificación de sesión en el servidor (Server Actions y rutas API).
 *
 * El cliente guarda el ID token de Firebase Auth en la cookie `__session`
 * (ver src/firebase/auth/session-cookie.ts). Aquí se valida ese token contra
 * Firebase Auth y se comprueba, con el mismo token, que el usuario sea un
 * administrador (`admins/{uid}`) o un vendedor activo (`salespeople/{uid}`).
 * Las reglas de Firestore permiten a cada usuario leer solo su propio documento.
 */

export const SESSION_COOKIE = '__session';

export type StaffRole = 'admin' | 'sales';

export interface StaffSession {
  uid: string;
  email: string | null;
  role: StaffRole;
}

export class UnauthorizedError extends Error {
  constructor(message = 'Sesión no válida. Vuelva a iniciar sesión.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

async function lookupUid(idToken: string): Promise<{ uid: string; email: string | null } | null> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const user = data?.users?.[0];
  if (!user?.localId || user.disabled) return null;
  return { uid: user.localId, email: user.email ?? null };
}

async function readOwnDoc(idToken: string, path: string): Promise<any | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function getStaffSession(): Promise<StaffSession | null> {
  const idToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!idToken) return null;

  try {
    const user = await lookupUid(idToken);
    if (!user) return null;

    const adminDoc = await readOwnDoc(idToken, `admins/${user.uid}`);
    if (adminDoc) return { ...user, role: 'admin' };

    const sellerDoc = await readOwnDoc(idToken, `salespeople/${user.uid}`);
    if (sellerDoc?.fields?.status?.stringValue === 'Activo') {
      return { ...user, role: 'sales' };
    }
  } catch (err) {
    console.error('[server-auth] Error verificando la sesión:', err);
  }
  return null;
}

/** Lanza UnauthorizedError si no hay un administrador o vendedor activo en sesión. */
export async function requireStaff(): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) throw new UnauthorizedError();
  return session;
}
