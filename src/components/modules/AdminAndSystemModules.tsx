import React, { useEffect, useMemo, useState } from 'react';
import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail, signOut } from 'firebase/auth';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Database,
  Download,
  FolderOpen,
  ImagePlus,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import {
  DEFAULT_ASSESSOR_WEIGHTS,
  DEFAULT_STAGE_WEIGHTS,
  DIVISIONS,
  PRODUCTION_STAGES,
  SCHOOL_INFO,
  STAGE_LABELS,
  STUDENT_ROLES,
  getRoleMeta,
  isAdminRole,
  isTeacherOrAdmin,
} from '../../core/constants';
import { DEFAULT_DRIVE_FOLDERS } from '../../core/driveFolders';
import {
  AssessorCategory,
  AssessorWeightsConfig,
  AuditLogItem,
  DeadlineSubmission,
  DeadlineTask,
  DriveFolderItem,
  ProductionStage,
  RoleName,
  SchoolClass,
  UserCredential,
  UserProfile,
} from '../../core/types';
import { getTaskStage, isSubmissionDone, isTaskRelevantToUser } from '../../services/autoScoreService';
import {
  BackupPayload,
  LegacyInspectionResult,
  LegacyMigrationResult,
  LegacyRepairResult,
  createClassBackup,
  downloadBackupJSON,
  inspectLegacyDefaultDatabase,
  migrateFromLegacyDefaultDatabase,
  repairLegacyClassData,
  restoreClassBackup,
  validateBackupFile,
} from '../../services/backupRestore';
import { auth, firebaseConfig } from '../../services/firebase';
import {
  makeSafeId,
  recordAuditLog,
  saveAssessorWeights,
  saveDriveFolders,
  saveUserProfileBundle,
  updateDocumentFields,
  upsertDocument,
} from '../../services/firestoreService';
import { clearDemoSeedData, ensureSeededForClass } from '../../services/seedService';
import { buildWhatsAppUrl, compressImageToBase64 } from '../../utils/imageCompress';
import { ThemeSwitcher } from '../common/ThemeSwitcher';
import { useToast } from '../common/Toast';

async function createSecondaryAuthAccount(email: string, password: string): Promise<string | null> {
  const tempApp = initializeApp(firebaseConfig, `sec_${Date.now()}`);
  try {
    const tempAuth = getAuth(tempApp);
    const cred = await createUserWithEmailAndPassword(tempAuth, email, password);
    const uid = cred.user.uid;
    await signOut(tempAuth);
    return uid;
  } finally {
    await deleteApp(tempApp).catch(() => undefined);
  }
}

