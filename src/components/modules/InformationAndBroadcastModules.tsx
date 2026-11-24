import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Clock,
  ExternalLink,
  ImagePlus,
  Megaphone,
  Pin,
  PinOff,
  Plus,
  Radio,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { isAdminRole, isCoreCommitteeRole, isTeacherOrAdmin } from '../../core/constants';
import { BroadcastItem, InformationItem, SchoolClass, UserProfile } from '../../core/types';
import {
  makeSafeId,
  notifyUsers,
  recordAuditLog,
  removeDocument,
  updateDocumentFields,
  upsertDocument,
} from '../../services/firestoreService';
import { compressImage, formatRelativeTime } from '../../utils/imageCompress';
import { useToast } from '../common/Toast';

function renderTextWithLinks(text: string): React.ReactNode {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      let cleanPart = part;
      let trailing = '';
      const matchPunct = part.match(/[.,;:!?]+$/);
      if (matchPunct) {
        cleanPart = part.slice(0, -matchPunct[0].length);
        trailing = matchPunct[0];
      }
      if (/^(https?:\/\/[^\s]+|www\.[^\s]+)$/i.test(cleanPart)) {
        const href = cleanPart.startsWith('http') ? cleanPart : `https://${cleanPart}`;
        return (
          <React.Fragment key={i}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-blue-600 dark:text-blue-400 font-semibold underline decoration-dotted underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300 break-all inline-flex items-center gap-1"
            >
              {cleanPart}
              <ExternalLink className="w-3 h-3 inline" />
            </a>
            {trailing}
          </React.Fragment>
        );
      }
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

const INFO_CAT_META: Record<
  InformationItem['category'],
  { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }
> = {
  PENGUMUMAN: {
    label: 'Pengumuman',
    cls: 'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300',
    icon: Megaphone,
  },
  INFO: {
    label: 'Info Umum',
    cls: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
    icon: Bell,
  },
  URGENT: {
    label: 'Urgent',
    cls: 'bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300',
    icon: AlertTriangle,
  },
  JADWAL: {
    label: 'Jadwal',
    cls: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300',
    icon: Clock,
  },
  KEUANGAN: {
    label: 'Keuangan',
    cls: 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300',
    icon: Sparkles,
  },
};

interface InfoProps {
  user: UserProfile;
  classId: string;
  broadcasts: BroadcastItem[];
  informationList?: InformationItem[];
  allClasses?: SchoolClass[];
  classMembers: UserProfile[];
}

export const InformationModule: React.FC<InfoProps> = ({
  user,
  classId,
  broadcasts,
  informationList = [],
  allClasses = [],
  classMembers,
}) => {
  const { showToast } = useToast();
  const canCreate = isCoreCommitteeRole(user.role);
  const canMultiClass = isTeacherOrAdmin(user.role) && allClasses.length > 1;

  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'NORMAL' | 'HIGH' | 'URGENT'>('ALL');
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<InformationItem['category']>('PENGUMUMAN');
  const [priority, setPriority] = useState<'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  const [isPinned, setIsPinned] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [targetClassIds, setTargetClassIds] = useState<string[]>([classId]);
  const [sendNotif, setSendNotif] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  type UnifiedFeedItem = {
    source: 'information' | 'broadcasts';
    id: string;
    title: string;
    body: string;
    category: InformationItem['category'];
    priority: 'NORMAL' | 'HIGH' | 'URGENT';
    isPinned: boolean;
    photoUrls: string[];
    authorId: string;
    authorName: string;
    authorRole: string;
    createdAt: string;
  };

  const mergedItems = useMemo(() => {
    const unified: UnifiedFeedItem[] = [
      ...informationList.map((info) => ({
        source: 'information' as const,
        id: info.id,
        title: info.title,
        body: info.content,
        category: info.category || 'PENGUMUMAN',
        priority: (info.priority === 'LOW'
          ? 'NORMAL'
          : info.priority === 'MEDIUM'
          ? 'HIGH'
          : 'URGENT') as 'NORMAL' | 'HIGH' | 'URGENT',
        isPinned: Boolean(info.isPinned),
        photoUrls: info.photoUrls || (info.photoUrl ? [info.photoUrl] : []),
        authorId: info.authorId,
        authorName: info.authorName,
        authorRole: info.authorRole,
        createdAt: info.createdAt,
      })),
      ...broadcasts.map((bc) => ({
        source: 'broadcasts' as const,
        id: bc.id,
        title: bc.title,
        body: bc.message,
        category: (bc.priority === 'URGENT' ? 'URGENT' : 'PENGUMUMAN') as InformationItem['category'],
        priority: bc.priority || 'NORMAL',
        isPinned: false,
        photoUrls: [],
        authorId: bc.senderId,
        authorName: bc.senderName,
        authorRole: bc.senderRole,
        createdAt: bc.createdAt,
      })),
    ];

    const q = search.trim().toLowerCase();
    return unified
      .filter((item) => {
        if (priorityFilter !== 'ALL' && item.priority !== priorityFilter) return false;
        if (!q) return true;
        return item.title.toLowerCase().includes(q) || item.body.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
  }, [informationList, broadcasts, search, priorityFilter]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, Math.max(0, 5 - photos.length));
    if (files.length === 0) return;
    try {
      const compressed = await Promise.all(files.map((f) => compressImage(f, 800, 0.6)));
      setPhotos((prev) => [...prev, ...compressed].slice(0, 5));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memproses foto', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const toggleTargetClass = (cid: string) => {
    setTargetClassIds((prev) =>
      prev.includes(cid)
        ? prev.length > 1
          ? prev.filter((x) => x !== cid)
          : prev
        : [...prev, cid]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      showToast('Judul dan isi pengumuman wajib diisi', 'warning');
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const targets = canMultiClass && targetClassIds.length > 0 ? targetClassIds : [classId];
      const infoPriority: InformationItem['priority'] =
        priority === 'URGENT' ? 'HIGH' : priority === 'HIGH' ? 'MEDIUM' : 'LOW';

      for (const cid of targets) {
        const id = makeSafeId('info');
        const infoPayload: InformationItem = {
          id,
          classId: cid,
          title: title.trim(),
          content: message.trim(),
          category,
          priority: infoPriority,
          isPinned,
          ...(photos.length > 0 ? { photoUrls: photos } : {}),
          authorId: user.uid,
          authorName: user.name,
          authorRole: user.role,
          createdAt: now,
          updatedAt: now,
        };
        await upsertDocument('information', id, infoPayload as unknown as Record<string, unknown>);
      }

      if (sendNotif && targets.includes(classId)) {
        await notifyUsers({
          userIds: classMembers.filter((m) => m.uid !== user.uid).map((m) => m.uid),
          classId,
          title: `[${category}] ${title.trim()}`,
          message: message.trim(),
          category: priority === 'URGENT' ? 'Urgent' : 'Pengumuman',
          link: 'informasi',
        });
      }

      await recordAuditLog({
        user,
        action: 'CREATE',
        targetType: 'information',
        targetId: targets.join(','),
        details: `Mempublikasikan info "${title.trim()}" ke ${targets.length} kelas.`,
      });

      setTitle('');
      setMessage('');
      setCategory('PENGUMUMAN');
      setPriority('NORMAL');
      setIsPinned(false);
      setPhotos([]);
      setTargetClassIds([classId]);
      setShowForm(false);
      showToast('Informasi berhasil dipublikasikan', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mempublikasikan informasi', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleTogglePin = async (item: UnifiedFeedItem) => {
    if (item.source !== 'information') return;
    try {
      await updateDocumentFields('information', item.id, {
        isPinned: !item.isPinned,
        updatedAt: new Date().toISOString(),
      });
      showToast(item.isPinned ? 'Sematkan dilepas' : 'Informasi disematkan di atas', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengubah status pin', 'error');
    }
  };

  const handleDelete = async (item: UnifiedFeedItem) => {
    try {
      await removeDocument(item.source, item.id);
      await recordAuditLog({
        user,
        action: 'DELETE',
        targetType: item.source,
        targetId: item.id,
        details: `Menghapus info "${item.title}".`,
      });
      setConfirmDeleteKey(null);
      showToast('Pengumuman dihapus', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus pengumuman', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Papan Informasi Produksi
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Pengumuman resmi, lampiran foto referensi, dan instruksi kegiatan produksi teater.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs inline-flex items-center gap-2 whitespace-nowrap self-start cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Buat Pengumuman
          </button>
        )}
      </div>

      {showForm && canCreate && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Judul Pengumuman *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Jadwal Gladi Resik Dipercepat"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Kategori
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as InformationItem['category'])}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="PENGUMUMAN">Pengumuman</option>
                <option value="INFO">Info Umum</option>
                <option value="URGENT">Urgent</option>
                <option value="JADWAL">Jadwal</option>
                <option value="KEUANGAN">Keuangan</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Prioritas
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'NORMAL' | 'HIGH' | 'URGENT')}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="NORMAL">NORMAL</option>
                <option value="HIGH">HIGH (Penting)</option>
                <option value="URGENT">URGENT (Mendesak)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Isi Pengumuman * (URL otomatis bisa diklik)
            </label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tuliskan informasi lengkap atau tempel link Drive/grup..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          {canMultiClass && (
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Terbitkan ke Kelas:
              </p>
              <div className="flex flex-wrap gap-2">
                {allClasses.map((c) => {
                  const selected = targetClassIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleTargetClass(c.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                        selected
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Foto Lampiran (maks 5) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Lampiran Foto ({photos.length}/5)
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => void handlePhotoUpload(e)}
                className="hidden"
              />
              {photos.length < 5 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <ImagePlus className="w-3.5 h-3.5 text-amber-500" />
                  Tambah Foto
                </button>
              )}
            </div>
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {photos.map((url, idx) => (
                  <div key={idx} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                    <img src={url} alt={`Lampiran ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotos((p) => p.filter((_, i) => i !== idx))}
                      className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/70 text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 text-amber-500"
                />
                Sematkan di paling atas (Pin)
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendNotif}
                  onChange={(e) => setSendNotif(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 text-amber-500"
                />
                Kirim notifikasi real-time
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                {busy ? 'Mengirim...' : 'Publikasikan'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari judul atau isi pengumuman..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          {(['ALL', 'URGENT', 'HIGH', 'NORMAL'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriorityFilter(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                priorityFilter === p
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {p === 'ALL' ? 'Semua' : p}
            </button>
          ))}
        </div>
      </div>

      {mergedItems.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-10 text-center">
          <Megaphone className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Belum ada pengumuman
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Pengumuman dari Guru Pengampu, Pimpinan Produksi, atau Sekretaris akan tampil di sini.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {mergedItems.map((item) => {
            const catInfo = INFO_CAT_META[item.category] || INFO_CAT_META.PENGUMUMAN;
            const itemKey = `${item.source}_${item.id}`;
            return (
              <article
                key={itemKey}
                className={`rounded-2xl border bg-white/95 dark:bg-slate-900/95 p-5 ${
                  item.isPinned
                    ? 'border-amber-400 dark:border-amber-600 shadow-md'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs mb-1">
                      {item.isPinned && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 font-bold text-[10px] inline-flex items-center gap-1">
                          <Pin className="w-3 h-3" /> Disematkan
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${catInfo.cls}`}>
                        {catInfo.label}
                      </span>
                      <span
                        className={`font-bold ${
                          item.priority === 'URGENT'
                            ? 'text-rose-600 dark:text-rose-400'
                            : item.priority === 'HIGH'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {item.priority}
                      </span>
                      <span className="text-slate-400" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {item.authorName} ({item.authorRole})
                      </span>
                      <span className="text-slate-400" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>
                    <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                      {item.title}
                    </h3>
                  </div>

                  {(canCreate || item.authorId === user.uid) && (
                    <div className="flex items-center gap-1 shrink-0">
                      {canCreate && item.source === 'information' && (
                        <button
                          type="button"
                          onClick={() => void handleTogglePin(item)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-500/10"
                          title={item.isPinned ? 'Lepas sematan' : 'Sematkan'}
                        >
                          {item.isPinned ? (
                            <PinOff className="w-4 h-4 text-amber-500" />
                          ) : (
                            <Pin className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      {confirmDeleteKey === itemKey ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleDelete(item)}
                            className="px-2 py-1 rounded bg-rose-600 text-white text-[10px] font-bold"
                          >
                            Yakin
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteKey(null)}
                            className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteKey(itemKey)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"
                          aria-label="Hapus pengumuman"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <p className="mt-2.5 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                  {renderTextWithLinks(item.body)}
                </p>

                {item.photoUrls.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.photoUrls.map((url, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setLightboxUrl(url)}
                        className="w-24 h-24 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 hover:opacity-90 cursor-pointer"
                      >
                        <img
                          src={url}
                          alt={`${item.title} foto ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Pratinjau lampiran"
            className="max-w-full max-h-[85vh] rounded-2xl object-contain"
          />
        </div>
      )}
    </div>
  );
};

export const BroadcastModule: React.FC<InfoProps> = ({
  user,
  classId,
  broadcasts,
  classMembers,
}) => {
  const { showToast } = useToast();
  const canSend = isCoreCommitteeRole(user.role);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'NORMAL' | 'HIGH' | 'URGENT'>('HIGH');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      showToast('Lengkapi judul dan pesan broadcast', 'warning');
      return;
    }
    setBusy(true);
    try {
      const id = makeSafeId('bc');
      await upsertDocument('broadcasts', id, {
        id,
        classId,
        title: title.trim(),
        message: message.trim(),
        senderId: user.uid,
        senderName: user.name,
        senderRole: user.role,
        priority,
        createdAt: new Date().toISOString(),
      });
      await notifyUsers({
        userIds: classMembers.filter((m) => m.uid !== user.uid).map((m) => m.uid),
        classId,
        title: `Broadcast: ${title.trim()}`,
        message: message.trim(),
        category: priority === 'URGENT' ? 'Urgent' : 'Pengumuman',
        link: 'informasi',
      });
      await recordAuditLog({
        user,
        action: 'CREATE',
        targetType: 'broadcast',
        targetId: id,
        details: `Broadcast cepat ke ${classMembers.length} anggota kelas ${classId}.`,
      });
      setTitle('');
      setMessage('');
      setPreview(false);
      showToast('Broadcast terkirim ke seluruh anggota kelas', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengirim broadcast', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteBroadcast = async (id: string) => {
    try {
      await removeDocument('broadcasts', id);
      setConfirmDeleteId(null);
      showToast('Broadcast dihapus', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus broadcast', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
          Broadcast Cepat Pengurus
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Kirim pesan instan beserta notifikasi ke seluruh siswa di kelas aktif.
        </p>
      </div>

      {canSend ? (
        <form
          onSubmit={handleSend}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Judul broadcast..."
              className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'NORMAL' | 'HIGH' | 'URGENT')}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="NORMAL">NORMAL</option>
              <option value="HIGH">HIGH</option>
              <option value="URGENT">URGENT</option>
            </select>
          </div>
          <textarea
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tulis isi pesan broadcast..."
            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
          />

          {preview && (title || message) && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-1">
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                Pratinjau ({priority}) · Target: {classMembers.length} anggota
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {title || '(Tanpa judul)'}
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line">
                {message}
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setPreview(!preview)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              {preview ? 'Tutup Pratinjau' : 'Pratinjau'}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Radio className="w-4 h-4" />
              {busy ? 'Mengirim...' : 'Kirim Broadcast'}
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 text-xs text-slate-500 dark:text-slate-400">
          Hanya Pengurus Inti dan Guru Pengampu yang dapat mengirim broadcast baru.
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5">
        <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white mb-3">
          Riwayat Broadcast Terkirim
        </h3>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {[...broadcasts]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 12)
            .map((b) => (
              <div key={b.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {b.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                    {b.message}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono tabular-nums">
                    {b.priority} · {b.senderName} · {formatRelativeTime(b.createdAt)}
                  </p>
                </div>
                {canSend && (
                  confirmDeleteId === b.id ? (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleDeleteBroadcast(b.id)}
                        className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold"
                      >
                        Yakin
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(b.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-500"
                      aria-label="Hapus broadcast"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export const WelcomeBroadcastModule: React.FC<{
  user: UserProfile;
  allClasses: SchoolClass[];
  allUsers: UserProfile[];
}> = ({ user, allClasses, allUsers }) => {
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'NORMAL' | 'HIGH' | 'URGENT'>('HIGH');
  const [busy, setBusy] = useState(false);

  if (!isAdminRole(user.role)) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-6 text-sm text-slate-500">
        Hanya Administrator yang dapat mengirim broadcast lintas kelas.
      </div>
    );
  }

  const handleGlobalSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      showToast('Isi judul dan pesan broadcast global', 'warning');
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      for (const cls of allClasses) {
        const bcId = makeSafeId(`gbc_${cls.id}`);
        await upsertDocument('broadcasts', bcId, {
          id: bcId,
          classId: cls.id,
          title: `[GLOBAL] ${title.trim()}`,
          message: message.trim(),
          senderId: user.uid,
          senderName: user.name,
          senderRole: user.role,
          priority,
          isGlobal: true,
          createdAt: now,
        });
      }
      await notifyUsers({
        userIds: allUsers.map((u) => u.uid),
        classId: allClasses[0]?.id || 'IX-A',
        title: `[Pengumuman Sekolah] ${title.trim()}`,
        message: message.trim(),
        category: priority === 'URGENT' ? 'Urgent' : 'Pengumuman',
        link: 'informasi',
      });
      await recordAuditLog({
        user,
        action: 'CREATE',
        targetType: 'globalBroadcast',
        targetId: 'ALL',
        details: `Broadcast global ke ${allUsers.length} pengguna di ${allClasses.length} kelas.`,
      });
      setTitle('');
      setMessage('');
      showToast(
        `Terkirim ke ${allUsers.length} pengguna dari ${allClasses.length} kelas`,
        'success'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengirim broadcast global', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
          Broadcast Global Lintas Kelas
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Kirim pengumuman sekolah ke seluruh kelas IX sekaligus.
        </p>
      </div>

      <form
        onSubmit={handleGlobalSend}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-4"
      >
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-700 dark:text-blue-200">
          Target pengiriman:{' '}
          <strong className="font-mono tabular-nums">{allUsers.length}</strong> pengguna dari{' '}
          <strong className="font-mono tabular-nums">{allClasses.length}</strong> kelas aktif.
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Judul pengumuman sekolah..."
            className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as 'NORMAL' | 'HIGH' | 'URGENT')}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
          >
            <option value="NORMAL">NORMAL</option>
            <option value="HIGH">HIGH</option>
            <option value="URGENT">URGENT</option>
          </select>
        </div>
        <textarea
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Isi pesan pengumuman resmi lintas kelas..."
          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {busy ? 'Mengirim...' : 'Kirim ke Semua Kelas'}
          </button>
        </div>
      </form>
    </div>
  );
};
