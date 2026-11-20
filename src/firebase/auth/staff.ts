'use client';

import { FirebaseApp, deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { Firestore, doc, getDoc } from 'firebase/firestore';

export type StaffRole = 'admin' | 'sales';

export interface StaffProfile {
  role: StaffRole;
  name: string;
}

/**
 * Determina el rol real del usuario autenticado:
 * - admin: existe el documento `admins/{uid}` (se crea manualmente en la consola de Firebase).
 * - sales: existe `salespeople/{uid}` con status "Activo".
 * Devuelve null si no tiene acceso (o si su cuenta está pendiente de aprobación).
 */
export async function resolveStaffProfile(db: Firestore, uid: string): Promise<StaffProfile | null> {
  const adminSnap = await getDoc(doc(db, 'admins', uid)).catch(() => null);
  if (adminSnap?.exists()) {
    return { role: 'admin', name: adminSnap.data()?.name || 'Administrador' };
  }

  const sellerSnap = await getDoc(doc(db, 'salespeople', uid)).catch(() => null);
  if (sellerSnap?.exists() && sellerSnap.data()?.status === 'Activo') {
    return { role: 'sales', name: sellerSnap.data()?.name || 'Vendedor' };
  }
  return null;
}

/** Guarda nombre y rol para la UI. No otorga permisos: eso lo deciden Firebase Auth y las reglas. */
export function storeProfileForUi(profile: StaffProfile | null) {
  try {
    if (profile) {
      localStorage.setItem('amec_user_role', profile.role);
      localStorage.setItem('amec_user_name', profile.name);
    } else {
      localStorage.removeItem('amec_user_role');
      localStorage.removeItem('amec_user_name');
    }
  } catch {
    /* almacenamiento no disponible */
  }
}

/**
 * Crea una cuenta de Firebase Auth sin cerrar la sesión del administrador actual,
 * usando una instancia secundaria de la app.
 */
export async function createAuthAccountAsAdmin(
  config: Record<string, string>,
  email: string,
  password: string
): Promise<string> {
  let secondary: FirebaseApp | null = null;
  try {
    secondary = initializeApp(config, `secondary-${Date.now()}`);
    const secondaryAuth = getAuth(secondary);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
    await signOut(secondaryAuth);
    return cred.user.uid;
  } finally {
    if (secondary) await deleteApp(secondary).catch(() => {});
  }
}

export function authErrorMessage(err: any): string {
  switch (err?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Correo o contraseña incorrectos.';
    case 'auth/email-already-in-use':
      return 'Este correo ya tiene una cuenta registrada.';
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espere unos minutos e intente de nuevo.';
    case 'auth/operation-not-allowed':
      return 'El inicio de sesión con correo y contraseña no está habilitado en Firebase Authentication.';
    case 'auth/network-request-failed':
      return 'Sin conexión con Firebase. Revise su internet.';
    default:
      return err?.message || 'No se pudo completar la operación.';
  }
}