function generateRandomPassword(len = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

// ============================================================================
// 1. MANAGE STUDENT MODULE
// ============================================================================
interface ManageStudentModuleProps {
  user: UserProfile;
  classId: string;
  classes: SchoolClass[];
  members: UserProfile[];
  credentials: UserCredential[];
  deadlines?: DeadlineTask[];
  submissions?: DeadlineSubmission[];
  currentStage?: ProductionStage;
}

export const ManageStudentModule: React.FC<ManageStudentModuleProps> = ({
  user,
  classId,
  classes,
  members,
  credentials,
  deadlines = [],
  submissions = [],
  currentStage = 'PERSIAPAN',
}) => {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [stageFilterProgress, setStageFilterProgress] = useState<'ALL' | ProductionStage>('ALL');
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState<RoleName>('Pemeran');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [nis, setNis] = useState('');
  const [targetClassId, setTargetClassId] = useState(classId);
  const [busy, setBusy] = useState(false);
  const [confirmDeactivateUid, setConfirmDeactivateUid] = useState<string | null>(null);

  const students = useMemo(
    () => members.filter((m) => !['Super Admin', 'Admin', 'Guru Pengampu'].includes(m.role)),
    [members]
  );

  const studentProgressMap = useMemo(() => {
    const map = new Map<string, { done: number; total: number; pct: number }>();
    const activeDeadlines = deadlines.filter(
      (d) =>
        d.status !== 'CANCELLED' &&
        (stageFilterProgress === 'ALL' || getTaskStage(d) === stageFilterProgress)
    );
    for (const s of students) {
      const relevant = activeDeadlines.filter((d) => isTaskRelevantToUser(d, s));
      const done = relevant.filter((d) =>
        isSubmissionDone(submissions.find((sub) => sub.deadlineId === d.id && sub.studentId === s.uid))
      ).length;
      const total = relevant.length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 100;
      map.set(s.uid, { done, total, pct });
    }
    return map;
  }, [students, deadlines, submissions, stageFilterProgress]);

  const progressSummary = useMemo(() => {
    if (students.length === 0) {
      return { totalStudents: 0, avgProgress: 0, onTrack: 0, needsAttention: 0 };
    }
    let sumPct = 0;
    let onTrack = 0;
    let needsAttention = 0;
    students.forEach((s) => {
      const prog = studentProgressMap.get(s.uid) || { done: 0, total: 0, pct: 100 };
      sumPct += prog.pct;
      if (prog.pct >= 80) onTrack++;
      if (prog.total > 0 && prog.pct < 50) needsAttention++;
    });
    return {
      totalStudents: students.length,
      avgProgress: Math.round(sumPct / students.length),
      onTrack,
      needsAttention,
    };
  }, [students, studentProgressMap]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students
      .filter((s) => (roleFilter === 'ALL' ? true : s.role === roleFilter))
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.role.toLowerCase().includes(q) ||
          (s.email || '').toLowerCase().includes(q) ||
          (s.nis || '').toLowerCase().includes(q)
      );
  }, [students, search, roleFilter]);

  const openEdit = (s: UserProfile) => {
    setEditing(s);
    setName(s.name);
    setRole(s.role);
    setEmail(s.email || '');
    setPhone(s.phone || '');
    setNis(s.nis || '');
    setTargetClassId(s.classId);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !name.trim()) return;
    setBusy(true);
    try {
      const meta = getRoleMeta(role);
      const now = new Date().toISOString();
      await saveUserProfileBundle({
        profile: {
          ...editing,
          name: name.trim(),
          role,
          divisionId: meta.divisionId,
          divisionName: meta.divisionName,
          classId: targetClassId,
          classIds: Array.from(new Set([...(editing.classIds || []), targetClassId])),
          updatedAt: now,
        },
        privateInfo: {
          uid: editing.uid,
          email: email.trim(),
          phone: phone.trim(),
          nis: nis.trim(),
          classId: targetClassId,
          updatedAt: now,
        },
      });
      await recordAuditLog({
        user,
        action: 'UPDATE',
        targetType: 'user',
        targetId: editing.uid,
        details: `Memperbarui profil siswa ${name.trim()} (${role}, kelas ${targetClassId}).`,
      });
      setEditing(null);
      showToast('Data siswa berhasil disimpan', 'success');
    } catch (err) {
      showToast('Gagal menyimpan data siswa', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = async (s: UserProfile) => {
    try {
      await updateDocumentFields('users', s.uid, {
        isActive: false,
        updatedAt: new Date().toISOString(),
      });
      await recordAuditLog({
        user,
        action: 'DELETE',
        targetType: 'user',
        targetId: s.uid,
        details: `Menonaktifkan akun siswa ${s.name}.`,
      });
      showToast(`Akun ${s.name} dinonaktifkan`, 'info');
    } catch (err) {
      showToast('Gagal menonaktifkan akun', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const handleResetPassword = async (targetEmail?: string) => {
    if (!targetEmail) {
      showToast('Siswa belum memiliki alamat email', 'warning');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, targetEmail);
      showToast(`Email reset kata sandi dikirim ke ${targetEmail}`, 'success');
    } catch (err) {
      showToast('Gagal mengirim reset password', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
          <Users className="w-6 h-6 text-amber-500" />
          Kelola Siswa & Peran Produksi ({students.length})
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Kelola jabatan kerabat kerja, kontak WhatsApp, NIS, dan akses reset kata sandi siswa kelas {classId}.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Total Siswa Aktif</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {progressSummary.totalStudents}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Rata-rata Progres Tugas</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {progressSummary.avgProgress}%
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Tuntas (&ge; 80%)</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {progressSummary.onTrack}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Perlu Perhatian (&lt; 50%)</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
            {progressSummary.needsAttention}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, NIS, atau email siswa..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          />
        </div>
        <select
          value={stageFilterProgress}
          onChange={(e) => setStageFilterProgress(e.target.value as 'ALL' | ProductionStage)}
          className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
        >
          <option value="ALL">Progres: Semua Tahap</option>
          {PRODUCTION_STAGES.map((st) => (
            <option key={st} value={st}>
              Tahap {st} {st === currentStage ? '(Aktif)' : ''}
            </option>
          ))}
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
        >
          <option value="ALL">Semua Peran</option>
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

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs text-slate-500">
                <th className="py-3 px-4 font-semibold">Nama & NIS</th>
                <th className="py-3 px-4 font-semibold">Jabatan & Divisi</th>
                <th className="py-3 px-4 font-semibold">Progres Tugas</th>
                <th className="py-3 px-4 font-semibold">Email & WhatsApp</th>
                <th className="py-3 px-4 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {filtered.map((s) => {
                const cred = credentials.find((c) => c.uid === s.uid);
                const prog = studentProgressMap.get(s.uid) || { done: 0, total: 0, pct: 100 };
                return (
                  <tr key={s.uid} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 dark:text-white">{s.name}</p>
                      <p className="text-xs font-mono text-slate-500">
                        NIS: {s.nis || '-'}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-amber-600 dark:text-amber-400 text-xs">
                        {s.role}
                      </p>
                      <p className="text-xs text-slate-500">{s.divisionName}</p>
                    </td>
                    <td className="py-3 px-4 min-w-[140px]">
                      {prog.total === 0 ? (
                        <span className="text-xs text-slate-400">Belum ada target</span>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="text-slate-700 dark:text-slate-200 font-semibold">
                              {prog.done}/{prog.total}
                            </span>
                            <span
                              className={
                                prog.pct >= 80
                                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                                  : prog.pct >= 50
                                    ? 'text-amber-600 dark:text-amber-400 font-bold'
                                    : 'text-rose-600 dark:text-rose-400 font-bold'
                              }
                            >
                              {prog.pct}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                prog.pct >= 80
                                  ? 'bg-emerald-500'
                                  : prog.pct >= 50
                                    ? 'bg-amber-500'
                                    : 'bg-rose-500'
                              }`}
                              style={{ width: `${prog.pct}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <p className="text-slate-700 dark:text-slate-300">{s.email || '-'}</p>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-500">{s.phone || 'Belum ada WA'}</span>
                        {s.phone && (
                          <a
                            href={buildWhatsAppUrl(
                              s.phone,
                              `Halo ${s.name}, pengingat progres tugas produksi teater kelas ${classId} (${prog.done}/${prog.total} tugas selesai).`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                          >
                            Chat WA
                          </a>
                        )}
                      </div>
                      {cred?.tempPassword && (
                        <p className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                          Pass awal: {cred.tempPassword}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => handleResetPassword(s.email)}
                        className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-amber-500"
                        title="Kirim email reset kata sandi"
                      >
                        <KeyRound className="w-3.5 h-3.5 inline" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                      >
                        Edit
                      </button>
                      {confirmDeactivateUid === s.uid ? (
                        <span className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDeactivateUid(null);
                              handleDeactivate(s);
                            }}
                            className="px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] font-semibold"
                          >
                            Nonaktifkan
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeactivateUid(null)}
                            className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-[11px]"
                          >
                            Batal
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeactivateUid(s.uid)}
                          className="text-rose-500 hover:text-rose-600 p-1"
                          title="Nonaktifkan akun"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                Edit Profil Siswa
              </h2>
              <button type="button" onClick={() => setEditing(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Nama Lengkap *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Kelas</label>
                <select
                  value={targetClassId}
                  onChange={(e) => setTargetClassId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">NIS</label>
                <input
                  type="text"
                  value={nis}
                  onChange={(e) => setNis(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Peran Produksi</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as RoleName)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Email (Profil Privat)</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">No. WhatsApp</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              Catatan: Mengubah email pada profil tidak mengubah email kredensial login Firebase Auth. Gunakan tombol reset sandi atau daftar ulang untuk email login baru.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-xs text-slate-500"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold"
              >
                {busy ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 2. ADMIN MODULE (Teachers + Students Creation & Multi-Class Assignment)
// ============================================================================
interface AdminModuleProps {
  user: UserProfile;
  classes: SchoolClass[];
  allUsers: UserProfile[];
  credentials: UserCredential[];
}

export const AdminModule: React.FC<AdminModuleProps> = ({
  user,
  classes,
  allUsers,
  credentials,
}) => {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'teachers' | 'students'>('teachers');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<RoleName>('Guru Pengampu');
  const [assignedClassIds, setAssignedClassIds] = useState<string[]>(classes.map((c) => c.id));
  const [tempPassword, setTempPassword] = useState(() => generateRandomPassword());
  const [busy, setBusy] = useState(false);

  const teachers = useMemo(
    () => allUsers.filter((u) => ['Super Admin', 'Admin', 'Guru Pengampu'].includes(u.role)),
    [allUsers]
  );
  const students = useMemo(
    () => allUsers.filter((u) => !['Super Admin', 'Admin', 'Guru Pengampu'].includes(u.role)),
    [allUsers]
  );

  const missingWaTeachers = teachers.filter((t) => !t.phone);

  const toggleClass = (cid: string) => {
    setAssignedClassIds((prev) =>
      prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]
    );
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      showToast('Nama dan email wajib diisi', 'warning');
      return;
    }
    if (assignedClassIds.length === 0) {
      showToast('Pilih minimal 1 kelas ampu', 'warning');
      return;
    }
    setBusy(true);
    try {
      let uid: string;
      let authCreated = false;
      try {
        const createdUid = await createSecondaryAuthAccount(email.trim(), tempPassword);
        uid = createdUid || makeSafeId('usr');
        authCreated = true;
      } catch (authErr: unknown) {
        const code = (authErr as { code?: string })?.code || '';
        if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') {
          uid = makeSafeId('usr');
          showToast(
            'Profil disimpan (Email/Password Auth belum aktif di Firebase Console)',
            'warning',
            'Aktifkan provider Email/Password di Firebase Console agar akun bisa login dengan kata sandi, atau minta pengguna masuk via Google.'
          );
        } else {
          throw authErr;
        }
      }

      const now = new Date().toISOString();
      const meta = getRoleMeta(role);
      const primaryClass = assignedClassIds[0];

      await saveUserProfileBundle({
        profile: {
          uid,
          name: name.trim(),
          role,
          divisionId: meta.divisionId,
          divisionName: meta.divisionName,
          classId: primaryClass,
          classIds: assignedClassIds,
          photoUrl: '',
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        privateInfo: {
          uid,
          email: email.trim(),
          phone: phone.trim(),
          nis: '',
          classId: primaryClass,
          updatedAt: now,
        },
        credential: {
          uid,
          email: email.trim(),
          tempPassword: authCreated ? tempPassword : '(Login Google)',
          classId: primaryClass,
          createdBy: user.uid,
          updatedAt: now,
        },
      });

      if (role === 'Admin' || role === 'Super Admin') {
        await upsertDocument('admins', uid, {
          uid,
          email: email.trim(),
          role,
          createdAt: now,
        });
      }

      await recordAuditLog({
        user,
        action: 'CREATE',
        targetType: 'user',
        targetId: uid,
        details: `Admin membuat akun ${role}: ${name.trim()} (${email.trim()}).`,
      });

      setName('');
      setEmail('');
      setPhone('');
      setTempPassword(generateRandomPassword());
      if (authCreated) {
        showToast(`Akun ${role} berhasil dibuat & siap digunakan`, 'success');
      }
    } catch (err) {
      showToast('Gagal membuat akun', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const copyCred = (emailStr: string, passStr?: string) => {
    navigator.clipboard.writeText(`Email: ${emailStr}\nPassword: ${passStr || '-'}`);
    showToast('Kredensial disalin ke clipboard', 'success');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
          <Shield className="w-6 h-6 text-amber-500" />
          Admin Panel — Manajemen Guru & Akun Sistem
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Buat akun Guru Pengampu/Admin multi-kelas, pantau kelengkapan nomor WhatsApp, dan kelola kredensial awal.
        </p>
      </div>

      {missingWaTeachers.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
          <div>
            <p className="font-bold">
              {missingWaTeachers.length} akun Guru/Admin belum memiliki nomor WhatsApp:
            </p>
            <p className="mt-0.5">{missingWaTeachers.map((t) => t.name).join(', ')}</p>
          </div>
        </div>
      )}

      {/* Create Account Form */}
      <form
        onSubmit={handleCreateAccount}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
      >
        <h2 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-amber-500" />
          Buat Akun Baru (Guru Pengampu / Admin / Siswa)
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama lengkap + gelar..."
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email sekolah / akun..."
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="No. WhatsApp (0812...)"
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as RoleName)}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
          >
            <optgroup label="Pendidik & Pengelola">
              <option value="Guru Pengampu">Guru Pengampu</option>
              <option value="Admin">Admin</option>
              {isAdminRole(user.role) && <option value="Super Admin">Super Admin</option>}
            </optgroup>
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

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Kelas Ampu:
            </span>
            {classes.map((c) => (
              <label
                key={c.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={assignedClassIds.includes(c.id)}
                  onChange={() => toggleClass(c.id)}
                />
                {c.name}
              </label>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Password Awal:</span>
            <code className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono text-xs font-bold">
              {tempPassword}
            </code>
            <button
              type="button"
              onClick={() => setTempPassword(generateRandomPassword())}
              className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-amber-500"
              title="Acak ulang password"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {busy ? 'Memproses...' : 'Buat Akun'}
            </button>
          </div>
        </div>
      </form>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('teachers')}
          className={`px-4 py-2 rounded-xl text-xs font-bold ${
            tab === 'teachers'
              ? 'bg-amber-500 text-slate-950'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          Daftar Guru & Admin ({teachers.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('students')}
          className={`px-4 py-2 rounded-xl text-xs font-bold ${
            tab === 'students'
              ? 'bg-amber-500 text-slate-950'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          Semua Siswa ({students.length})
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs text-slate-500">
                <th className="py-3 px-4 font-semibold">Nama & Peran</th>
                <th className="py-3 px-4 font-semibold">Kelas</th>
                <th className="py-3 px-4 font-semibold">Email & WA</th>
                <th className="py-3 px-4 font-semibold text-right">Kredensial</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {(tab === 'teachers' ? teachers : students).map((u) => {
                const cred = credentials.find((c) => c.uid === u.uid);
                return (
                  <tr key={u.uid}>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 dark:text-white">{u.name}</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">{u.role}</p>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-600 dark:text-slate-300">
                      {(u.classIds || [u.classId]).join(', ')}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <p>{u.email || '-'}</p>
                      <p className="font-mono text-slate-500">{u.phone || 'WA belum diisi'}</p>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {cred ? (
                        <button
                          type="button"
                          onClick={() => copyCred(cred.email, cred.tempPassword)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Salin Info Login
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">OAuth / Self-register</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 3. DEBUG USERS MODULE (Account Audit & Self-Repair)
// ============================================================================
interface DebugUsersModuleProps {
  user: UserProfile;
  allUsers: UserProfile[];
  classes: SchoolClass[];
}

export const DebugUsersModule: React.FC<DebugUsersModuleProps> = ({ user, allUsers, classes }) => {
  const { showToast } = useToast();
  const classIdsSet = useMemo(() => new Set(classes.map((c) => c.id)), [classes]);

  const diagnostics = useMemo(() => {
    const emailCounts = new Map<string, number>();
    allUsers.forEach((u) => {
      if (u.email) {
        const key = u.email.toLowerCase();
        emailCounts.set(key, (emailCounts.get(key) || 0) + 1);
      }
    });

    const invalidClass = allUsers.filter((u) => !classIdsSet.has(u.classId));
    const mismatchDiv = allUsers.filter((u) => {
      const meta = getRoleMeta(u.role);
      return u.divisionId !== meta.divisionId || u.divisionName !== meta.divisionName;
    });
    const duplicateEmails = allUsers.filter(
      (u) => u.email && (emailCounts.get(u.email.toLowerCase()) || 0) > 1
    );
    const missingWa = allUsers.filter((u) => !u.phone);

    return { invalidClass, mismatchDiv, duplicateEmails, missingWa };
  }, [allUsers, classIdsSet]);

  const repairDivisions = async () => {
    try {
      let fixed = 0;
      for (const u of diagnostics.mismatchDiv) {
        const meta = getRoleMeta(u.role);
        await updateDocumentFields('users', u.uid, {
          divisionId: meta.divisionId,
          divisionName: meta.divisionName,
          updatedAt: new Date().toISOString(),
        });
        fixed++;
      }
      await recordAuditLog({
        user,
        action: 'UPDATE',
        targetType: 'debugUsers',
        targetId: 'repairDivisions',
        details: `Memperbaiki ${fixed} ketidaksesuaian divisi/peran pengguna.`,
      });
      showToast(`${fixed} akun berhasil disinkronkan`, 'success');
    } catch (err) {
      showToast('Gagal menyinkronkan divisi akun', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Wrench className="w-6 h-6 text-amber-500" />
            Audit Akun & Diagnostik Konsistensi Data
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Mendeteksi duplikasi email, kelas yatim, ketidaksesuaian divisi-jabatan, dan kontak kosong.
          </p>
        </div>
        {diagnostics.mismatchDiv.length > 0 && (
          <button
            type="button"
            onClick={repairDivisions}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Sinkronkan {diagnostics.mismatchDiv.length} Divisi
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Akun Aktif', value: allUsers.length, tone: 'text-slate-900 dark:text-white' },
          { label: 'Kelas Tidak Terdaftar', value: diagnostics.invalidClass.length, tone: 'text-rose-500' },
          { label: 'Divisi Tidak Sinkron', value: diagnostics.mismatchDiv.length, tone: 'text-amber-500' },
          { label: 'Duplikasi Email', value: diagnostics.duplicateEmails.length, tone: 'text-rose-500' },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
          >
            <p className="text-xs text-slate-500">{k.label}</p>
            <p className={`font-mono tabular-nums text-2xl font-bold mt-1 ${k.tone}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
          Akun Belum Melengkapi Nomor WhatsApp ({diagnostics.missingWa.length})
        </h2>
        {diagnostics.missingWa.length === 0 ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            Seluruh pengguna sudah memiliki nomor WhatsApp aktif.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {diagnostics.missingWa.map((u) => (
              <div
                key={u.uid}
                className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs"
              >
                <p className="font-semibold text-slate-900 dark:text-white">{u.name}</p>
                <p className="text-slate-500">
                  {u.role} · {u.classId}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 4. ACTIVITY LOG MODULE
// ============================================================================
interface ActivityLogModuleProps {
  logs: AuditLogItem[];
}

export const ActivityLogModule: React.FC<ActivityLogModuleProps> = ({ logs }) => {
  const [actionFilter, setActionFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs
      .filter((l) => (actionFilter === 'ALL' ? true : l.action === actionFilter))
      .filter(
        (l) =>
          !q ||
          l.userName.toLowerCase().includes(q) ||
          l.details.toLowerCase().includes(q) ||
          l.targetType.toLowerCase().includes(q)
      );
  }, [logs, actionFilter, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
          <Activity className="w-6 h-6 text-amber-500" />
          Activity Log & Jejak Audit
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Catatan aktivitas sistem secara kronologis ({filtered.length} entri).
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari pelaku atau detail aktivitas..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
        >
          <option value="ALL">Semua Aksi</option>
          {['LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'ASSESS', 'SUBMIT'].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">Belum ada catatan aktivitas.</p>
        ) : (
          filtered.slice(0, 150).map((l) => (
            <div key={l.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <p className="text-sm text-slate-900 dark:text-white">
                  <span className="font-semibold">{l.userName}</span>{' '}
                  <span className="text-xs text-slate-500">({l.role})</span> ·{' '}
                  <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                    {l.action}
                  </span>{' '}
                  <span className="text-xs text-slate-400">[{l.targetType}]</span>
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{l.details}</p>
              </div>
              <span className="font-mono tabular-nums text-[11px] text-slate-400 shrink-0">
                {new Date(l.timestamp).toLocaleString('id-ID')}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 5. BACKUP MODULE (JSON Backup & Restore across 30 Firestore collections)
// ============================================================================
interface BackupModuleProps {
  user: UserProfile;
  currentClass: SchoolClass | undefined;
  classMembers?: UserProfile[];
}

export const BackupModule: React.FC<BackupModuleProps> = ({
  user,
  currentClass,
  classMembers = [],
}) => {
  const { showToast } = useToast();
  const [busyExport, setBusyExport] = useState(false);
  const [busyRestore, setBusyRestore] = useState(false);
  const [busyClearDemo, setBusyClearDemo] = useState(false);
  const [busyMigrate, setBusyMigrate] = useState(false);
  const [busyInspect, setBusyInspect] = useState(false);
  const [busyRepair, setBusyRepair] = useState(false);
  const [inspection, setInspection] = useState<LegacyInspectionResult | null>(null);
  const [migrationResult, setMigrationResult] = useState<LegacyMigrationResult | null>(null);
  const [repairResult, setRepairResult] = useState<LegacyRepairResult | null>(null);
  const [previewPayload, setPreviewPayload] = useState<BackupPayload | null>(null);
  const [confirmClearDemo, setConfirmClearDemo] = useState(false);
  const [confirmRepair, setConfirmRepair] = useState(false);

  const handleInspectLegacy = async () => {
    setBusyInspect(true);
    try {
      const info = await inspectLegacyDefaultDatabase();
      setInspection(info);
    } finally {
      setBusyInspect(false);
    }
  };

  const handleMigrateLegacy = async () => {
    setBusyMigrate(true);
    try {
      const res = await migrateFromLegacyDefaultDatabase(user);
      setMigrationResult(res);
      await handleInspectLegacy();
      await recordAuditLog({
        user,
        action: 'UPDATE',
        targetType: 'migration',
        targetId: firebaseConfig.projectId,
        details: `Migrasi database (default) -> SP-PPT v2: ${res.totalCopied} dokumen (${res.classesCount} kelas, ${res.usersCount} pengguna).`,
      });
      if (res.totalCopied > 0) {
        showToast(`${res.totalCopied} dokumen data lama berhasil ditarik!`, 'success');
      } else {
        showToast(
          'Tidak ada dokumen terbaca dari database (default)',
          'warning',
          'Pastikan data lama tersedia atau gunakan fitur Restore File JSON di bawah.'
        );
      }
    } catch (err) {
      showToast('Gagal migrasi data lama', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyMigrate(false);
    }
  };

  const handleExport = async () => {
    if (!currentClass) return;
    setBusyExport(true);
    try {
      const payload = await createClassBackup(currentClass.id, currentClass.name);
      downloadBackupJSON(payload);
      await recordAuditLog({
        user,
        action: 'CREATE',
        targetType: 'backup',
        targetId: currentClass.id,
        details: `Mengekspor backup JSON kelas ${currentClass.name} (${payload.totalRecords} dokumen).`,
      });
      showToast(`Backup ${payload.totalRecords} dokumen berhasil diunduh`, 'success');
    } catch (err) {
      showToast('Gagal membuat backup', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyExport(false);
    }
  };

  const handleSelectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = validateBackupFile(parsed);
      if (!res.valid || !res.payload) {
        showToast('File backup tidak valid', 'error', res.error);
        return;
      }
      setPreviewPayload(res.payload);
    } catch {
      showToast('File JSON rusak atau tidak dapat dibaca', 'error');
    }
  };

  const handleRestore = async () => {
    if (!previewPayload) return;
    setBusyRestore(true);
    try {
      const count = await restoreClassBackup(previewPayload);
      await recordAuditLog({
        user,
        action: 'UPDATE',
        targetType: 'restore',
        targetId: previewPayload.classId,
        details: `Memulihkan ${count} dokumen dari backup ${previewPayload.exportedAt}.`,
      });
      setPreviewPayload(null);
      showToast(`${count} dokumen berhasil dipulihkan ke Firestore`, 'success');
    } catch (err) {
      showToast('Gagal memulihkan backup', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyRestore(false);
    }
  };

  const handleClearDemo = async () => {
    setBusyClearDemo(true);
    try {
      const count = await clearDemoSeedData(user);
      await recordAuditLog({
        user,
        action: 'DELETE',
        targetType: 'seedData',
        targetId: 'demo',
        details: `Membersihkan ${count} entri data contoh (demo) sebelum impor data lama.`,
      });
      showToast(`Data contoh berhasil dibersihkan (${count} dokumen dihapus)`, 'success');
    } catch (err) {
      showToast('Gagal membersihkan data contoh', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyClearDemo(false);
    }
  };

  const handleRepairLegacyData = async () => {
    if (!currentClass) return;
    setBusyRepair(true);
    try {
      const res = await repairLegacyClassData(currentClass.id, classMembers);
      setRepairResult(res);
      await recordAuditLog({
        user,
        action: 'UPDATE',
        targetType: 'repairLegacy',
        targetId: currentClass.id,
        details: `Normalisasi data lama kelas ${currentClass.id}: ${res.totalUpdated} dokumen diperbarui (sesi=${res.sessionsFixed}, tugas=${res.deadlinesFixed}, pengumpulan=${res.submissionsFixed}, RAB=${res.rabFixed}).`,
      });
      if (res.totalUpdated > 0) {
        showToast(`${res.totalUpdated} dokumen lama berhasil dinormalisasi!`, 'success');
      } else {
        showToast('Seluruh data lama kelas sudah sesuai format terbaru', 'info');
      }
    } catch (err) {
      showToast('Gagal memperbaiki data lama', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyRepair(false);
      setConfirmRepair(false);
    }
  };

  const nonEmptyCollections = previewPayload
    ? Object.entries(previewPayload.collections).filter(([, rows]) => rows.length > 0)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
          <Database className="w-6 h-6 text-amber-500" />
          Backup, Restore & Migrasi Data Lama
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Unduh salinan lengkap koleksi Firestore untuk kelas {currentClass?.name || ''} atau tarik langsung data lama dari project Firebase Anda.
        </p>
      </div>

      {/* 1-Click Legacy Database Migration Card */}
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-amber-500" />
              Sinkronkan Data Lama dari Project{' '}
              <span className="font-mono text-amber-600 dark:text-amber-400">
                {firebaseConfig.projectId}
              </span>{' '}
              (Database (default))
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Menarik kelas, profil pengguna, nilai 360°, presensi, tugas, kas, RAB, jadwal, properti, cue musik, face chart, kostum, naskah, dan prompt book dari database <code className="font-mono">(default)</code> ke database terkelola aplikasi ini secara otomatis tanpa menimpa akun yang sedang login.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={busyInspect}
              onClick={handleInspectLegacy}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-amber-500/40 bg-white/80 dark:bg-slate-950/70 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-60 text-slate-800 dark:text-slate-100 text-xs font-semibold cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-amber-500" />
              {busyInspect ? 'Memeriksa...' : 'Cek Isi (default)'}
            </button>
            <button
              type="button"
              disabled={busyMigrate}
              onClick={handleMigrateLegacy}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-xs font-bold cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${busyMigrate ? 'animate-spin' : ''}`} />
              {busyMigrate ? 'Menarik Data Lama...' : 'Tarik Data Lama Sekarang'}
            </button>
          </div>
        </div>

        {inspection && (
          <div className="rounded-xl border border-amber-500/30 bg-white/75 dark:bg-slate-950/60 p-3.5 text-xs flex flex-wrap items-center justify-between gap-3">
            {inspection.readable ? (
              <div className="flex flex-wrap items-center gap-3 text-slate-700 dark:text-slate-200">
                <span className="font-bold text-slate-900 dark:text-white">
                  Status Database <code className="font-mono">(default)</code>:
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono">
                  Kelas: <b>{inspection.classesCount}</b>
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono">
                  Akun: <b>{inspection.usersCount}</b>
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono">
                  Deadline: <b>{inspection.deadlinesCount}</b>
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono">
                  Nilai: <b>{inspection.assessmentsCount}</b>
                </span>
              </div>
            ) : (
              <p className="text-rose-700 dark:text-rose-300 leading-relaxed">
                {inspection.errorMessage}
              </p>
            )}
          </div>
        )}

        {migrationResult && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/70 p-4 text-xs space-y-2">
            <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Hasil Penarikan Data: <span className="font-mono">{migrationResult.totalCopied}</span> dokumen disalin ({migrationResult.classesCount} kelas, {migrationResult.usersCount} akun).
            </p>
            {migrationResult.skippedCollections.length > 0 && (
              <div className="text-amber-700 dark:text-amber-300 leading-relaxed space-y-1">
                <p>
                  Koleksi yang dilewati/terkunci ({migrationResult.skippedCollections.length}):{' '}
                  <span className="font-mono">{migrationResult.skippedCollections.join(', ')}</span>.
                </p>
                {Object.keys(migrationResult.errors || {}).length > 0 && (
                  <ul className="list-disc pl-5 text-[11px] space-y-0.5 text-slate-600 dark:text-slate-300">
                    {Object.entries(migrationResult.errors)
                      .slice(0, 6)
                      .map(([col, msg]) => (
                        <li key={col}>
                          <span className="font-mono font-semibold">{col}</span>: {msg}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}
            {migrationResult.totalCopied === 0 && (
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Jika data lama tersimpan sebagai file ekspor (.json) dari versi aplikasi sebelumnya, silakan unggah melalui panel <b>Restore / Impor Data Lama (.json)</b> di bawah ini.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Idempotent Repair Card for Legacy Progress, Attendance & RAB */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-500" />
              Perbaiki Data Lama (Progres, Presensi &amp; RAB)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Menormalisasi format lama <code className="font-mono">stageId</code>, status tugas <code className="font-mono">ACTIVE</code>, target siswa <code className="font-mono">CUSTOM</code>, status selesai/foto bukti lama, dan item RAB untuk kelas <strong>{currentClass?.name || '-'}</strong> tanpa menulis ulang dokumen yang sudah valid.
            </p>
          </div>
          {confirmRepair ? (
            <div className="inline-flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={busyRepair || !currentClass}
                onClick={() => void handleRepairLegacyData()}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-60"
              >
                {busyRepair ? 'Memperbaiki...' : 'Ya, Jalankan Normalisasi'}
              </button>
              <button
                type="button"
                disabled={busyRepair}
                onClick={() => setConfirmRepair(false)}
                className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                Batal
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busyRepair || !currentClass}
              onClick={() => setConfirmRepair(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-bold shrink-0 cursor-pointer disabled:opacity-60"
            >
              <Wrench className="w-4 h-4" />
              Perbaiki Data Lama
            </button>
          )}
        </div>

        {repairResult && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3.5 text-xs flex flex-wrap items-center gap-3 text-slate-700 dark:text-slate-200">
            <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Total diperbarui: <b className="font-mono">{repairResult.totalUpdated}</b>
            </span>
            <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 font-mono">
              Sesi Presensi: <b>{repairResult.sessionsFixed}</b>
            </span>
            <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 font-mono">
              Deadline: <b>{repairResult.deadlinesFixed}</b>
            </span>
            <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 font-mono">
              Progres Siswa: <b>{repairResult.submissionsFixed}</b>
            </span>
            <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 font-mono">
              RAB: <b>{repairResult.rabFixed}</b>
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
            Ekspor Backup JSON
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Mencakup profil siswa, nilai 360°, riwayat presensi, tugas, kas, RAB, properti, cue musik, face chart, kostum, prompt book, dan notulensi.
          </p>
          <button
            type="button"
            disabled={busyExport || !currentClass}
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {busyExport ? 'Mengunduh Backup...' : 'Unduh Backup Kelas Sekarang'}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
            Restore / Impor Data Lama (.json)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Mendukung format backup SP-PPT v1 & v2. Data pengguna lama otomatis dipetakan sesuai struktur keamanan baru (PII terpisah) tanpa kehilangan riwayat nilai maupun presensi.
          </p>
          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
            <Upload className="w-4 h-4 text-amber-500" />
            Pilih File Backup (.json)
            <input type="file" accept=".json,application/json" onChange={handleSelectFile} className="hidden" />
          </label>

          {previewPayload && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3 text-xs">
              <p className="font-bold text-amber-800 dark:text-amber-200">
                Pratinjau Backup: {previewPayload.className} ({previewPayload.classId})
              </p>
              <p className="text-slate-700 dark:text-slate-300">
                Diekspor: {new Date(previewPayload.exportedAt).toLocaleString('id-ID')} · Total:{' '}
                <span className="font-mono font-bold">{previewPayload.totalRecords}</span> dokumen
              </p>
              {nonEmptyCollections.length > 0 && (
                <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 pt-1">
                  {nonEmptyCollections.map(([k, rows]) => (
                    <div key={k} className="flex items-center justify-between px-2 py-1 rounded bg-white/70 dark:bg-slate-950/60">
                      <span className="truncate">{k}</span>
                      <span className="font-mono font-bold ml-2">{rows.length}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPreviewPayload(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={busyRestore}
                  onClick={handleRestore}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold"
                >
                  {busyRestore ? 'Memulihkan...' : 'Konfirmasi & Restore'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
            Bersihkan Data Contoh (Demo)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Hapus 14 siswa contoh dan data simulasi bawaan agar tidak bercampur dengan data lama sekolah Anda. Sistem tidak akan mengisi ulang data contoh setelah dibersihkan.
          </p>
        </div>
        {confirmClearDemo ? (
          <div className="inline-flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={busyClearDemo}
              onClick={() => {
                setConfirmClearDemo(false);
                handleClearDemo();
              }}
              className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
            >
              {busyClearDemo ? 'Membersihkan...' : 'Ya, Hapus Data Demo'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmClearDemo(false)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
            >
              Batal
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busyClearDemo}
            onClick={() => setConfirmClearDemo(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 text-xs font-bold shrink-0 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            {busyClearDemo ? 'Membersihkan...' : 'Hapus Data Demo'}
          </button>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 6. SETTINGS MODULE (Profile, Bobot Penilaian, 12 Drive Folders, Pemeliharaan)
// ============================================================================
interface SettingsModuleProps {
  user: UserProfile;
  classId: string;
  assessorWeights: AssessorWeightsConfig;
  driveFolders: DriveFolderItem[];
  onProfileUpdated: (updated: UserProfile) => void;
}

export const SettingsModule: React.FC<SettingsModuleProps> = ({
  user,
  classId,
  assessorWeights,
  driveFolders,
  onProfileUpdated,
}) => {
  const { showToast } = useToast();
  const canManageSystem = isTeacherOrAdmin(user.role);
  const [tab, setTab] = useState<'profile' | 'weights' | 'drive' | 'maintenance'>('profile');

  // Profile state
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || '');
  const [nis, setNis] = useState(user.nis || '');
  const [photoUrl, setPhotoUrl] = useState(user.photoUrl || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Weights state
  const [stageWeights, setStageWeights] = useState<Record<ProductionStage, number>>(
    assessorWeights.stageWeights || DEFAULT_STAGE_WEIGHTS
  );
  const [roleWeights, setRoleWeights] = useState<Record<string, Record<AssessorCategory, number>>>(
    assessorWeights.roleWeights || DEFAULT_ASSESSOR_WEIGHTS
  );
  const [savingWeights, setSavingWeights] = useState(false);

  // Drive Folders state
  const [folders, setFolders] = useState<DriveFolderItem[]>(
    driveFolders.length > 0 ? driveFolders : DEFAULT_DRIVE_FOLDERS
  );
  const [savingFolders, setSavingFolders] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressImageToBase64(file, 200);
      setPhotoUrl(dataUrl);
    } catch (err) {
      showToast('Gagal membaca foto profil', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Nama lengkap wajib diisi', 'warning');
      return;
    }
    setSavingProfile(true);
    try {
      const now = new Date().toISOString();
      // Update public non-PII profile strictly matching firestore.rules self-update keys
      await updateDocumentFields('users', user.uid, {
        name: name.trim(),
        photoUrl,
        updatedAt: now,
      });
      await upsertDocument('userPrivate', user.uid, {
        uid: user.uid,
        email: user.email || auth.currentUser?.email || '',
        phone: phone.trim(),
        nis: nis.trim(),
        classId: user.classId,
        updatedAt: now,
      });
      onProfileUpdated({
        ...user,
        name: name.trim(),
        photoUrl,
        phone: phone.trim(),
        nis: nis.trim(),
        updatedAt: now,
      });
      showToast('Profil pribadi berhasil diperbarui', 'success');
    } catch (err) {
      showToast('Gagal menyimpan profil', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveWeights = async () => {
    const stageSum = Object.values(stageWeights).reduce((acc, v) => acc + Number(v || 0), 0);
    if (stageSum !== 100) {
      showToast('Total bobot 4 tahap produksi harus tepat 100%', 'warning', `Saat ini: ${stageSum}%`);
      return;
    }
    for (const [roleKey, cats] of Object.entries(roleWeights)) {
      const sum = Number(cats.GURU) + Number(cats.ATASAN) + Number(cats.REKAN) + Number(cats.BAWAHAN);
      if (sum !== 100) {
        showToast(`Bobot penilai untuk "${roleKey}" harus berjumlah 100%`, 'warning', `Saat ini: ${sum}%`);
        return;
      }
    }

    setSavingWeights(true);
    try {
      await saveAssessorWeights(classId, {
        id: 'assessorWeights',
        stageWeights,
        roleWeights,
        updatedAt: new Date().toISOString(),
      });
      showToast('Bobot penilaian kelas disimpan', 'success');
    } catch (err) {
      showToast('Gagal menyimpan bobot', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setSavingWeights(false);
    }
  };

  const handleSaveDriveFolders = async () => {
    setSavingFolders(true);
    try {
      await saveDriveFolders(folders);
      showToast('Daftar 12 folder Google Drive diperbarui', 'success');
    } catch (err) {
      showToast('Gagal menyimpan folder Drive', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setSavingFolders(false);
    }
  };

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      const created = await ensureSeededForClass(user);
      if (created) {
        showToast('Data contoh kelas IX-A & IX-B berhasil diinisialisasi', 'success');
      } else {
        showToast('Kelas IX-A sudah ada — tidak menimpa data aktif', 'info');
      }
    } catch (err) {
      showToast('Gagal inisialisasi data', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-amber-500" />
          Pengaturan Akun & Sistem
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Kelola profil pribadi, foto anggota, bobot penilaian 360°, serta tautan Google Drive terpusat.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {[
          { id: 'profile' as const, label: 'Profil & Foto', show: true },
          { id: 'weights' as const, label: 'Bobot Penilaian', show: canManageSystem },
          { id: 'drive' as const, label: '12 Folder Drive', show: canManageSystem },
          { id: 'maintenance' as const, label: 'Pemeliharaan Data', show: canManageSystem },
        ]
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                tab === t.id
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
      </div>

      {tab === 'profile' && (
        <form
          onSubmit={handleSaveProfile}
          className="max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
        >
          <div className="flex items-center gap-4">
            {photoUrl ? (
              <img src={photoUrl} alt={name} className="w-16 h-16 rounded-full object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-display font-bold text-lg text-amber-500">
                {name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer">
              <ImagePlus className="w-4 h-4 text-amber-500" />
              Ganti Foto Profil
              <input type="file" accept="image/*" onChange={handleUploadAvatar} className="hidden" />
            </label>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Nama Lengkap *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">No. WhatsApp</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0812xxxxxxxx"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">NIS / NIP</label>
              <input
                type="text"
                value={nis}
                onChange={(e) => setNis(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
              />
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-500 space-y-1">
            <p className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              Email: <span className="font-semibold text-slate-700 dark:text-slate-300">{user.email || '-'}</span>
            </p>
            <p className="flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5" />
              Jabatan: <span className="font-semibold text-amber-600 dark:text-amber-400">{user.role}</span> ({user.divisionName})
            </p>
          </div>

          <button
            type="submit"
            disabled={savingProfile}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer"
          >
            {savingProfile ? 'Menyimpan...' : 'Simpan Profil Saya'}
          </button>

          <div className="pt-4 mt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                Mode Tampilan Aplikasi
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Pilih Mode Terang, Mode Gelap, atau Auto mengikuti sistem perangkat.
              </p>
            </div>
            <ThemeSwitcher />
          </div>
        </form>
      )}

      {tab === 'weights' && canManageSystem && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
              Bobot 4 Tahap Produksi (Total Wajib 100%)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {PRODUCTION_STAGES.map((st) => (
                <div key={st}>
                  <label className="block text-xs font-semibold mb-1">{STAGE_LABELS[st].label}</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={stageWeights[st]}
                    onChange={(e) =>
                      setStageWeights({ ...stageWeights, [st]: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 overflow-x-auto">
            <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
              Bobot Kategori Penilai 360° per Peran (Baris Wajib 100%)
            </h2>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Kelompok Peran</th>
                  <th className="py-2 px-2 font-semibold">Guru (%)</th>
                  <th className="py-2 px-2 font-semibold">Atasan (%)</th>
                  <th className="py-2 px-2 font-semibold">Rekan (%)</th>
                  <th className="py-2 px-2 font-semibold">Bawahan (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {Object.entries(roleWeights).map(([roleKey, cats]) => (
                  <tr key={roleKey}>
                    <td className="py-2 pr-3 font-semibold text-slate-900 dark:text-white">
                      {roleKey}
                    </td>
                    {(['GURU', 'ATASAN', 'REKAN', 'BAWAHAN'] as AssessorCategory[]).map((cat) => (
                      <td key={cat} className="py-2 px-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={cats[cat]}
                          onChange={(e) =>
                            setRoleWeights({
                              ...roleWeights,
                              [roleKey]: { ...cats, [cat]: Number(e.target.value) },
                            })
                          }
                          className="w-20 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              disabled={savingWeights}
              onClick={handleSaveWeights}
              className="px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold cursor-pointer"
            >
              {savingWeights ? 'Menyimpan...' : 'Simpan Bobot Penilaian'}
            </button>
          </div>
        </div>
      )}

      {tab === 'drive' && canManageSystem && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-amber-500" />
              Konfigurasi 12 Folder Google Drive Produksi
            </h2>
            <button
              type="button"
              disabled={savingFolders}
              onClick={handleSaveDriveFolders}
              className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold cursor-pointer"
            >
              {savingFolders ? 'Menyimpan...' : 'Simpan Semua URL'}
            </button>
          </div>
          <div className="space-y-3">
            {folders.map((f, idx) => (
              <div
                key={f.id}
                className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center rounded-xl border border-slate-200 dark:border-slate-800 p-3"
              >
                <div className="md:col-span-4">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{f.name}</p>
                  <p className="text-[11px] text-slate-500">
                    PIC: {f.picRole} · {f.access}
                  </p>
                </div>
                <input
                  type="url"
                  value={f.url}
                  onChange={(e) => {
                    const next = [...folders];
                    next[idx] = { ...f, url: e.target.value };
                    setFolders(next);
                  }}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="md:col-span-8 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'maintenance' && canManageSystem && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
            Inisialisasi Data Awal Sekolah ({SCHOOL_INFO.school})
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Memastikan kelas demo IX-A & IX-B beserta kerabat kerja contoh (*Legenda Pesut Mahakam*) tersedia di Firestore jika belum pernah dibuat. Aman dijalankan karena tidak menimpa data yang sudah ada.
          </p>
          <button
            type="button"
            disabled={seeding}
            onClick={handleSeedDemo}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 text-amber-400" />
            {seeding ? 'Memeriksa...' : 'Inisialisasi Data Awal Kelas'}
          </button>
        </div>
      )}
    </div>
  );
};
