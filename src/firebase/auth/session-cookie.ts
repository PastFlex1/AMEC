'use client';

import { Auth, onIdTokenChanged } from 'firebase/auth';

const COOKIE_NAME = '__session';

function writeCookie(value: string | null) {
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  if (value) {
    // El ID token de Firebase dura 1 hora; onIdTokenChanged lo renueva antes de que expire.
    document.cookie = `${COOKIE_NAME}=${value}; Path=/; Max-Age=3600; SameSite=Strict${secure}`;
  } else {
    document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Strict${secure}`;
  }
}

/**
 * Mantiene la cookie `__session` sincronizada con el ID token del usuario,
 * para que las Server Actions y rutas API puedan verificar la sesión.
 */
export function syncSessionCookie(auth: Auth): () => void {
  return onIdTokenChanged(auth, async (user) => {
    writeCookie(user ? await user.getIdToken() : null);
  });
}

/** Escribe la cookie de inmediato (útil justo después de iniciar sesión). */
export async function refreshSessionCookie(auth: Auth): Promise<void> {
  writeCookie(auth.currentUser ? await auth.currentUser.getIdToken() : null);
}
