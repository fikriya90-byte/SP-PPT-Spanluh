import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail } from 'firebase/auth';
import { deleteDoc, doc, getDoc } from 'firebase/firestore';
import { getRoleMeta } from '../core/constants';
import { UserProfile } from '../core/types';
import { auth, db, firebaseConfig } from './firebase';
import { saveUserProfileBundle } from './firestoreService';

export async function createTeacherAccount(params: {
  email: string;
  password: string;
  displayName: string;
  phone: string;
  classIds: string[];
  classNames: string[];
}): Promise<{ success: boolean; message: string; uid?: string }> {
  const secondaryName = `teacher_reg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryName);

  try {
    const secAuth = getAuth(secondaryApp);
    const emailClean = params.email.trim().toLowerCase();
    const cred = await createUserWithEmailAndPassword(secAuth, emailClean, params.password);
    const uid = cred.user.uid;
    const now = new Date().toISOString();
    const meta = getRoleMeta('Guru Pengampu');
    const primaryClassId = params.classIds[0] || 'IX-A';

    const profile: UserProfile = {
      uid,
      name: params.displayName.trim(),
      displayName: params.displayName.trim(),
      role: 'Guru Pengampu',
      divisionId: meta.divisionId,
      divisionName: meta.divisionName,
      classId: primaryClassId,
      className: params.classNames[0] || primaryClassId,
      classIds: params.classIds,
      photoUrl: '',
      photoURL: '',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    await saveUserProfileBundle({
      profile,
      privateInfo: {
        uid,
        email: emailClean,
        phone: params.phone.trim(),
        classId: primaryClassId,
        updatedAt: now,
      },
      credential: {
        uid,
        email: emailClean,
        tempPassword: params.password,
        classId: primaryClassId,
        className: params.classNames[0] || primaryClassId,
        createdBy: auth.currentUser?.uid || 'admin',
        updatedAt: now,
      },
    });

    await secAuth.signOut();
    return {
      success: true,
      uid,
      message: `Akun guru ${params.displayName.trim()} berhasil dibuat.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal membuat akun guru.';
    return { success: false, message: msg };
  } finally {
    await deleteApp(secondaryApp).catch(() => {});
  }
}

export async function sendPasswordReset(
  email?: string
): Promise<{ success: boolean; message: string }> {
  if (!email || !email.trim()) {
    return { success: false, message: 'Email pengguna tidak tersedia.' };
  }
  try {
    await sendPasswordResetEmail(auth, email.trim());
    return {
      success: true,
      message: `Email reset password berhasil dikirim ke ${email.trim()}.`,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Gagal mengirim email reset password.',
    };
  }
}

export const resetStudentPassword = sendPasswordReset;

export async function deleteUserProfile(
  uid: string
): Promise<{ success: boolean; message: string }> {
  try {
    await deleteDoc(doc(db, 'users', uid));
    await deleteDoc(doc(db, 'userPrivate', uid)).catch(() => {});
    await deleteDoc(doc(db, 'userCredentials', uid)).catch(() => {});
    return {
      success: true,
      message: 'Profil pengguna berhasil dihapus dari Firestore.',
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Gagal menghapus profil.',
    };
  }
}

export async function getUserCredentials(uid: string): Promise<{
  success: boolean;
  email?: string;
  password?: string;
  displayName?: string;
  message?: string;
}> {
  try {
    const [credSnap, privSnap, userSnap] = await Promise.all([
      getDoc(doc(db, 'userCredentials', uid)),
      getDoc(doc(db, 'userPrivate', uid)).catch(() => null),
      getDoc(doc(db, 'users', uid)).catch(() => null),
    ]);

    const userData = userSnap?.exists() ? (userSnap.data() as Partial<UserProfile>) : null;
    const privData = privSnap?.exists() ? privSnap.data() : null;
    const credData = credSnap.exists() ? credSnap.data() : null;

    if (!credData && !privData) {
      return {
        success: false,
        message: 'Data kredensial belum tersedia di Firestore untuk akun ini.',
      };
    }

    return {
      success: true,
      email: String(credData?.email || privData?.email || ''),
      password: String(credData?.tempPassword || ''),
      displayName: String(userData?.displayName || userData?.name || ''),
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Gagal memuat kredensial.',
    };
  }
}
