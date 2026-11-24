import React, { useState } from 'react';
import {
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { Eye, EyeOff, Lock, LogIn, Mail, Phone, ShieldCheck, UserPlus } from 'lucide-react';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  DIVISIONS,
  SCHOOL_INFO,
  getRoleMeta,
} from '../../core/constants';
import { RoleName, UserPrivate, UserProfile } from '../../core/types';
import { auth, db, googleProvider } from '../../services/firebase';
import {
  migrateFromLegacyDefaultDatabase,
  syncSingleUserFromLegacyDb,
} from '../../services/backupRestore';
import { enrichUser, recordAuditLog, saveUserProfileBundle } from '../../services/firestoreService';
import { ThemeSwitcher } from '../common/ThemeSwitcher';
import { useToast } from '../common/Toast';

type AuthTab = 'Siswa' | 'Guru' | 'Admin';
type AuthMode = 'login' | 'register' | 'google-onboarding';

interface Props {
  pendingGoogleUser: FirebaseUser | null;
  onAuthenticated: (profile: UserProfile) => void;
}

export const LoginView: React.FC<Props> = ({ pendingGoogleUser, onAuthenticated }) => {
  const { showToast } = useToast();
  const [tab, setTab] = useState<AuthTab>('Siswa');
  const [mode, setMode] = useState<AuthMode>(pendingGoogleUser ? 'google-onboarding' : 'login');

  // Login state
  const [email, setEmail] = useState(() => localStorage.getItem('spppt_saved_email') || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Registration / Onboarding state
  const [classCode, setClassCode] = useState('TEATER-IXA-2026');
  const [fullName, setFullName] = useState(pendingGoogleUser?.displayName || '');
  const [regEmail, setRegEmail] = useState(pendingGoogleUser?.email || '');
  const [phone, setPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleName>('Pemeran');

  const [busy, setBusy] = useState(false);
  const [providerHint, setProviderHint] = useState<string | null>(null);

  React.useEffect(() => {
    if (pendingGoogleUser) {
      setMode('google-onboarding');
      setFullName(pendingGoogleUser.displayName || '');
      setRegEmail(pendingGoogleUser.email || '');
    }
  }, [pendingGoogleUser]);

  const resolveClassByCode = async (codeInput: string): Promise<string> => {
    const cleanCode = codeInput.trim().toUpperCase();
    if (!cleanCode) {
      throw new Error('Kode kelas resmi wajib diisi.');
    }
    const snap = await getDocs(
      query(collection(db, 'classes'), where('code', '==', cleanCode))
    );
    if (!snap.empty) {
      return snap.docs[0].id;
    }
    // Built-in fallback mapping if classes haven't been initialized yet
    if (cleanCode === 'TEATER-IXA-2026') return 'IX-A';
    if (cleanCode === 'TEATER-IXB-2026') return 'IX-B';
    throw new Error(`Kode kelas "${cleanCode}" tidak ditemukan. Hubungi Guru Pengampu Anda.`);
  };

  const mapAuthError = (err: unknown): string => {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      return 'Email atau kata sandi salah. Periksa kembali kredensial Anda atau gunakan Lupa Password.';
    }
    if (code === 'auth/user-not-found') {
      return 'Akun dengan email ini belum terdaftar di sistem autentikasi.';
    }
    if (code === 'auth/invalid-email') {
      return 'Format alamat email tidak valid.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Terlalu banyak percobaan login. Silakan tunggu beberapa saat sebelum mencoba lagi.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'Email ini sudah terdaftar. Silakan masuk menggunakan tab Login.';
    }
    if (code === 'auth/weak-password') {
      return 'Kata sandi terlalu lemah. Gunakan minimal 6 karakter.';
    }
    return err instanceof Error ? err.message : 'Terjadi kesalahan autentikasi.';
  };

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setProviderHint(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const fbUser = cred.user;
      const existingSnap = await getDoc(doc(db, 'users', fbUser.uid));

      if (existingSnap.exists()) {
        const privSnap = await getDoc(doc(db, 'userPrivate', fbUser.uid)).catch(() => null);
        const privData = privSnap?.exists() ? (privSnap.data() as UserPrivate) : null;
        const profile = enrichUser(
          { ...(existingSnap.data() as UserProfile), uid: fbUser.uid },
          privData
        );
        await recordAuditLog({
          user: profile,
          action: 'LOGIN',
          targetType: 'auth',
          targetId: fbUser.uid,
          details: 'Login berhasil melalui Google Sign-In.',
        });
        onAuthenticated(profile);
        return;
      }

      // Attempt automatic profile sync from legacy (default) database of this Firebase project
      const legacyProfile = await syncSingleUserFromLegacyDb(fbUser.uid, fbUser.email || undefined);
      if (legacyProfile) {
        if (fbUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
          await setDoc(
            doc(db, 'admins', fbUser.uid),
            {
              uid: fbUser.uid,
              email: fbUser.email || BOOTSTRAPPED_ADMIN_EMAIL,
              role: 'Super Admin',
              createdAt: new Date().toISOString(),
            },
            { merge: true }
          );
          await migrateFromLegacyDefaultDatabase(legacyProfile).catch(() => null);
        }
        await recordAuditLog({
          user: legacyProfile,
          action: 'LOGIN',
          targetType: 'auth',
          targetId: fbUser.uid,
          details: 'Sinkronisasi otomatis profil lama dari database (default).',
        });
        showToast('Profil lama Anda berhasil disinkronkan!', 'success');
        onAuthenticated(legacyProfile);
        return;
      }

      // Auto-bootstrap Super Admin if email matches runtime admin email
      if (fbUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
        const now = new Date().toISOString();
        const adminProfile: UserProfile = {
          uid: fbUser.uid,
          name: fbUser.displayName || 'Fikri Yassaar (Guru Pengampu)',
          role: 'Super Admin',
          divisionId: 'admin',
          divisionName: 'Administrator',
          classId: 'IX-A',
          classIds: ['IX-A', 'IX-B'],
          photoUrl: fbUser.photoURL || '',
          email: fbUser.email || '',
          phone: '',
          isActive: true,
          createdAt: now,
          updatedAt: now,
        };

        await setDoc(
          doc(db, 'admins', fbUser.uid),
          {
            uid: fbUser.uid,
            email: fbUser.email || BOOTSTRAPPED_ADMIN_EMAIL,
            role: 'Super Admin',
            createdAt: now,
          },
          { merge: true }
        );

        await saveUserProfileBundle({
          profile: adminProfile,
          privateInfo: {
            uid: fbUser.uid,
            email: fbUser.email || BOOTSTRAPPED_ADMIN_EMAIL,
            phone: '',
            nis: '',
            classId: 'IX-A',
            updatedAt: now,
          },
        });

        const migration = await migrateFromLegacyDefaultDatabase(adminProfile).catch(() => null);
        await recordAuditLog({
          user: adminProfile,
          action: 'LOGIN',
          targetType: 'auth',
          targetId: fbUser.uid,
          details:
            migration && migration.totalCopied > 0
              ? `Bootstrap Super Admin & migrasi ${migration.totalCopied} dokumen data lama.`
              : 'Bootstrap Super Admin siap menerima impor/data kelas.',
        });
        showToast(
          migration && migration.totalCopied > 0
            ? `Selamat datang! ${migration.totalCopied} dokumen data lama berhasil ditarik.`
            : 'Selamat datang! Akun Super Admin aktif. Gunakan menu Backup & Restore untuk menarik data lama jika diperlukan.',
          'success'
        );
        onAuthenticated(adminProfile);
        return;
      }

      // Otherwise show onboarding form to pick Kode Kelas Resmi & Role
      setFullName(fbUser.displayName || '');
      setRegEmail(fbUser.email || '');
      setMode('google-onboarding');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal masuk dengan Google.';
      if (!msg.includes('popup-closed-by-user')) {
        showToast('Gagal login Google', 'error', msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      showToast('Email dan kata sandi wajib diisi', 'warning');
      return;
    }
    setBusy(true);
    setProviderHint(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (rememberMe) {
        localStorage.setItem('spppt_saved_email', email.trim());
      } else {
        localStorage.removeItem('spppt_saved_email');
      }

      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      let profile: UserProfile | null = null;
      if (snap.exists()) {
        const privSnap = await getDoc(doc(db, 'userPrivate', cred.user.uid)).catch(() => null);
        const privData = privSnap?.exists() ? (privSnap.data() as UserPrivate) : null;
        profile = enrichUser({ ...(snap.data() as UserProfile), uid: cred.user.uid }, privData);
      }
      if (!profile) {
        profile = await syncSingleUserFromLegacyDb(
          cred.user.uid,
          cred.user.email || email.trim()
        );
      }
      if (!profile) {
        if (
          cred.user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase() &&
          !cred.user.emailVerified
        ) {
          showToast(
            'Silakan gunakan tombol "Masuk dengan Google" sekali untuk memverifikasi dan menarik data Super Admin.',
            'warning'
          );
          return;
        }
        if (tab === 'Guru' || tab === 'Admin') {
          showToast(
            'Profil Guru/Admin belum tersedia di database baru',
            'warning',
            'Minta Super Admin untuk menjalankan "Migrasi Database Lama" atau tambahkan akun Anda via panel Kelola Sistem.'
          );
          await signOut(auth).catch(() => undefined);
          return;
        }
        setFullName(cred.user.displayName || '');
        setRegEmail(cred.user.email || email.trim());
        setMode('google-onboarding');
        return;
      }
      if (tab === 'Guru' && !['Guru Pengampu', 'Admin', 'Super Admin'].includes(profile.role)) {
        showToast('Akun ini terdaftar sebagai Siswa, dialihkan ke profil Anda.', 'info');
      } else if (tab === 'Admin' && !['Admin', 'Super Admin'].includes(profile.role)) {
        showToast(`Akun ini terdaftar dengan peran ${profile.role}, dialihkan ke dashboard Anda.`, 'info');
      }
      await recordAuditLog({
        user: profile,
        action: 'LOGIN',
        targetType: 'auth',
        targetId: cred.user.uid,
        details: `Login email/sandi (${tab}).`,
      });
      onAuthenticated(profile);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') {
        setProviderHint(
          'Provider Email/Password belum diaktifkan di Firebase Console proyek ini. Anda dapat langsung menggunakan tombol "Masuk dengan Google" di bawah, atau aktifkan Email/Password di Firebase Console > Authentication > Sign-in method.'
        );
      } else {
        showToast('Gagal masuk', 'error', mapAuthError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      showToast('Masukkan email terlebih dahulu untuk reset kata sandi', 'warning');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      showToast('Link reset kata sandi terkirim', 'success', `Periksa kotak masuk ${email.trim()}.`);
    } catch (err) {
      showToast('Gagal mengirim email reset', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const handleStudentRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !regEmail.trim() || !phone.trim()) {
      showToast('Lengkapi seluruh kolom wajib', 'warning');
      return;
    }
    if (regPassword.length < 6) {
      showToast('Kata sandi minimal 6 karakter', 'warning');
      return;
    }
    if (regPassword !== confirmPassword) {
      showToast('Konfirmasi kata sandi tidak cocok', 'warning');
      return;
    }

    setBusy(true);
    setProviderHint(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, regEmail.trim(), regPassword);
      await updateProfile(cred.user, { displayName: fullName.trim() });
      const resolvedClassId = await resolveClassByCode(classCode);
      const now = new Date().toISOString();
      const meta = getRoleMeta(selectedRole);

      const profile: UserProfile = {
        uid: cred.user.uid,
        name: fullName.trim(),
        role: selectedRole,
        divisionId: meta.divisionId,
        divisionName: meta.divisionName,
        classId: resolvedClassId,
        classIds: [resolvedClassId],
        photoUrl: '',
        email: regEmail.trim(),
        phone: phone.trim(),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

      await saveUserProfileBundle({
        profile,
        privateInfo: {
          uid: cred.user.uid,
          email: regEmail.trim(),
          phone: phone.trim(),
          nis: '',
          classId: resolvedClassId,
          updatedAt: now,
        },
      });
      await recordAuditLog({
        user: profile,
        action: 'CREATE',
        targetType: 'user',
        targetId: cred.user.uid,
        details: `Registrasi siswa baru (${selectedRole}) di kelas ${resolvedClassId}.`,
      });
      showToast('Akun siswa berhasil didaftarkan!', 'success');
      onAuthenticated(profile);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') {
        setProviderHint(
          'Registrasi Email/Password memerlukan aktivasi di Firebase Console > Authentication > Sign-in method. Gunakan tombol "Masuk / Daftar dengan Google" untuk akses instan.'
        );
      } else {
        showToast('Registrasi gagal', 'error', mapAuthError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteGoogleOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    const fbUser = auth.currentUser;
    if (!fbUser) {
      setMode('login');
      return;
    }
    if (!fullName.trim() || !phone.trim()) {
      showToast('Nama lengkap dan No. WhatsApp wajib diisi', 'warning');
      return;
    }
    setBusy(true);
    try {
      const resolvedClassId = await resolveClassByCode(classCode);
      const now = new Date().toISOString();
      const meta = getRoleMeta(selectedRole);

      const profile: UserProfile = {
        uid: fbUser.uid,
        name: fullName.trim(),
        role: selectedRole,
        divisionId: meta.divisionId,
        divisionName: meta.divisionName,
        classId: resolvedClassId,
        classIds: [resolvedClassId],
        photoUrl: fbUser.photoURL || '',
        email: fbUser.email || regEmail.trim(),
        phone: phone.trim(),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

      await saveUserProfileBundle({
        profile,
        privateInfo: {
          uid: fbUser.uid,
          email: fbUser.email || regEmail.trim(),
          phone: phone.trim(),
          nis: '',
          classId: resolvedClassId,
          updatedAt: now,
        },
      });
      await recordAuditLog({
        user: profile,
        action: 'CREATE',
        targetType: 'user',
        targetId: fbUser.uid,
        details: `Onboarding akun Google (${selectedRole}) pada kelas ${resolvedClassId}.`,
      });
      showToast('Profil produksi berhasil dilengkapi!', 'success');
      onAuthenticated(profile);
    } catch (err) {
      showToast('Gagal menyimpan profil', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-theater-weave flex flex-col items-center justify-center p-4 sm:p-6 relative">
      <div className="fixed top-4 right-4 z-20">
        <ThemeSwitcher compact className="shadow-md backdrop-blur-md" />
      </div>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-6 sm:p-8 shadow-2xl text-slate-900 dark:text-slate-100">
        {/* Dual Logos & Brand Header matching screenshots */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex items-center justify-center gap-3 mb-3.5">
            <img
              src={SCHOOL_INFO.logoSchool}
              alt="Logo SMP Negeri 10 Samarinda"
              className="w-11 h-11 object-contain"
              referrerPolicy="no-referrer"
            />
            <img
              src={SCHOOL_INFO.logoMapel}
              alt="Logo Mapel Seni Budaya SMP Negeri 10 Samarinda"
              className="w-11 h-11 object-contain rounded-full"
              referrerPolicy="no-referrer"
            />
          </div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {SCHOOL_INFO.appName}
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{SCHOOL_INFO.subtitle}</p>
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
            {SCHOOL_INFO.school} · {SCHOOL_INFO.academicYear}
          </p>
        </div>

        {providerHint && (
          <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
            {providerHint}
          </div>
        )}

        {mode === 'login' && (
          <>
            {/* Segmented Tab Selector: Siswa | Guru | Admin */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 mb-5">
              {(['Siswa', 'Guru', 'Admin'] as AuthTab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    tab === t
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Email {tab}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Ketik email Anda"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Kata Sandi</label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-500 dark:hover:text-amber-300"
                  >
                    Lupa Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Ketik kata sandi Anda"
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    aria-label="Tampilkan sandi"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-amber-500 focus:ring-amber-400"
                />
                <span className="text-xs text-slate-600 dark:text-slate-300">Ingat saya</span>
              </label>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-slate-950 font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                {busy ? 'Memproses...' : `Masuk Sebagai ${tab}`}
              </button>
            </form>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              <span className="text-[11px] text-slate-500 font-medium">atau akses cepat</span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={handleGoogleSignIn}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white font-semibold text-sm inline-flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              Masuk dengan Google
            </button>

            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 text-center space-y-1.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Belum memiliki akun?{' '}
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className="text-amber-600 dark:text-amber-400 hover:text-amber-500 dark:hover:text-amber-300 font-semibold"
                >
                  Daftar Siswa
                </button>
              </p>
              <p className="text-[11px] text-slate-500">
                Akun Guru dibuat oleh Administrator melalui panel sistem.
              </p>
            </div>
          </>
        )}

        {mode === 'register' && (
          <form onSubmit={handleStudentRegister} className="space-y-3.5">
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <UserPlus className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                Registrasi Siswa Baru
              </div>
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              >
                Kembali ke Login
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Kode Kelas Resmi *
              </label>
              <input
                type="text"
                value={classCode}
                onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                placeholder="KETIK KODE KELAS DARI GURU ANDA"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 text-sm font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Contoh kode kelas aktif: TEATER-IXA-2026 atau TEATER-IXB-2026.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nama Lengkap *
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ketik nama lengkap Anda"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Email *</label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="Ketik email Anda"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  No. WhatsApp *
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0812xxxxxxxx"
                    className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 text-sm font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Kata Sandi *
                </label>
                <input
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Min 6 karakter"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Ulangi Sandi *
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ketik ulang sandi"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Pilih Peran / Jabatan dalam Produksi *
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as RoleName)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {DIVISIONS.map((div) => (
                  <optgroup key={div.id} label={div.name}>
                    {div.roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-blue-500/30 bg-blue-50 dark:bg-blue-950/40 p-3 flex items-start gap-2.5 text-[11px] text-slate-700 dark:text-slate-300">
              <ShieldCheck className="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
              <p>
                Data Anda aman. Peran dapat diverifikasi dan diperbarui oleh Guru Pengampu setelah pendaftaran.
              </p>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-slate-950 font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              {busy ? 'Mendaftarkan...' : 'Daftarkan Akun Siswa'}
            </button>
          </form>
        )}

        {mode === 'google-onboarding' && (
          <form onSubmit={handleCompleteGoogleOnboarding} className="space-y-3.5">
            <div className="flex items-center justify-between pb-1">
              <span className="text-sm font-bold text-slate-900 dark:text-white">Lengkapi Profil Produksi</span>
              <button
                type="button"
                onClick={async () => {
                  await signOut(auth);
                  setMode('login');
                }}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                Ganti Akun
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Akun <span className="text-slate-900 dark:text-slate-200 font-medium">{regEmail}</span> belum memiliki profil siswa pada kelas produksi.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Kode Kelas Resmi *
              </label>
              <input
                type="text"
                value={classCode}
                onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nama Lengkap *
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                No. WhatsApp *
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0812xxxxxxxx"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Peran / Jabatan dalam Produksi *
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as RoleName)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {DIVISIONS.map((div) => (
                  <optgroup key={div.id} label={div.name}>
                    {div.roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm cursor-pointer"
            >
              {busy ? 'Menyimpan...' : 'Simpan & Masuk ke Kelas'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-[11px] text-slate-500">
          SP-PPT · {SCHOOL_INFO.school}
        </p>
      </div>
    </div>
  );
};
