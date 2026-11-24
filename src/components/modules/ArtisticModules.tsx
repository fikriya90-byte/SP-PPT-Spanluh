import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Music,
  Package,
  Palette,
  Plus,
  Ruler,
  Search,
  Shirt,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import {
  MUSIC_CUE_TYPES,
  containsForbiddenWords,
  isCoordinatorRole,
  isCoreCommitteeRole,
} from '../../core/constants';
import { CostumeItem, FaceChart, MusicCue, PropertyItem, UserProfile } from '../../core/types';
import {
  makeSafeId,
  notifyUsers,
  recordAuditLog,
  removeDocument,
  upsertDocument,
} from '../../services/firestoreService';
import { compressImageToBase64 } from '../../utils/imageCompress';
import { useToast } from '../common/Toast';

// ============================================================================
// 1. PROPERTY MODULE (Perlengkapan & Properti Panggung)
// ============================================================================
interface PropertyModuleProps {
  user: UserProfile;
  classId: string;
  properties: PropertyItem[];
  members: UserProfile[];
}

export const PropertyModule: React.FC<PropertyModuleProps> = ({
  user,
  classId,
  properties,
  members,
}) => {
  const { showToast } = useToast();
  const canEdit =
    isCoreCommitteeRole(user.role) ||
    isCoordinatorRole(user.role) ||
    user.divisionId === 'perlengkapan';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PropertyItem['status']>('ALL');
  const [sceneFilter, setSceneFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PropertyItem | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [scene, setScene] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<PropertyItem['status']>('BELUM');
  const [assignedTo, setAssignedTo] = useState('');
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const scenes = useMemo(
    () => Array.from(new Set(properties.map((p) => p.scene).filter(Boolean))),
    [properties]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return properties
      .filter((p) => (statusFilter === 'ALL' ? true : p.status === statusFilter))
      .filter((p) => (sceneFilter === 'ALL' ? true : p.scene === sceneFilter))
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.scene.toLowerCase().includes(q) ||
          (p.assignedTo || '').toLowerCase().includes(q)
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [properties, search, statusFilter, sceneFilter]);

  const stats = useMemo(() => {
    const total = properties.length;
    const selesai = properties.filter((p) => p.status === 'SELESAI').length;
    const proses = properties.filter((p) => p.status === 'PROSES').length;
    const belum = properties.filter((p) => p.status === 'BELUM').length;
    const pct = total > 0 ? Math.round((selesai / total) * 100) : 0;
    return { total, selesai, proses, belum, pct };
  }, [properties]);

  const sceneBreakdown = useMemo(() => {
    return scenes.map((sc) => {
      const list = properties.filter((p) => p.scene === sc);
      const done = list.filter((p) => p.status === 'SELESAI').length;
      return {
        scene: sc,
        total: list.length,
        done,
        pct: list.length > 0 ? Math.round((done / list.length) * 100) : 0,
      };
    });
  }, [scenes, properties]);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setScene('');
    setDescription('');
    setStatus('BELUM');
    setAssignedTo('');
    setNotes('');
    setPhotoUrl('');
    setShowModal(true);
  };

  const openEdit = (item: PropertyItem) => {
    setEditing(item);
    setName(item.name);
    setScene(item.scene);
    setDescription(item.description);
    setStatus(item.status);
    setAssignedTo(item.assignedTo || '');
    setNotes(item.notes || '');
    setPhotoUrl(item.photoUrl || '');
    setShowModal(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageToBase64(file, 220);
      setPhotoUrl(compressed);
      showToast('Foto properti siap dilampirkan', 'success');
    } catch (err) {
      showToast('Gagal mengompres gambar', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !scene.trim()) {
      showToast('Nama properti dan adegan wajib diisi', 'warning');
      return;
    }
    const bad = containsForbiddenWords(`${name} ${description} ${notes}`);
    if (bad) {
      showToast('Konten ditolak', 'error', `Kata tidak pantas terdeteksi (${bad}).`);
      return;
    }

    setBusy(true);
    try {
      const now = new Date().toISOString();
      const id = editing ? editing.id : makeSafeId('prop');
      const payload: PropertyItem = {
        id,
        classId,
        name: name.trim(),
        scene: scene.trim(),
        description: description.trim(),
        status,
        assignedTo: assignedTo.trim(),
        notes: notes.trim(),
        photoUrl,
        createdAt: editing ? editing.createdAt : now,
        updatedAt: now,
      };
      await upsertDocument('properties', id, payload as unknown as Record<string, unknown>);
      await recordAuditLog({
        user,
        action: editing ? 'UPDATE' : 'CREATE',
        targetType: 'property',
        targetId: id,
        details: `${editing ? 'Memperbarui' : 'Menambah'} properti "${payload.name}" (${payload.status}).`,
      });
      setShowModal(false);
      showToast(editing ? 'Properti diperbarui' : 'Properti ditambahkan', 'success');
    } catch (err) {
      showToast('Gagal menyimpan properti', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleQuickStatus = async (item: PropertyItem, nextStatus: PropertyItem['status']) => {
    if (!canEdit) return;
    try {
      await upsertDocument('properties', item.id, {
        ...item,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      } as unknown as Record<string, unknown>);
      showToast(`Status "${item.name}" → ${nextStatus}`, 'success');
    } catch (err) {
      showToast('Gagal mengubah status', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const handleDelete = async (item: PropertyItem) => {
    try {
      await removeDocument('properties', item.id);
      await recordAuditLog({
        user,
        action: 'DELETE',
        targetType: 'property',
        targetId: item.id,
        details: `Menghapus properti "${item.name}".`,
      });
      showToast('Properti dihapus', 'info');
    } catch (err) {
      showToast('Gagal menghapus', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const perlengkapanMembers = members.filter(
    (m) => m.divisionId === 'perlengkapan' || m.divisionId === 'panggung'
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Package className="w-6 h-6 text-amber-500" />
            Properti & Perlengkapan Panggung
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Inventaris kebutuhan artistik dan teknis per adegan untuk kelas {classId}.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Tambah Properti
          </button>
        )}
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Item</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {stats.total}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Siap Panggung</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {stats.selesai}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Dalam Proses</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {stats.proses}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Kesiapan Total</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {stats.pct}%
          </p>
          <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 mt-2 overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${stats.pct}%` }} />
          </div>
        </div>
      </div>

      {/* Scene Breakdown */}
      {sceneBreakdown.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">
            Progres Kesiapan per Adegan
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sceneBreakdown.map((sc) => (
              <div
                key={sc.scene}
                className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 bg-slate-50/70 dark:bg-slate-950/60"
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {sc.scene}
                  </span>
                  <span className="font-mono tabular-nums text-slate-500">
                    {sc.done}/{sc.total} ({sc.pct}%)
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-amber-500" style={{ width: `${sc.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama properti, adegan, atau PIC..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <select
          value={sceneFilter}
          onChange={(e) => setSceneFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
        >
          <option value="ALL">Semua Adegan</option>
          {scenes.map((sc) => (
            <option key={sc} value={sc}>
              {sc}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'ALL' | PropertyItem['status'])}
          className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
        >
          <option value="ALL">Semua Status</option>
          <option value="BELUM">BELUM</option>
          <option value="PROSES">PROSES</option>
          <option value="SELESAI">SELESAI</option>
        </select>
      </div>

      {/* Grid List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-sm text-slate-500">
          Belum ada data properti yang sesuai filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col"
            >
              {item.photoUrl && (
                <button
                  type="button"
                  onClick={() => setPreviewImg(item.photoUrl || null)}
                  className="w-full h-40 overflow-hidden bg-slate-100 dark:bg-slate-950 cursor-pointer"
                >
                  <img
                    src={item.photoUrl}
                    alt={item.name}
                    className="w-full h-full object-cover hover:scale-105 transition-transform"
                  />
                </button>
              )}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                      {item.name}
                    </h3>
                    <span
                      className={`text-[11px] font-mono font-bold shrink-0 ${
                        item.status === 'SELESAI'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : item.status === 'PROSES'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-500'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {item.scene}
                    {item.assignedTo ? ` · PIC: ${item.assignedTo}` : ''}
                  </p>
                  {item.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                      {item.description}
                    </p>
                  )}
                  {item.notes && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 italic">
                      Catatan: {item.notes}
                    </p>
                  )}
                </div>

                {canEdit && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <select
                      value={item.status}
                      onChange={(e) =>
                        handleQuickStatus(item, e.target.value as PropertyItem['status'])
                      }
                      className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-800 dark:text-slate-200"
                    >
                      <option value="BELUM">BELUM</option>
                      <option value="PROSES">PROSES</option>
                      <option value="SELESAI">SELESAI</option>
                    </select>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                      >
                        Ubah
                      </button>
                      {confirmDeleteId === item.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDeleteId(null);
                              handleDelete(item);
                            }}
                            className="px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] font-semibold"
                          >
                            Hapus
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-[11px]"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="text-rose-500 hover:text-rose-600 p-1"
                          aria-label="Hapus properti"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                {editing ? 'Edit Item Properti' : 'Tambah Item Properti'}
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Properti *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Misal: Dayung Kayu"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Adegan / Babak *
                </label>
                <input
                  type="text"
                  value={scene}
                  onChange={(e) => setScene(e.target.value)}
                  placeholder="Misal: Adegan 1"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Penanggung Jawab (PIC)
                </label>
                <input
                  list="perlengkapan-pics"
                  type="text"
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  placeholder="Nama siswa PIC"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
                <datalist id="perlengkapan-pics">
                  {perlengkapanMembers.map((m) => (
                    <option key={m.uid} value={m.name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Status Kesiapan
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PropertyItem['status'])}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                >
                  <option value="BELUM">BELUM</option>
                  <option value="PROSES">PROSES</option>
                  <option value="SELESAI">SELESAI</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Deskripsi / Spesifikasi
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Catatan Teknis
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Foto Referensi / Progress
              </label>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                  <ImagePlus className="w-4 h-4 text-amber-500" />
                  Unggah Foto
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </label>
                {photoUrl && (
                  <button
                    type="button"
                    onClick={() => setPhotoUrl('')}
                    className="text-xs text-rose-500 hover:underline"
                  >
                    Hapus Foto
                  </button>
                )}
              </div>
              {photoUrl && (
                <img src={photoUrl} alt="Preview" className="mt-2 h-28 rounded-lg object-cover" />
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
              >
                {busy ? 'Menyimpan...' : 'Simpan Properti'}
              </button>
            </div>
          </form>
        </div>
      )}

      {previewImg && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImg(null)}
        >
          <img
            src={previewImg}
            alt="Preview properti"
            className="max-w-3xl max-h-[85vh] rounded-xl object-contain"
          />
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 2. MUSIC CUE MODULE (Tata Musik & Sound Cue Sheet)
// ============================================================================
interface MusicCueModuleProps {
  user: UserProfile;
  classId: string;
  musicCues: MusicCue[];
}

export const MusicCueModule: React.FC<MusicCueModuleProps> = ({ user, classId, musicCues }) => {
  const { showToast } = useToast();
  const canEdit =
    isCoreCommitteeRole(user.role) || isCoordinatorRole(user.role) || user.divisionId === 'musik';

  const [filterType, setFilterType] = useState('ALL');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<MusicCue | null>(null);

  const [scene, setScene] = useState('');
  const [cueType, setCueType] = useState(MUSIC_CUE_TYPES[0]);
  const [title, setTitle] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [volume, setVolume] = useState(75);
  const [duration, setDuration] = useState('01:30');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return musicCues
      .filter((c) => (filterType === 'ALL' ? true : c.cueType === filterType))
      .filter(
        (c) =>
          !q ||
          c.title.toLowerCase().includes(q) ||
          c.scene.toLowerCase().includes(q) ||
          c.cueType.toLowerCase().includes(q)
      );
  }, [musicCues, filterType, search]);

  const openCreate = () => {
    setEditing(null);
    setScene('');
    setCueType(MUSIC_CUE_TYPES[0]);
    setTitle('');
    setAudioUrl('');
    setVolume(75);
    setDuration('01:30');
    setNotes('');
    setShowModal(true);
  };

  const openEdit = (cue: MusicCue) => {
    setEditing(cue);
    setScene(cue.scene);
    setCueType(cue.cueType);
    setTitle(cue.title);
    setAudioUrl(cue.audioUrl);
    setVolume(cue.volume);
    setDuration(cue.duration);
    setNotes(cue.notes || '');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scene.trim() || !title.trim()) {
      showToast('Adegan dan judul musik wajib diisi', 'warning');
      return;
    }
    const bad = containsForbiddenWords(`${title} ${notes}`);
    if (bad) {
      showToast('Konten ditolak', 'error', `Kata tidak pantas terdeteksi (${bad}).`);
      return;
    }
    setBusy(true);
    try {
      const id = editing ? editing.id : makeSafeId('cue');
      const payload: MusicCue = {
        id,
        classId,
        scene: scene.trim(),
        cueType,
        title: title.trim(),
        audioUrl: audioUrl.trim(),
        volume: Math.min(100, Math.max(0, Number(volume) || 0)),
        duration: duration.trim() || '01:00',
        notes: notes.trim(),
        createdAt: editing ? editing.createdAt : new Date().toISOString(),
      };
      await upsertDocument('musicCues', id, payload as unknown as Record<string, unknown>);
      await recordAuditLog({
        user,
        action: editing ? 'UPDATE' : 'CREATE',
        targetType: 'musicCue',
        targetId: id,
        details: `${editing ? 'Memperbarui' : 'Menambah'} cue musik "${payload.title}" pada ${payload.scene}.`,
      });
      setShowModal(false);
      showToast('Cue musik berhasil disimpan', 'success');
    } catch (err) {
      showToast('Gagal menyimpan cue musik', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (cue: MusicCue) => {
    try {
      await removeDocument('musicCues', cue.id);
      showToast('Cue musik dihapus', 'info');
    } catch (err) {
      showToast('Gagal menghapus', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Music className="w-6 h-6 text-amber-500" />
            Musik Cue Sheet & Tata Suara
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Daftar 10 fungsi musik dramatik, level volume, durasi, dan tautan audio pementasan.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Tambah Cue Musik
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari judul lagu, adegan, atau fungsi..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
        >
          <option value="ALL">Semua Fungsi Musik (10 Tipe)</option>
          {MUSIC_CUE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-sm text-slate-500">
          Belum ada musik cue terdaftar.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/60">
                  <th className="py-3 px-4 font-semibold">Adegan & Judul</th>
                  <th className="py-3 px-4 font-semibold">Jenis Cue</th>
                  <th className="py-3 px-4 font-semibold">Volume & Durasi</th>
                  <th className="py-3 px-4 font-semibold">Tautan Audio</th>
                  {canEdit && <th className="py-3 px-4 font-semibold text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 dark:text-white">{c.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {c.scene}
                        {c.notes ? ` · ${c.notes}` : ''}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">
                      {c.cueType}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1">
                        <Volume2 className="w-3.5 h-3.5 text-amber-500" />
                        {c.volume}%
                      </span>
                      {' · '}
                      {c.duration}
                    </td>
                    <td className="py-3 px-4">
                      {c.audioUrl ? (
                        <a
                          href={c.audioUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                        >
                          Buka Audio <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">Belum ada URL</span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                        >
                          Ubah
                        </button>
                        {confirmDeleteId === c.id ? (
                          <span className="inline-flex items-center gap-1 ml-1">
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteId(null);
                                handleDelete(c);
                              }}
                              className="px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] font-semibold"
                            >
                              Hapus
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-[11px]"
                            >
                              Batal
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(c.id)}
                            className="text-rose-500 hover:text-rose-600 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                {editing ? 'Edit Musik Cue' : 'Tambah Musik Cue'}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Adegan / Momen *
                </label>
                <input
                  type="text"
                  value={scene}
                  onChange={(e) => setScene(e.target.value)}
                  placeholder="Misal: Adegan 2 — Konflik"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Fungsi Cue
                </label>
                <select
                  value={cueType}
                  onChange={(e) => setCueType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                >
                  {MUSIC_CUE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Judul Trek / Instrumen *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Link Audio / YouTube / Google Drive
              </label>
              <input
                type="url"
                value={audioUrl}
                onChange={(e) => setAudioUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Volume ({volume}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Durasi (MM:SS)
                </label>
                <input
                  type="text"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Instruksi Masuk / Fade
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Misal: Fade in 3 detik setelah dialog selesai"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
              >
                {busy ? 'Menyimpan...' : 'Simpan Cue'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 3. FACE CHART MODULE (Tata Rias & Moodboard)
// ============================================================================
interface FaceChartModuleProps {
  user: UserProfile;
  classId: string;
  faceCharts: FaceChart[];
  members: UserProfile[];
}

export const FaceChartModule: React.FC<FaceChartModuleProps> = ({
  user,
  classId,
  faceCharts,
  members,
}) => {
  const { showToast } = useToast();
  const canEdit =
    isCoreCommitteeRole(user.role) || isCoordinatorRole(user.role) || user.divisionId === 'rias';

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FaceChart | null>(null);
  const [largePhoto, setLargePhoto] = useState<string | null>(null);

  const [characterName, setCharacterName] = useState('');
  const [actorName, setActorName] = useState('');
  const [designNotes, setDesignNotes] = useState('');
  const [products, setProducts] = useState('');
  const [status, setStatus] = useState<FaceChart['status']>('DRAFT');
  const [moodboard, setMoodboard] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const actors = members.filter((m) => m.role === 'Pemeran');

  const openCreate = () => {
    setEditing(null);
    setCharacterName('');
    setActorName('');
    setDesignNotes('');
    setProducts('');
    setStatus('DRAFT');
    setMoodboard([]);
    setShowModal(true);
  };

  const openEdit = (fc: FaceChart) => {
    setEditing(fc);
    setCharacterName(fc.characterName);
    setActorName(fc.actorName);
    setDesignNotes(fc.designNotes);
    setProducts(fc.products);
    setStatus(fc.status);
    setMoodboard(fc.moodboard || []);
    setShowModal(true);
  };

  const handleAddMoodboard = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (moodboard.length >= 4) {
      showToast('Maksimal 4 foto moodboard per tokoh', 'warning');
      return;
    }
    try {
      const dataUrl = await compressImageToBase64(file, 200);
      setMoodboard([...moodboard, dataUrl]);
    } catch (err) {
      showToast('Gagal mengompres gambar', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!characterName.trim() || !actorName.trim()) {
      showToast('Nama tokoh dan pemeran wajib diisi', 'warning');
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const id = editing ? editing.id : makeSafeId('fc');
      const payload: FaceChart = {
        id,
        classId,
        characterName: characterName.trim(),
        actorName: actorName.trim(),
        moodboard,
        designNotes: designNotes.trim(),
        products: products.trim(),
        status,
        createdAt: editing ? editing.createdAt : now,
        updatedAt: now,
      };
      await upsertDocument('faceCharts', id, payload as unknown as Record<string, unknown>);
      setShowModal(false);
      showToast('Face chart berhasil disimpan', 'success');
    } catch (err) {
      showToast('Gagal menyimpan face chart', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = async (fc: FaceChart, nextStatus: FaceChart['status']) => {
    try {
      await upsertDocument('faceCharts', fc.id, {
        ...fc,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      } as unknown as Record<string, unknown>);
      if (nextStatus === 'APPROVED') {
        const actor = members.find((m) => m.name === fc.actorName);
        if (actor) {
          await notifyUsers({
            userIds: [actor.uid],
            classId,
            title: `Face Chart Disetujui: ${fc.characterName}`,
            message: `Desain rias tokoh ${fc.characterName} telah disetujui dan siap diuji coba.`,
            category: 'Sistem',
            link: 'face-chart',
          });
        }
      }
      showToast(`Status rias ${fc.characterName} → ${nextStatus}`, 'success');
    } catch (err) {
      showToast('Gagal memperbarui status', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Palette className="w-6 h-6 text-amber-500" />
            Face Chart & Desain Tata Rias
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Moodboard karakter, daftar kosmetik, dan persetujuan desain rias panggung.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Tambah Face Chart
          </button>
        )}
      </div>

      {faceCharts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-sm text-slate-500">
          Belum ada face chart tata rias.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {faceCharts.map((fc) => (
            <div
              key={fc.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    {fc.characterName}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Pemeran: {fc.actorName}
                  </p>
                </div>
                <span
                  className={`text-xs font-mono font-bold ${
                    fc.status === 'APPLIED'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : fc.status === 'APPROVED'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-500'
                  }`}
                >
                  {fc.status}
                </span>
              </div>

              {fc.moodboard && fc.moodboard.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {fc.moodboard.map((img, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setLargePhoto(img)}
                      className="h-20 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 cursor-pointer"
                    >
                      <img src={img} alt="Moodboard" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-2 text-xs">
                <div>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Konsep Rias:
                  </span>{' '}
                  <span className="text-slate-600 dark:text-slate-400">
                    {fc.designNotes || '-'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Alat & Kosmetik:
                  </span>{' '}
                  <span className="text-slate-600 dark:text-slate-400">{fc.products || '-'}</span>
                </div>
              </div>

              {canEdit && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <select
                    value={fc.status}
                    onChange={(e) =>
                      handleStatusChange(fc, e.target.value as FaceChart['status'])
                    }
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-medium"
                  >
                    <option value="DRAFT">DRAFT</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="APPLIED">APPLIED</option>
                  </select>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => openEdit(fc)}
                      className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                    >
                      Edit
                    </button>
                    {confirmDeleteId === fc.id ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await removeDocument('faceCharts', fc.id);
                              setConfirmDeleteId(null);
                              showToast('Face Chart dihapus', 'info');
                            } catch (err) {
                              showToast('Gagal menghapus Face Chart', 'error', err instanceof Error ? err.message : undefined);
                            }
                          }}
                          className="px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] font-semibold"
                        >
                          Hapus
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-[11px]"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(fc.id)}
                        className="text-rose-500 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                {editing ? 'Edit Face Chart' : 'Tambah Face Chart'}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Nama Tokoh *</label>
                <input
                  type="text"
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Nama Pemeran *</label>
                <input
                  list="rias-actors"
                  type="text"
                  value={actorName}
                  onChange={(e) => setActorName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
                />
                <datalist id="rias-actors">
                  {actors.map((a) => (
                    <option key={a.uid} value={a.name} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Catatan Desain Rias</label>
              <textarea
                rows={2}
                value={designNotes}
                onChange={(e) => setDesignNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Daftar Produk / Kosmetik</label>
              <input
                type="text"
                value={products}
                onChange={(e) => setProducts(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Moodboard Referensi ({moodboard.length}/4)
              </label>
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer">
                <ImagePlus className="w-4 h-4 text-amber-500" />
                Tambah Foto Referensi
                <input type="file" accept="image/*" onChange={handleAddMoodboard} className="hidden" />
              </label>
              {moodboard.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {moodboard.map((m, idx) => (
                    <div key={idx} className="relative h-16 rounded-lg overflow-hidden">
                      <img src={m} alt="Ref" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setMoodboard(moodboard.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
              >
                {busy ? 'Menyimpan...' : 'Simpan Face Chart'}
              </button>
            </div>
          </form>
        </div>
      )}

      {largePhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLargePhoto(null)}
        >
          <img src={largePhoto} alt="Moodboard rias" className="max-w-2xl max-h-[85vh] rounded-xl" />
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 4. COSTUME MODULE (Tata Busana 6-Stage Pipeline & Pengukuran)
// ============================================================================
const COSTUME_STAGES: CostumeItem['status'][] = [
  'BELUM',
  'DESAIN',
  'POTONG',
  'JAHIT',
  'FITTING',
  'SELESAI',
];

interface CostumeModuleProps {
  user: UserProfile;
  classId: string;
  costumes: CostumeItem[];
  members: UserProfile[];
}

export const CostumeModule: React.FC<CostumeModuleProps> = ({
  user,
  classId,
  costumes,
  members,
}) => {
  const { showToast } = useToast();
  const canEdit =
    isCoreCommitteeRole(user.role) || isCoordinatorRole(user.role) || user.divisionId === 'busana';

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CostumeItem | null>(null);
  const [characterName, setCharacterName] = useState('');
  const [actorName, setActorName] = useState('');
  const [ld, setLd] = useState('');
  const [lp, setLp] = useState('');
  const [tinggi, setTinggi] = useState('');
  const [sepatu, setSepatu] = useState('');
  const [status, setStatus] = useState<CostumeItem['status']>('BELUM');
  const [notes, setNotes] = useState('');
  const [designImgs, setDesignImgs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const summary = useMemo(() => {
    const total = costumes.length;
    const done = costumes.filter((c) => c.status === 'SELESAI').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [costumes]);

  const openCreate = () => {
    setEditing(null);
    setCharacterName('');
    setActorName('');
    setLd('');
    setLp('');
    setTinggi('');
    setSepatu('');
    setStatus('BELUM');
    setNotes('');
    setDesignImgs([]);
    setShowModal(true);
  };

  const openEdit = (item: CostumeItem) => {
    setEditing(item);
    setCharacterName(item.characterName);
    setActorName(item.actorName);
    setLd(item.measurements?.LD || '');
    setLp(item.measurements?.LP || '');
    setTinggi(item.measurements?.tinggi || '');
    setSepatu(item.measurements?.ukuranSepatu || '');
    setStatus(item.status);
    setNotes(item.notes || '');
    setDesignImgs(item.design || []);
    setShowModal(true);
  };

  const handleUploadDesign = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (designImgs.length >= 3) {
      showToast('Maksimal 3 sketsa/foto kostum', 'warning');
      return;
    }
    try {
      const dataUrl = await compressImageToBase64(file, 200);
      setDesignImgs([...designImgs, dataUrl]);
    } catch (err) {
      showToast('Gagal membaca foto', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!characterName.trim() || !actorName.trim()) {
      showToast('Nama tokoh dan pemeran wajib diisi', 'warning');
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const id = editing ? editing.id : makeSafeId('cos');
      const payload: CostumeItem = {
        id,
        classId,
        characterName: characterName.trim(),
        actorName: actorName.trim(),
        design: designImgs,
        measurements: {
          LD: ld.trim(),
          LP: lp.trim(),
          tinggi: tinggi.trim(),
          ukuranSepatu: sepatu.trim(),
        },
        status,
        notes: notes.trim(),
        createdAt: editing ? editing.createdAt : now,
        updatedAt: now,
      };
      await upsertDocument('costumes', id, payload as unknown as Record<string, unknown>);
      setShowModal(false);
      showToast('Data kostum disimpan', 'success');
    } catch (err) {
      showToast('Gagal menyimpan kostum', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const advanceStage = async (item: CostumeItem, nextStage: CostumeItem['status']) => {
    if (!canEdit) return;
    try {
      await upsertDocument('costumes', item.id, {
        ...item,
        status: nextStage,
        updatedAt: new Date().toISOString(),
      } as unknown as Record<string, unknown>);
      showToast(`Kostum ${item.characterName} → ${nextStage}`, 'success');
    } catch (err) {
      showToast('Gagal memperbarui tahap', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Shirt className="w-6 h-6 text-amber-500" />
            Tata Busana & Pipeline Produksi Kostum
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            6 tahap produksi kostum (Belum → Desain → Potong → Jahit → Fitting → Selesai) beserta ukuran badan.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Tambah Kostum
          </button>
        )}
      </div>

      {/* Pipeline Summary */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            Penyelesaian Kostum Keseluruhan ({summary.done}/{summary.total})
          </span>
          <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
            {summary.pct}%
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${summary.pct}%` }} />
        </div>
      </div>

      {costumes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-sm text-slate-500">
          Belum ada data kostum untuk kelas {classId}.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {costumes.map((c) => {
            const stageIdx = COSTUME_STAGES.indexOf(c.status);
            const pct = Math.round(((stageIdx + 1) / COSTUME_STAGES.length) * 100);
            return (
              <div
                key={c.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                      {c.characterName}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Pemeran: {c.actorName}
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                    {c.status} ({pct}%)
                  </span>
                </div>

                {/* 6-step clickable stepper */}
                <div className="grid grid-cols-6 gap-1">
                  {COSTUME_STAGES.map((st, idx) => {
                    const active = idx <= stageIdx;
                    return (
                      <button
                        key={st}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => advanceStage(c, st)}
                        className={`py-1.5 px-1 rounded-lg text-[10px] font-bold transition-colors text-center truncate ${
                          active
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                        title={st}
                      >
                        {st}
                      </button>
                    );
                  })}
                </div>

                {/* Measurements */}
                <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                    <Ruler className="w-3.5 h-3.5 text-amber-500" />
                    Ukuran:
                  </span>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    LD: {c.measurements?.LD || '-'}
                  </span>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    LP: {c.measurements?.LP || '-'}
                  </span>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    Tinggi: {c.measurements?.tinggi || '-'}
                  </span>
                  {c.measurements?.ukuranSepatu && (
                    <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      Sepatu: {c.measurements.ukuranSepatu}
                    </span>
                  )}
                </div>

                {c.design && c.design.length > 0 && (
                  <div className="flex gap-2">
                    {c.design.map((img, i) => (
                      <img
                        key={i}
                        src={img}
                        alt="Sketsa kostum"
                        className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-slate-800"
                      />
                    ))}
                  </div>
                )}

                {c.notes && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {c.notes}
                  </p>
                )}

                {canEdit && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                    >
                      Edit Detail & Ukuran
                    </button>
                    {confirmDeleteId === c.id ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await removeDocument('costumes', c.id);
                              setConfirmDeleteId(null);
                              showToast('Kostum dihapus', 'info');
                            } catch (err) {
                              showToast('Gagal menghapus kostum', 'error', err instanceof Error ? err.message : undefined);
                            }
                          }}
                          className="px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] font-semibold"
                        >
                          Hapus
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-[11px]"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(c.id)}
                        className="text-rose-500 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                {editing ? 'Edit Kostum & Ukuran' : 'Tambah Kostum Baru'}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Nama Tokoh *</label>
                <input
                  type="text"
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Nama Pemeran *</label>
                <input
                  list="costume-actors"
                  type="text"
                  value={actorName}
                  onChange={(e) => setActorName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
                />
                <datalist id="costume-actors">
                  {members
                    .filter((m) => m.role === 'Pemeran')
                    .map((m) => (
                      <option key={m.uid} value={m.name} />
                    ))}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-xs font-semibold mb-1">Lingkar Dada</label>
                <input
                  type="text"
                  value={ld}
                  onChange={(e) => setLd(e.target.value)}
                  placeholder="90 cm"
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Lingkar Pinggang</label>
                <input
                  type="text"
                  value={lp}
                  onChange={(e) => setLp(e.target.value)}
                  placeholder="76 cm"
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Tinggi Badan</label>
                <input
                  type="text"
                  value={tinggi}
                  onChange={(e) => setTinggi(e.target.value)}
                  placeholder="165 cm"
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Sepatu</label>
                <input
                  type="text"
                  value={sepatu}
                  onChange={(e) => setSepatu(e.target.value)}
                  placeholder="40"
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Tahap Produksi</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as CostumeItem['status'])}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                {COSTUME_STAGES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Catatan Bahan & Aksesori</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>

            <div>
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer">
                <ImagePlus className="w-4 h-4 text-amber-500" />
                Unggah Sketsa / Foto Kostum ({designImgs.length}/3)
                <input type="file" accept="image/*" onChange={handleUploadDesign} className="hidden" />
              </label>
              {designImgs.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {designImgs.map((img, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden">
                      <img src={img} alt="Design" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setDesignImgs(designImgs.filter((_, idx) => idx !== i))}
                        className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {busy ? 'Menyimpan...' : 'Simpan Kostum'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
