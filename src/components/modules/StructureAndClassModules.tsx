import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Calendar,
  Download,
  Edit3,
  ExternalLink,
  ImagePlus,
  MessageCircle,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  DIVISIONS,
  getRoleMeta,
  isCoreCommitteeRole,
  isTeacherOrAdmin,
} from '../../core/constants';
import { InterClassEvent, RoleName, SchoolClass, UserProfile } from '../../core/types';
import {
  makeSafeId,
  recordAuditLog,
  removeDocument,
  saveUserProfileBundle,
  updateDocumentFields,
  upsertDocument,
} from '../../services/firestoreService';
import { buildWhatsAppUrl, compressImageToBase64 } from '../../utils/imageCompress';
import { useToast } from '../common/Toast';

// ============================================================================
// 1. STRUCTURE MODULE (Kerabat Kerja, Troupe Logo & Protected Photo Modal)
// ============================================================================
interface StructureModuleProps {
  user: UserProfile;
  currentClass: SchoolClass | undefined;
  members: UserProfile[];
}

export const StructureModule: React.FC<StructureModuleProps> = ({
  user,
  currentClass,
  members,
}) => {
  const { showToast } = useToast();
  const canEditTroupe = isCoreCommitteeRole(user.role);
  const canEditRole = isTeacherOrAdmin(user.role);

  const currentTroupeName = currentClass?.troupeName || currentClass?.kerabatKerja || '';
  const currentTroupeLogo =
    currentClass?.troupeLogo ||
    (currentClass as (SchoolClass & { kerabatLogo?: string }) | undefined)?.kerabatLogo ||
    '';

  const [search, setSearch] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('ALL');
  const [editingTroupe, setEditingTroupe] = useState(false);
  const [troupeName, setTroupeName] = useState(currentTroupeName);
  const [troupeLogo, setTroupeLogo] = useState(currentTroupeLogo);
  const [protectedPhoto, setProtectedPhoto] = useState<{ name: string; role: string; url: string } | null>(null);
  const [editingMember, setEditingMember] = useState<UserProfile | null>(null);
  const [memberRole, setMemberRole] = useState<RoleName>('Pemeran');
  const [busy, setBusy] = useState(false);

  const divisions = useMemo(
    () => Array.from(new Set(members.map((m) => m.divisionName).filter(Boolean))),
    [members]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members
      .filter((m) => (divisionFilter === 'ALL' ? true : m.divisionName === divisionFilter))
      .filter(
        (m) =>
          !q ||
          m.name.toLowerCase().includes(q) ||
          m.role.toLowerCase().includes(q) ||
          m.divisionName.toLowerCase().includes(q)
      );
  }, [members, search, divisionFilter]);

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressImageToBase64(file, 220);
      setTroupeLogo(dataUrl);
    } catch (err) {
      showToast('Gagal membaca logo', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const handleSaveTroupe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentClass) return;
    setBusy(true);
    try {
      await updateDocumentFields('classes', currentClass.id, {
        troupeName: troupeName.trim() || currentClass.name,
        troupeLogo,
        updatedAt: new Date().toISOString(),
      });
      setEditingTroupe(false);
      showToast('Identitas sanggar/troupe diperbarui', 'success');
    } catch (err) {
      showToast('Gagal memperbarui identitas troupe', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadLogo = () => {
    if (!currentTroupeLogo) return;
    const a = document.createElement('a');
    a.href = currentTroupeLogo;
    a.download = `logo_${(currentTroupeName || currentClass?.id || 'troupe').replace(/\s+/g, '_')}.jpg`;
    a.click();
  };

  const handleUpdateMemberRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember || !canEditRole) return;
    setBusy(true);
    try {
      const meta = getRoleMeta(memberRole);
      const now = new Date().toISOString();
      await saveUserProfileBundle({
        profile: {
          ...editingMember,
          role: memberRole,
          divisionId: meta.divisionId,
          divisionName: meta.divisionName,
          updatedAt: now,
        },
        privateInfo: {
          uid: editingMember.uid,
          email: editingMember.email || '',
          phone: editingMember.phone || '',
          nis: editingMember.nis || '',
          classId: editingMember.classId,
          updatedAt: now,
        },
      });
      await recordAuditLog({
        user,
        action: 'UPDATE',
        targetType: 'user',
        targetId: editingMember.uid,
        details: `Mengubah peran ${editingMember.name} menjadi ${memberRole}.`,
      });
      setEditingMember(null);
      showToast('Peran anggota diperbarui', 'success');
    } catch (err) {
      showToast('Gagal mengubah peran', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Troupe Header Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {currentTroupeLogo ? (
            <img
              src={currentTroupeLogo}
              alt={currentTroupeName || currentClass?.name || 'Logo Troupe'}
              className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-slate-800"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Users className="w-6 h-6 text-amber-500" />
            </div>
          )}
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              {currentTroupeName || currentClass?.name || 'Kerabat Kerja Produksi'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {currentClass?.name} · Kode Kelas:{' '}
              <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                {currentClass?.code || '-'}
              </span>{' '}
              · {members.length} anggota aktif
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {currentTroupeLogo && (
            <button
              type="button"
              onClick={handleDownloadLogo}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Download className="w-3.5 h-3.5" />
              Unduh Logo
            </button>
          )}
          {canEditTroupe && currentClass && (
            <button
              type="button"
              onClick={() => {
                setTroupeName(currentTroupeName);
                setTroupeLogo(currentTroupeLogo);
                setEditingTroupe(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Troupe
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama anggota atau jabatan..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
          />
        </div>
        <select
          value={divisionFilter}
          onChange={(e) => setDivisionFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
        >
          <option value="ALL">Semua Divisi ({members.length})</option>
          {divisions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {/* Member Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((m) => (
          <div
            key={m.uid}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              {m.photoUrl ? (
                <button
                  type="button"
                  onClick={() =>
                    setProtectedPhoto({ name: m.name, role: m.role, url: m.photoUrl || '' })
                  }
                  className="w-11 h-11 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 cursor-pointer"
                >
                  <img
                    src={m.photoUrl}
                    alt={m.name}
                    className="w-full h-full object-cover protected-media"
                    draggable={false}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                </button>
              ) : (
                <div className="w-11 h-11 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-display font-bold text-sm text-amber-600 dark:text-amber-400 shrink-0">
                  {m.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                  {m.name}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium truncate">
                  {m.role}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {m.divisionName}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {m.phone && (
                <a
                  href={buildWhatsAppUrl(
                    m.phone,
                    `Halo ${m.name}, koordinasi produksi teater kelas ${currentClass?.name || ''}:`
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                  title="Chat WhatsApp"
                >
                  <MessageCircle className="w-4 h-4" />
                </a>
              )}
              {canEditRole && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingMember(m);
                    setMemberRole(m.role);
                  }}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-amber-500"
                  title="Ubah Peran"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Edit Troupe Modal */}
      {editingTroupe && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveTroupe}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                Identitas Sanggar / Troupe
              </h2>
              <button type="button" onClick={() => setEditingTroupe(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Nama Sanggar / Troupe</label>
              <input
                type="text"
                value={troupeName}
                onChange={(e) => setTroupeName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer">
                <ImagePlus className="w-4 h-4 text-amber-500" />
                Unggah Logo Troupe
                <input type="file" accept="image/*" onChange={handleUploadLogo} className="hidden" />
              </label>
              {troupeLogo && (
                <img src={troupeLogo} alt="Logo troupe" className="mt-3 w-20 h-20 rounded-xl object-cover" />
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingTroupe(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-500"
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

      {/* Quick Role Edit Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleUpdateMemberRole}
            className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                Ubah Peran: {editingMember.name}
              </h2>
              <button type="button" onClick={() => setEditingMember(null)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <select
              value={memberRole}
              onChange={(e) => setMemberRole(e.target.value as RoleName)}
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
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="px-3 py-2 text-xs text-slate-500"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold"
              >
                Simpan Peran
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Protected Member Photo Viewer */}
      {protectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 protected-media"
          onClick={() => setProtectedPhoto(null)}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === 'PrintScreen') e.preventDefault();
          }}
        >
          <div
            className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900 p-4 text-center space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={protectedPhoto.url}
              alt={protectedPhoto.name}
              className="w-full max-h-[65vh] object-contain rounded-xl protected-media"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
            />
            <div>
              <p className="font-display font-bold text-white text-base">{protectedPhoto.name}</p>
              <p className="text-xs text-amber-400">{protectedPhoto.role}</p>
            </div>
            <button
              type="button"
              onClick={() => setProtectedPhoto(null)}
              className="px-4 py-1.5 rounded-lg bg-slate-800 text-xs font-semibold text-slate-200"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 2. MANAGE CLASS MODULE (Multi-Class Switcher & Create/Edit Class)
// ============================================================================
interface ManageClassModuleProps {
  user: UserProfile;
  classes: SchoolClass[];
  activeClassId: string;
  onSelectClass: (classId: string) => void;
}

export const ManageClassModule: React.FC<ManageClassModuleProps> = ({
  user,
  classes,
  activeClassId,
  onSelectClass,
}) => {
  const { showToast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SchoolClass | null>(null);
  const [classIdInput, setClassIdInput] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [troupeName, setTroupeName] = useState('');
  const [academicYear, setAcademicYear] = useState('2025/2026');
  const [busy, setBusy] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setClassIdInput('IX-C');
    setName('Kelas IX-C');
    setCode('TEATER-IXC-2026');
    setTroupeName('Sanggar Teater IX-C');
    setAcademicYear('2025/2026');
    setShowModal(true);
  };

  const openEdit = (c: SchoolClass) => {
    setEditing(c);
    setClassIdInput(c.id);
    setName(c.name);
    setCode(c.code);
    setTroupeName(c.troupeName || c.kerabatKerja || '');
    setAcademicYear(c.academicYear || '2025/2026');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const safeId = classIdInput.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
    if (!safeId || !name.trim() || !code.trim()) {
      showToast('ID kelas, nama kelas, dan kode registrasi wajib diisi', 'warning');
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const legacyLogo = (editing as (SchoolClass & { kerabatLogo?: string }) | null)?.kerabatLogo || '';
      await upsertDocument('classes', safeId, {
        id: safeId,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        troupeName: troupeName.trim() || name.trim(),
        troupeLogo: editing?.troupeLogo || legacyLogo,
        teacherId: editing?.teacherId || user.uid,
        academicYear: academicYear.trim() || '2025/2026',
        isActive: true,
        createdAt: editing ? editing.createdAt : now,
        updatedAt: now,
      });
      await recordAuditLog({
        user,
        action: editing ? 'UPDATE' : 'CREATE',
        targetType: 'class',
        targetId: safeId,
        details: `${editing ? 'Memperbarui' : 'Membuat'} kelas ${name} (${code.toUpperCase()}).`,
      });
      setShowModal(false);
      showToast('Data kelas berhasil disimpan', 'success');
    } catch (err) {
      showToast('Gagal menyimpan kelas', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <BookOpen className="w-6 h-6 text-amber-500" />
            Kelola Kelas Produksi Teater
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Buat kelas baru, atur kode registrasi siswa, dan berpindah ruang kerja kelas aktif.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Tambah Kelas Baru
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {classes.map((c) => {
          const isCurrent = c.id === activeClassId;
          return (
            <div
              key={c.id}
              className={`rounded-xl border p-5 space-y-4 transition-colors ${
                isCurrent
                  ? 'border-amber-500 bg-amber-500/5 dark:bg-amber-500/10'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    {c.name}
                  </h3>
                  {isCurrent && (
                    <span className="text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400">
                      AKTIF
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {c.troupeName || c.kerabatKerja || '-'} · T.A. {c.academicYear || '2025/2026'}
                </p>
                <p className="text-xs font-mono text-slate-700 dark:text-slate-300 mt-2">
                  Kode: <span className="font-bold">{c.code}</span>
                </p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200/70 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    onSelectClass(c.id);
                    showToast(`Beralih ke ruang kerja ${c.name}`, 'info');
                  }}
                  className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  {isCurrent ? 'Sedang Aktif' : 'Masuk Kelas Ini'}
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(c)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Edit
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                {editing ? 'Edit Data Kelas' : 'Buat Kelas Baru'}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">ID Kelas *</label>
                <input
                  type="text"
                  disabled={Boolean(editing)}
                  value={classIdInput}
                  onChange={(e) => setClassIdInput(e.target.value)}
                  placeholder="IX-C"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Tahun Ajaran</label>
                <input
                  type="text"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Nama Kelas *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Kode Registrasi Siswa *</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Nama Sanggar / Troupe</label>
              <input
                type="text"
                value={troupeName}
                onChange={(e) => setTroupeName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs text-slate-500"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold"
              >
                {busy ? 'Menyimpan...' : 'Simpan Kelas'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 3. INTER-CLASS COORDINATION MODULE
// ============================================================================
interface InterClassCoordModuleProps {
  user: UserProfile;
  classId: string;
  classes: SchoolClass[];
  events: InterClassEvent[];
}

export const InterClassCoordModule: React.FC<InterClassCoordModuleProps> = ({
  user,
  classId,
  classes,
  events,
}) => {
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState('Aula Utama SMP Negeri 10 Samarinda');
  const [waGroupUrl, setWaGroupUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedClasses, setSelectedClasses] = useState<string[]>(classes.map((c) => c.id));
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const toggleClass = (cid: string) => {
    setSelectedClasses((prev) =>
      prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || selectedClasses.length === 0) {
      showToast('Judul agenda dan minimal 1 kelas wajib diisi', 'warning');
      return;
    }
    const id = makeSafeId('ic');
    try {
      await upsertDocument('interClassEvents', id, {
        id,
        classId,
        title: title.trim(),
        date,
        location: location.trim(),
        involvedClassIds: selectedClasses,
        waGroupUrl: waGroupUrl.trim(),
        notes: notes.trim(),
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
      });
      setTitle('');
      setNotes('');
      setShowForm(false);
      showToast('Agenda lintas kelas disimpan', 'success');
    } catch (err) {
      showToast('Gagal menyimpan agenda', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-amber-500" />
            Koordinasi Lintas Kelas IX
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Jadwal festival, gladi gabungan, dan koordinasi grup WhatsApp antarkelas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 text-sm font-bold cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Tambah Agenda Gabungan
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSave}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nama agenda gabungan..."
              className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Lokasi kegiatan..."
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
            />
            <input
              type="url"
              value={waGroupUrl}
              onChange={(e) => setWaGroupUrl(e.target.value)}
              placeholder="Link Grup WhatsApp Koordinator (opsional)"
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
            />
          </div>
          <div>
            <p className="text-xs font-semibold mb-2">Kelas yang Terlibat:</p>
            <div className="flex flex-wrap gap-2">
              {classes.map((c) => (
                <label
                  key={c.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedClasses.includes(c.id)}
                    onChange={() => toggleClass(c.id)}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Catatan rundown atau teknis panggung bersama..."
            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-2 text-xs text-slate-500"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold"
            >
              Simpan Agenda
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-sm text-slate-500">
            Belum ada agenda koordinasi lintas kelas.
          </div>
        ) : (
          events.map((ev) => (
            <div
              key={ev.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-mono text-amber-600 dark:text-amber-400">
                  <Calendar className="w-3.5 h-3.5" />
                  {ev.date} · {ev.location}
                </div>
                <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  {ev.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Peserta: {ev.involvedClassIds.join(', ')}
                </p>
                {ev.notes && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 pt-1">{ev.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {ev.waGroupUrl && (
                  <a
                    href={ev.waGroupUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                  >
                    Grup WA <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {confirmDeleteId === ev.id ? (
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await removeDocument('interClassEvents', ev.id);
                          setConfirmDeleteId(null);
                          showToast('Agenda lintas kelas dihapus', 'info');
                        } catch (err) {
                          showToast('Gagal menghapus agenda', 'error', err instanceof Error ? err.message : undefined);
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-semibold"
                    >
                      Hapus
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(ev.id)}
                    className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
