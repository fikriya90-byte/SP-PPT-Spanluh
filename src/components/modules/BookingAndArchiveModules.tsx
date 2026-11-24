import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  FolderOpen,
  MessageCircle,
  MessageSquareWarning,
  Package,
  Plus,
  Printer,
  Search,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { isCoordinatorOrAbove, isTeacherOrAdmin } from '../../core/constants';
import {
  BookingItem,
  ComplaintItem,
  DocumentItem,
  DriveFolderItem,
  EquipmentItem,
  NotulensiItem,
  StageManagerConfig,
  UserProfile,
} from '../../core/types';
import {
  makeSafeId,
  notifyUsers,
  recordAuditLog,
  removeDocument,
  upsertDocument,
} from '../../services/firestoreService';
import {
  buildWhatsAppUrl,
  compressImageToBase64,
  formatRelativeTime,
} from '../../utils/imageCompress';
import { useToast } from '../common/Toast';

const DEFAULT_EQUIPMENT_PRESETS: Omit<EquipmentItem, 'classId'>[] = [
  {
    id: 'eq_gambus',
    name: 'Gambus Tradisional',
    category: 'Alat Musik',
    quantity: 2,
    condition: 'BAIK',
    notes: 'Perlengkapan musik pengiring utama Sandima',
    isSchoolWide: true,
  },
  {
    id: 'eq_babun',
    name: 'Babun / Kendang Kutai',
    category: 'Alat Musik',
    quantity: 3,
    condition: 'BAIK',
    notes: 'Alat musik perkusi tradisional',
    isSchoolWide: true,
  },
  {
    id: 'eq_gong',
    name: 'Gong & Kempul',
    category: 'Alat Musik',
    quantity: 1,
    condition: 'BAIK',
    notes: 'Simpan kembali di ruang kesenian setelah latihan',
    isSchoolWide: true,
  },
  {
    id: 'eq_stand_gong',
    name: 'Stand Gong & Pemukul',
    category: 'Alat Musik',
    quantity: 1,
    condition: 'BAIK',
    notes: 'Set lengkap dengan 2 pemukul berlapis kain',
    isSchoolWide: true,
  },
  {
    id: 'eq_sound',
    name: 'Sound System / Mic Wireless',
    category: 'Audio & Panggung',
    quantity: 4,
    condition: 'BAIK',
    notes: 'Pastikan baterai dilepas/diisi ulang setelah pemakaian',
    isSchoolWide: true,
  },
  {
    id: 'eq_kamera',
    name: 'Kamera & Tripod Dokumentasi',
    category: 'Dokumentasi',
    quantity: 2,
    condition: 'BAIK',
    notes: 'Gunakan kartu SD milik divisi masing-masing',
    isSchoolWide: true,
  },
];

function parseMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map((n) => Number(n));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const a1 = parseMinutes(startA);
  const a2 = parseMinutes(endA);
  const b1 = parseMinutes(startB);
  const b2 = parseMinutes(endB);
  return a1 < b2 && b1 < a2;
}

function getBookingStatusBadge(status: BookingItem['status']): string {
  switch (status) {
    case 'APPROVED':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
    case 'CHECKED_OUT':
      return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30';
    case 'RETURNED':
      return 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30';
    case 'REJECTED':
    case 'OVERDUE':
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';
    case 'CANCELLED':
      return 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30';
    default:
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
  }
}

export const BookingGuideModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-amber-500" />
              Panduan Peminjaman Alat Sekolah
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Tata tertib pemakaian fasilitas seni & produksi teater SMPN 10 Samarinda
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <ol className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300 list-decimal pl-4 leading-relaxed">
          <li>
            <strong>Aturan Pengajuan H-2:</strong> Peminjaman alat oleh siswa wajib diajukan paling lambat{' '}
            <span className="font-semibold text-amber-600 dark:text-amber-400">2 hari sebelum tanggal pakai</span>{' '}
            agar Guru Pengampu memiliki waktu verifikasi jadwal antar kelas.
          </li>
          <li>
            <strong>Durasi Maksimal 60 Menit per Sesi:</strong> Demi pemerataan giliran latihan antar rombel, satu sesi
            pengajuan dibatasi maksimal <strong>60 menit</strong> (kecuali disetujui/disesuaikan oleh Guru Pengampu).
          </li>
          <li>
            <strong>Anti-Bentrok Otomatis:</strong> Sistem menolak pengajuan jika alat yang sama sudah dibooking oleh
            siswa/kelas lain pada tanggal dan jam yang beririsan.
          </li>
          <li>
            <strong>Multi-Alat Sekali Sesi:</strong> Anda dapat mencentang beberapa alat sekaligus dalam satu sesi
            keperluan agar tercatat rapi dengan ID sesi bersama.
          </li>
          <li>
            <strong>Bukti Foto Ambil & Kembali:</strong> Setelah disetujui (<code>APPROVED</code>), wajib unggah{' '}
            <strong>Foto Ambil (Check-Out)</strong> saat serah terima, dan <strong>Foto Kembali</strong> beserta kondisi
            alat saat dikembalikan.
          </li>
        </ol>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs"
          >
            Saya Mengerti
          </button>
        </div>
      </div>
    </div>
  );
};

export const BookingCalendarModule: React.FC<{
  bookings: BookingItem[];
  equipment?: EquipmentItem[];
  currentUserId?: string;
}> = ({ bookings, equipment = [], currentUserId }) => {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PENDING' | 'RETURNED'>('ALL');
  const [onlyMine, setOnlyMine] = useState(false);

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (onlyMine && currentUserId && b.bookerId !== currentUserId) return false;
      if (statusFilter === 'ACTIVE') return b.status === 'APPROVED' || b.status === 'CHECKED_OUT' || b.status === 'OVERDUE';
      if (statusFilter === 'PENDING') return b.status === 'PENDING';
      if (statusFilter === 'RETURNED') return b.status === 'RETURNED';
      return b.status !== 'CANCELLED';
    });
  }, [bookings, statusFilter, onlyMine, currentUserId]);

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, BookingItem[]>();
    filteredBookings.forEach((b) => {
      const list = map.get(b.date) || [];
      list.push(b);
      map.set(b.date, list);
    });
    return map;
  }, [filteredBookings]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const monthLabel = cursor.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

  const selectedItems = useMemo(() => {
    return [...(bookingsByDate.get(selectedDate) || [])].sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    );
  }, [bookingsByDate, selectedDate]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h3 className="font-display font-bold text-sm sm:text-base text-slate-900 dark:text-white min-w-36 text-center capitalize">
            {monthLabel}
          </h3>
          <button
            type="button"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['ALL', 'ACTIVE', 'PENDING', 'RETURNED'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                statusFilter === st
                  ? 'bg-amber-500 text-slate-950'
                  : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {st === 'ALL'
                ? 'Semua'
                : st === 'ACTIVE'
                  ? 'Disetujui / Dipinjam'
                  : st === 'PENDING'
                    ? 'Menunggu'
                    : 'Dikembalikan'}
            </button>
          ))}
          {currentUserId && (
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer ml-1">
              <input
                type="checkbox"
                checked={onlyMine}
                onChange={(e) => setOnlyMine(e.target.checked)}
              />
              Booking Saya
            </label>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4">
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-500 pb-2">
            {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} className="h-16 sm:h-20" />;
              const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayItems = bookingsByDate.get(iso) || [];
              const isSelected = selectedDate === iso;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelectedDate(iso)}
                  className={`h-16 sm:h-20 rounded-xl border p-1.5 text-left flex flex-col justify-between transition-colors ${
                    isSelected
                      ? 'border-amber-500 bg-amber-500/15'
                      : 'border-slate-200 dark:border-slate-800 hover:border-amber-500/40'
                  }`}
                >
                  <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">{day}</span>
                  {dayItems.length > 0 && (
                    <div className="space-y-0.5 overflow-hidden">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                        {dayItems.length} sesi
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-display font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-amber-500" />
              Jadwal {selectedDate}
            </h4>
            <span className="text-[11px] font-mono text-slate-500">{equipment.length} jenis alat</span>
          </div>

          {selectedItems.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">
              Tidak ada peminjaman alat pada tanggal ini.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {selectedItems.map((b) => (
                <div
                  key={b.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 p-3 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400">
                      {b.startTime}–{b.endTime}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${getBookingStatusBadge(
                        b.status
                      )}`}
                    >
                      {b.status}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{b.equipmentName}</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    {b.bookerName} · {b.purpose}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const BookingModule: React.FC<{
  user: UserProfile;
  classId: string;
  bookings: BookingItem[];
  classMembers: UserProfile[];
  equipment?: EquipmentItem[];
  stageConfig?: StageManagerConfig;
}> = ({ user, classId, bookings, classMembers, equipment = [], stageConfig }) => {
  const { showToast } = useToast();
  const isTeacher = isTeacherOrAdmin(user.role);
  const canManageEquipment = isTeacher || isCoordinatorOrAbove(user.role);

  const [activeTab, setActiveTab] = useState<'list' | 'calendar' | 'equipment'>('list');
  const [showGuide, setShowGuide] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [busy, setBusy] = useState(false);

  // Booking request state
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [customToolName, setCustomToolName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [date, setDate] = useState(() => new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('15:00');

  // Teacher verify / reject modal state
  const [approvingItem, setApprovingItem] = useState<BookingItem | null>(null);
  const [adjStartTime, setAdjStartTime] = useState('');
  const [adjEndTime, setAdjEndTime] = useState('');
  const [verifierNote, setVerifierNote] = useState('');

  const [rejectingItem, setRejectingItem] = useState<BookingItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [recDate, setRecDate] = useState('');
  const [recStartTime, setRecStartTime] = useState('');
  const [recEndTime, setRecEndTime] = useState('');

  // Return modal/inline state
  const [returningItem, setReturningItem] = useState<BookingItem | null>(null);
  const [returnCondition, setReturnCondition] = useState<'BAIK' | 'RUSAK_RINGAN' | 'RUSAK_BERAT'>('BAIK');
  const [returnNote, setReturnNote] = useState('');
  const [returnPhotoFile, setReturnPhotoFile] = useState<File | null>(null);

  // Checkout inline note
  const [checkoutNotes, setCheckoutNotes] = useState<Record<string, string>>({});
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  // Equipment CRUD state
  const [eqName, setEqName] = useState('');
  const [eqCat, setEqCat] = useState('Alat Musik');
  const [eqQty, setEqQty] = useState(1);
  const [eqCond, setEqCond] = useState<EquipmentItem['condition']>('BAIK');
  const [eqNotes, setEqNotes] = useState('');
  const [eqSchoolWide, setEqSchoolWide] = useState(false);
  const [confirmDeleteEqId, setConfirmDeleteEqId] = useState<string | null>(null);

  const teachers = useMemo(() => classMembers.filter((m) => isTeacherOrAdmin(m.role)), [classMembers]);

  const mergedEquipment = useMemo(() => {
    const map = new Map<string, EquipmentItem>();
    DEFAULT_EQUIPMENT_PRESETS.forEach((p) => {
      map.set(p.name.toLowerCase(), { ...p, classId: 'SCHOOL_WIDE' });
    });
    equipment.forEach((item) => {
      map.set(item.name.toLowerCase(), item);
    });
    return Array.from(map.values());
  }, [equipment]);

  const visibleBookings = useMemo(() => {
    return [...bookings]
      .filter((b) => (onlyMine ? b.bookerId === user.uid : true))
      .filter((b) => (statusFilter === 'ALL' ? true : b.status === statusFilter))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [bookings, onlyMine, statusFilter, user.uid]);

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    const toolsToBook = [...selectedTools];
    if (customToolName.trim()) {
      toolsToBook.push(customToolName.trim());
    }
    if (toolsToBook.length === 0 || !purpose.trim()) {
      showToast('Pilih minimal satu alat dan isi keperluan peminjaman', 'warning');
      return;
    }
    const startMin = parseMinutes(startTime);
    const endMin = parseMinutes(endTime);
    if (endMin <= startMin) {
      showToast('Jam selesai harus lebih lambat dari jam mulai', 'warning');
      return;
    }
    if (endMin - startMin > 60 && !isTeacher) {
      showToast('Durasi peminjaman maksimal 60 menit per sesi untuk siswa', 'warning');
      return;
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    const diffDays = (new Date(`${date}T00:00:00`).getTime() - new Date(`${todayStr}T00:00:00`).getTime()) / 86400000;
    if (diffDays < 2 && !isTeacher) {
      showToast('Aturan H-2: Booking wajib diajukan minimal 2 hari sebelum tanggal pakai', 'warning');
      return;
    }

    // Conflict validation per selected tool
    for (const toolName of toolsToBook) {
      const conflict = bookings.find(
        (b) =>
          b.date === date &&
          b.equipmentName.toLowerCase() === toolName.toLowerCase() &&
          ['PENDING', 'APPROVED', 'CHECKED_OUT'].includes(b.status) &&
          timesOverlap(startTime, endTime, b.startTime, b.endTime)
      );
      if (conflict) {
        showToast(
          `Bentrok jadwal! "${toolName}" sudah dibooking ${conflict.bookerName} (${conflict.startTime}–${conflict.endTime}).`,
          'error'
        );
        return;
      }
    }

    setBusy(true);
    try {
      const sessionId = makeSafeId('bks');
      const now = new Date().toISOString();
      for (const toolName of toolsToBook) {
        const eqObj = mergedEquipment.find((eq) => eq.name.toLowerCase() === toolName.toLowerCase());
        const id = makeSafeId('bk');
        const item: BookingItem = {
          id,
          sessionId,
          classId,
          equipmentId: eqObj?.id || '',
          equipmentName: toolName,
          equipmentCategory: eqObj?.category || 'Lainnya',
          purpose: purpose.trim(),
          bookerName: user.name,
          bookerId: user.uid,
          bookedBy: user.uid,
          bookerRole: user.role,
          bookerDivision: user.divisionName,
          bookerPhone: user.phone || '',
          date,
          startTime,
          endTime,
          status: 'PENDING',
          createdAt: now,
        };
        await upsertDocument('bookings', id, item as unknown as Record<string, unknown>);
      }
      await notifyUsers({
        userIds: teachers.map((t) => t.uid),
        classId,
        title: `Pengajuan Pinjam Alat (${toolsToBook.length} item)`,
        message: `${user.name} mengajukan ${toolsToBook.join(', ')} pada ${date} (${startTime}–${endTime}).`,
        category: 'Reminder',
        link: 'booking',
      });
      await recordAuditLog({
        userId: user.uid,
        userName: user.name,
        role: user.role,
        action: 'CREATE',
        targetType: 'booking',
        targetId: sessionId,
        details: `Mengajukan ${toolsToBook.join(', ')} untuk ${date} ${startTime}-${endTime}`,
      });
      setSelectedTools([]);
      setCustomToolName('');
      setPurpose('');
      setShowForm(false);
      showToast(`${toolsToBook.length} pengajuan booking alat dikirim ke Guru Pengampu`, 'success');
    } catch (err) {
      showToast('Gagal mengirim pengajuan booking', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const openApproveModal = (b: BookingItem) => {
    setApprovingItem(b);
    setAdjStartTime(b.startTime);
    setAdjEndTime(b.endTime);
    setVerifierNote(b.verifierNote || '');
  };

  const handleConfirmApprove = async () => {
    if (!approvingItem) return;
    if (parseMinutes(adjEndTime) <= parseMinutes(adjStartTime)) {
      showToast('Jam selesai harus lebih lambat dari jam mulai', 'warning');
      return;
    }
    setBusy(true);
    try {
      const wasRescheduled =
        adjStartTime !== approvingItem.startTime || adjEndTime !== approvingItem.endTime;
      const now = new Date().toISOString();
      const updated: BookingItem = {
        ...approvingItem,
        status: 'APPROVED',
        startTime: adjStartTime,
        endTime: adjEndTime,
        wasRescheduledByVerifier: wasRescheduled,
        originalStartTime: wasRescheduled ? approvingItem.startTime : approvingItem.originalStartTime,
        originalEndTime: wasRescheduled ? approvingItem.endTime : approvingItem.originalEndTime,
        verifierNote: verifierNote.trim(),
        approvedBy: user.name,
        approvedAt: now,
      };
      await upsertDocument('bookings', approvingItem.id, updated as unknown as Record<string, unknown>);
      await notifyUsers({
        userIds: [approvingItem.bookerId],
        classId,
        title: `Booking Disetujui: ${approvingItem.equipmentName}`,
        message: wasRescheduled
          ? `${user.name} menyetujui dengan penyesuaian waktu ke ${adjStartTime}–${adjEndTime}.`
          : `${user.name} menyetujui peminjaman untuk ${approvingItem.date} (${adjStartTime}–${adjEndTime}).`,
        category: 'Sistem',
        link: 'booking',
      });
      setApprovingItem(null);
      showToast('Booking berhasil disetujui', 'success');
    } catch (err) {
      showToast('Gagal menyetujui booking', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const openRejectModal = (b: BookingItem) => {
    setRejectingItem(b);
    setRejectionReason('');
    setRecDate(b.date);
    setRecStartTime(b.startTime);
    setRecEndTime(b.endTime);
  };

  const handleConfirmReject = async () => {
    if (!rejectingItem) return;
    if (!rejectionReason.trim()) {
      showToast('Alasan penolakan wajib diisi', 'warning');
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const updated: BookingItem = {
        ...rejectingItem,
        status: 'REJECTED',
        rejectionReason: rejectionReason.trim(),
        recommendedDate: recDate || undefined,
        recommendedStartTime: recStartTime || undefined,
        recommendedEndTime: recEndTime || undefined,
        approvedBy: user.name,
        approvedAt: now,
      };
      await upsertDocument('bookings', rejectingItem.id, updated as unknown as Record<string, unknown>);
      await notifyUsers({
        userIds: [rejectingItem.bookerId],
        classId,
        title: `Booking Ditolak: ${rejectingItem.equipmentName}`,
        message: `Alasan: ${rejectionReason.trim()}${
          recDate ? `. Rekomendasi waktu: ${recDate} ${recStartTime}-${recEndTime}` : ''
        }`,
        category: 'Urgent',
        link: 'booking',
      });
      setRejectingItem(null);
      showToast('Booking ditolak dan notifikasi dikirim', 'info');
    } catch (err) {
      showToast('Gagal menolak booking', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleCheckOutPhoto = async (b: BookingItem, file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await compressImageToBase64(file, 220);
      const now = new Date().toISOString();
      const note = (checkoutNotes[b.id] || '').trim();
      await upsertDocument('bookings', b.id, {
        ...b,
        status: 'CHECKED_OUT',
        checkedOutAt: now,
        checkoutPhotoUrl: dataUrl,
        photoOut: dataUrl,
        checkoutNote: note,
      });
      showToast('Foto serah terima pengambilan tersimpan (CHECKED_OUT)', 'success');
    } catch (err) {
      showToast('Gagal mengunggah foto pengambilan', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returningItem) return;
    if (!returnPhotoFile) {
      showToast('Foto pengembalian alat wajib diunggah', 'warning');
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await compressImageToBase64(returnPhotoFile, 220);
      const nowDate = new Date();
      const scheduledEnd = new Date(`${returningItem.date}T${returningItem.endTime}:00`);
      const isLateReturn = !Number.isNaN(scheduledEnd.getTime()) && nowDate > scheduledEnd;
      await upsertDocument('bookings', returningItem.id, {
        ...returningItem,
        status: 'RETURNED',
        returnedAt: nowDate.toISOString(),
        returnPhotoUrl: dataUrl,
        photoIn: dataUrl,
        returnCondition,
        returnNote: returnNote.trim(),
        isLateReturn,
      });
      setReturningItem(null);
      setReturnPhotoFile(null);
      setReturnNote('');
      showToast(
        isLateReturn
          ? 'Alat dikembalikan (tercatat terlambat melewati jam selesai)'
          : 'Alat berhasil dikembalikan dengan baik (RETURNED)',
        'success'
      );
    } catch (err) {
      showToast('Gagal memproses pengembalian', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleCancelBooking = async (b: BookingItem) => {
    setBusy(true);
    try {
      await upsertDocument('bookings', b.id, {
        ...b,
        status: 'CANCELLED',
        cancelledAt: new Date().toISOString(),
        cancelledBy: user.name,
      });
      setConfirmCancelId(null);
      showToast('Booking dibatalkan', 'info');
    } catch (err) {
      showToast('Gagal membatalkan booking', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eqName.trim()) {
      showToast('Nama inventaris alat wajib diisi', 'warning');
      return;
    }
    setBusy(true);
    try {
      const id = makeSafeId('eq');
      const item: EquipmentItem = {
        id,
        classId: eqSchoolWide ? 'SCHOOL_WIDE' : classId,
        name: eqName.trim(),
        category: eqCat,
        quantity: Math.max(1, Number(eqQty) || 1),
        condition: eqCond,
        notes: eqNotes.trim(),
        isCustom: true,
        isSchoolWide: eqSchoolWide,
        addedByName: user.name,
        createdAt: new Date().toISOString(),
      };
      await upsertDocument('equipment', id, item as unknown as Record<string, unknown>);
      setEqName('');
      setEqQty(1);
      setEqNotes('');
      showToast('Alat ditambahkan ke daftar inventaris', 'success');
    } catch (err) {
      showToast('Gagal menambah inventaris alat', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteEquipment = async (id: string) => {
    setBusy(true);
    try {
      await removeDocument('equipment', id);
      setConfirmDeleteEqId(null);
      showToast('Item inventaris dihapus', 'info');
    } catch (err) {
      showToast('Gagal menghapus inventaris', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wrench className="w-5 h-5 text-amber-500" />
            Booking & Peminjaman Alat Sekolah
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tahap aktif: {stageConfig?.currentStage || 'PERSIAPAN'} · Aturan H-2, maks. 60 menit/sesi, & foto serah terima.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-500" /> Panduan
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('list');
              setShowForm(!showForm);
            }}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Ajukan Pinjam Alat
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {[
          { id: 'list' as const, label: `Daftar Booking (${bookings.length})`, icon: Wrench },
          { id: 'calendar' as const, label: 'Kalender Jadwal', icon: Calendar },
          { id: 'equipment' as const, label: `Inventaris Alat (${mergedEquipment.length})`, icon: Package },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                activeTab === tab.id
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-white/90 dark:bg-slate-900/90 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'list' && (
        <>
          {showForm && (
            <form
              onSubmit={handleBook}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-4"
            >
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                  Pilih Alat yang Dipinjam (Bisa Multi-Alat untuk 1 Sesi):
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {mergedEquipment.map((eq) => {
                    const checked = selectedTools.includes(eq.name);
                    return (
                      <label
                        key={eq.id}
                        className={`flex items-start gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                          checked
                            ? 'border-amber-500 bg-amber-500/10 text-slate-900 dark:text-white'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSelectedTools((prev) =>
                              e.target.checked ? [...prev, eq.name] : prev.filter((n) => n !== eq.name)
                            )
                          }
                          className="mt-0.5"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{eq.name}</p>
                          <p className="text-[10px] text-slate-500">
                            {eq.category} · Stok {eq.quantity} ({eq.condition})
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  type="text"
                  value={customToolName}
                  onChange={(e) => setCustomToolName(e.target.value)}
                  placeholder="Alat tambahan lain (opsional)..."
                  className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
                />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono"
                />
                <div className="flex items-center gap-1.5">
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="flex-1 px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono"
                  />
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="flex-1 px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Keperluan penggunaan alat (misal: Latihan musik adegan 3)..."
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-semibold text-xs"
                >
                  {busy ? 'Mengirim...' : 'Kirim Pengajuan'}
                </button>
              </div>
            </form>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(['ALL', 'PENDING', 'APPROVED', 'CHECKED_OUT', 'RETURNED', 'REJECTED', 'CANCELLED'] as const).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                      statusFilter === st
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {st === 'ALL' ? 'Semua Status' : st}
                  </button>
                )
              )}
            </div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyMine}
                onChange={(e) => setOnlyMine(e.target.checked)}
              />
              Hanya Booking Saya
            </label>
          </div>

          {visibleBookings.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-10 text-center text-xs text-slate-500">
              Belum ada data peminjaman alat pada filter ini.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleBookings.map((b) => (
                <div
                  key={b.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${getBookingStatusBadge(
                            b.status
                          )}`}
                        >
                          {b.status}
                        </span>
                        <span className="font-mono text-slate-500">
                          {b.date} · {b.startTime}–{b.endTime}
                        </span>
                        {b.wasRescheduledByVerifier && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-300 font-semibold">
                            Waktu Disesuaikan Guru (asal: {b.originalStartTime}–{b.originalEndTime})
                          </span>
                        )}
                        {b.isLateReturn && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-300 font-semibold">
                            Kembali Terlambat
                          </span>
                        )}
                      </div>
                      <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                        {b.equipmentName}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        Peminjam: <span className="font-semibold">{b.bookerName}</span> · {b.purpose}
                      </p>
                      {b.verifierNote && (
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                          Catatan Verifikator: {b.verifierNote}
                        </p>
                      )}
                      {b.rejectionReason && (
                        <p className="text-[11px] text-rose-600 dark:text-rose-400">
                          Alasan Penolakan: {b.rejectionReason}
                          {b.recommendedDate
                            ? ` · Saran Jadwal: ${b.recommendedDate} (${b.recommendedStartTime}–${b.recommendedEndTime})`
                            : ''}
                        </p>
                      )}
                      {b.returnCondition && (
                        <p className="text-[11px] text-slate-500">
                          Kondisi Kembali: <strong>{b.returnCondition}</strong>
                          {b.returnNote ? ` — ${b.returnNote}` : ''}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {isTeacher && b.status === 'PENDING' && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openApproveModal(b)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" /> Setujui
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openRejectModal(b)}
                            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" /> Tolak
                          </button>
                        </>
                      )}

                      {b.status === 'APPROVED' && (b.bookerId === user.uid || isTeacher) && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <input
                            type="text"
                            value={checkoutNotes[b.id] || ''}
                            onChange={(e) =>
                              setCheckoutNotes((prev) => ({ ...prev, [b.id]: e.target.value }))
                            }
                            placeholder="Catatan ambil..."
                            className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-[11px] w-32"
                          />
                          <label className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                            <Camera className="w-3.5 h-3.5" /> Foto Ambil
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handleCheckOutPhoto(b, e.target.files?.[0])}
                            />
                          </label>
                        </div>
                      )}

                      {(b.status === 'CHECKED_OUT' || b.status === 'OVERDUE') &&
                        (b.bookerId === user.uid || isTeacher) && (
                          <button
                            type="button"
                            onClick={() => {
                              setReturningItem(b);
                              setReturnCondition('BAIK');
                              setReturnNote('');
                              setReturnPhotoFile(null);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                          >
                            <Camera className="w-3.5 h-3.5" /> Kembalikan Alat
                          </button>
                        )}

                      {(b.status === 'PENDING' || b.status === 'APPROVED') &&
                        (b.bookerId === user.uid || isTeacher) &&
                        (confirmCancelId === b.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleCancelBooking(b)}
                              className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-semibold"
                            >
                              Ya, Batalkan
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmCancelId(null)}
                              className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-[11px]"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmCancelId(b.id)}
                            className="px-2.5 py-1.5 rounded-lg text-xs text-rose-500 hover:bg-rose-500/10"
                          >
                            Batalkan
                          </button>
                        ))}

                      {isTeacher && b.bookerPhone && (
                        <a
                          href={buildWhatsAppUrl(
                            b.bookerPhone,
                            `Halo ${b.bookerName}, terkait peminjaman ${b.equipmentName} (${b.date})...`
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-emerald-500"
                          title="Hubungi via WhatsApp"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>

                  {(b.checkoutPhotoUrl || b.photoOut || b.returnPhotoUrl || b.photoIn) && (
                    <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                      {(b.checkoutPhotoUrl || b.photoOut) && (
                        <button
                          type="button"
                          onClick={() => setLightboxPhoto(b.checkoutPhotoUrl || b.photoOut || null)}
                          className="inline-flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 hover:underline"
                        >
                          <img
                            src={b.checkoutPhotoUrl || b.photoOut}
                            alt="Foto Ambil"
                            className="w-9 h-9 rounded-lg object-cover border border-slate-300 dark:border-slate-700"
                          />
                          Foto Ambil
                        </button>
                      )}
                      {(b.returnPhotoUrl || b.photoIn) && (
                        <button
                          type="button"
                          onClick={() => setLightboxPhoto(b.returnPhotoUrl || b.photoIn || null)}
                          className="inline-flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 hover:underline"
                        >
                          <img
                            src={b.returnPhotoUrl || b.photoIn}
                            alt="Foto Kembali"
                            className="w-9 h-9 rounded-lg object-cover border border-slate-300 dark:border-slate-700"
                          />
                          Foto Kembali
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'calendar' && (
        <BookingCalendarModule
          bookings={bookings}
          equipment={mergedEquipment}
          currentUserId={user.uid}
        />
      )}

      {activeTab === 'equipment' && (
        <div className="space-y-4">
          {canManageEquipment && (
            <form
              onSubmit={handleAddEquipment}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-3"
            >
              <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
                Tambah Inventaris Alat
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  type="text"
                  value={eqName}
                  onChange={(e) => setEqName(e.target.value)}
                  placeholder="Nama alat..."
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
                />
                <select
                  value={eqCat}
                  onChange={(e) => setEqCat(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
                >
                  <option value="Alat Musik">Alat Musik</option>
                  <option value="Audio & Panggung">Audio & Panggung</option>
                  <option value="Dokumentasi">Dokumentasi</option>
                  <option value="Properti & Kostum">Properti & Kostum</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
                <input
                  type="number"
                  min={1}
                  value={eqQty}
                  onChange={(e) => setEqQty(Number(e.target.value))}
                  placeholder="Jumlah"
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono"
                />
                <select
                  value={eqCond}
                  onChange={(e) => setEqCond(e.target.value as EquipmentItem['condition'])}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
                >
                  <option value="BAIK">Kondisi Baik</option>
                  <option value="RUSAK_RINGAN">Rusak Ringan</option>
                  <option value="RUSAK_BERAT">Rusak Berat</option>
                </select>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <input
                  type="text"
                  value={eqNotes}
                  onChange={(e) => setEqNotes(e.target.value)}
                  placeholder="Catatan penyimpanan / penggunaan..."
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
                />
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={eqSchoolWide}
                    onChange={(e) => setEqSchoolWide(e.target.checked)}
                  />
                  Tersedia untuk semua kelas
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-semibold text-xs"
                >
                  Simpan Alat
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {mergedEquipment.map((eq) => (
              <div
                key={eq.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4 flex flex-col justify-between gap-2"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      {eq.category} {eq.isSchoolWide ? '· Umum Sekolah' : ''}
                    </span>
                    <span className="text-[11px] font-mono font-semibold text-slate-500">
                      Qty: {eq.quantity}
                    </span>
                  </div>
                  <h4 className="font-display font-bold text-sm text-slate-900 dark:text-white mt-0.5">
                    {eq.name}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">{eq.notes || '-'}</p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                  <span
                    className={`font-semibold ${
                      eq.condition === 'BAIK'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {eq.condition}
                  </span>
                  {isTeacher && eq.isCustom && (
                    confirmDeleteEqId === eq.id ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDeleteEquipment(eq.id)}
                          className="px-2 py-0.5 rounded bg-rose-600 text-white font-semibold"
                        >
                          Hapus
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteEqId(null)}
                          className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteEqId(eq.id)}
                        className="p-1 text-slate-400 hover:text-rose-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Approve + Adjust Time */}
      {approvingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-2xl">
            <h3 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-500" />
              Setujui Peminjaman Alat
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {approvingItem.equipmentName} — Peminjam: <strong>{approvingItem.bookerName}</strong> ({approvingItem.date})
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-500">Jam Mulai</label>
                <input
                  type="time"
                  value={adjStartTime}
                  onChange={(e) => setAdjStartTime(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500">Jam Selesai</label>
                <input
                  type="time"
                  value={adjEndTime}
                  onChange={(e) => setAdjEndTime(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono"
                />
              </div>
            </div>
            <textarea
              rows={2}
              value={verifierNote}
              onChange={(e) => setVerifierNote(e.target.value)}
              placeholder="Catatan guru / penyesuaian jadwal (opsional)..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setApprovingItem(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmApprove}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
              >
                Konfirmasi Setujui
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reject + Recommendation */}
      {rejectingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-2xl">
            <h3 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              Tolak Pengajuan Peminjaman
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {rejectingItem.equipmentName} — Peminjam: <strong>{rejectingItem.bookerName}</strong>
            </p>
            <textarea
              rows={2}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Alasan penolakan (wajib diisi)..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
            />
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-500">
                Rekomendasi Jadwal Alternatif (Opsional):
              </p>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="date"
                  value={recDate}
                  onChange={(e) => setRecDate(e.target.value)}
                  className="px-2 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-[11px] font-mono"
                />
                <input
                  type="time"
                  value={recStartTime}
                  onChange={(e) => setRecStartTime(e.target.value)}
                  className="px-2 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-[11px] font-mono"
                />
                <input
                  type="time"
                  value={recEndTime}
                  onChange={(e) => setRecEndTime(e.target.value)}
                  className="px-2 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-[11px] font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectingItem(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmReject}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold"
              >
                Tolak Pengajuan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Return Equipment */}
      {returningItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleConfirmReturn}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-2xl"
          >
            <h3 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Camera className="w-4 h-4 text-emerald-500" />
              Pengembalian Alat
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">{returningItem.equipmentName}</p>
            <div>
              <label className="text-[11px] font-semibold text-slate-500">Kondisi Alat Saat Kembali</label>
              <select
                value={returnCondition}
                onChange={(e) =>
                  setReturnCondition(e.target.value as 'BAIK' | 'RUSAK_RINGAN' | 'RUSAK_BERAT')
                }
                className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
              >
                <option value="BAIK">Baik & Lengkap</option>
                <option value="RUSAK_RINGAN">Rusak Ringan</option>
                <option value="RUSAK_BERAT">Rusak Berat / Komponen Hilang</option>
              </select>
            </div>
            <textarea
              rows={2}
              value={returnNote}
              onChange={(e) => setReturnNote(e.target.value)}
              placeholder="Catatan kondisi atau kelengkapan..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
            />
            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                Unggah Foto Bukti Pengembalian (Wajib)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setReturnPhotoFile(e.target.files?.[0] || null)}
                className="text-xs text-slate-600 dark:text-slate-300"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReturningItem(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
              >
                {busy ? 'Menyimpan...' : 'Selesaikan Pengembalian'}
              </button>
            </div>
          </form>
        </div>
      )}

      {lightboxPhoto && (
        <div
          onClick={() => setLightboxPhoto(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
        >
          <img
            src={lightboxPhoto}
            alt="Bukti Foto"
            className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl"
          />
        </div>
      )}

      <BookingGuideModal open={showGuide} onClose={() => setShowGuide(false)} />
    </div>
  );
};

export const NotulensiModule: React.FC<{
  user: UserProfile;
  classId: string;
  notulensiList: NotulensiItem[];
  classMembers: UserProfile[];
}> = ({ user, classId, notulensiList, classMembers }) => {
  const { showToast } = useToast();
  const canEdit =
    isTeacherOrAdmin(user.role) || ['Sekretaris', 'Pimpinan Produksi'].includes(user.role);

  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<NotulensiItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('15:30');
  const [location, setLocation] = useState('Ruang Kelas IX');
  const [agenda, setAgenda] = useState('');
  const [discussion, setDiscussion] = useState('');
  const [decisions, setDecisions] = useState('');
  const [attendees, setAttendees] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...notulensiList]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((n) =>
        !q
          ? true
          : n.title.toLowerCase().includes(q) ||
            n.agenda.toLowerCase().includes(q) ||
            n.location.toLowerCase().includes(q)
      );
  }, [notulensiList, search]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !agenda.trim()) {
      showToast('Judul rapat dan agenda wajib diisi', 'warning');
      return;
    }
    setBusy(true);
    try {
      const id = makeSafeId('not');
      const now = new Date().toISOString();
      const item: NotulensiItem = {
        id,
        classId,
        title: title.trim(),
        date,
        startTime,
        endTime,
        location: location.trim(),
        agenda: agenda.trim(),
        discussion: discussion.trim(),
        decisions: decisions.trim(),
        attendees,
        createdBy: user.uid,
        creatorName: user.name,
        creatorRole: user.role,
        createdAt: now,
        updatedAt: now,
      };
      await upsertDocument('notulensi', id, item as unknown as Record<string, unknown>);
      await notifyUsers({
        userIds: classMembers.filter((m) => m.uid !== user.uid).map((m) => m.uid),
        classId,
        title: `Notulensi Rapat: ${item.title}`,
        message: `Keputusan rapat tanggal ${date} telah diarsipkan oleh ${user.name}.`,
        category: 'Pengumuman',
        link: 'notulensi',
      });
      setTitle('');
      setAgenda('');
      setDiscussion('');
      setDecisions('');
      setAttendees([]);
      setShowForm(false);
      showToast('Notulensi rapat disimpan & notifikasi dikirim', 'success');
    } catch (err) {
      showToast('Gagal menyimpan notulensi', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    try {
      await removeDocument('notulensi', id);
      setConfirmDeleteId(null);
      if (selected?.id === id) setSelected(null);
      showToast('Notulensi dihapus', 'info');
    } catch (err) {
      showToast('Gagal menghapus notulensi', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 no-print">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-500" />
            Notulensi Rapat Produksi
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Catatan resmi rapat, daftar hadir peserta, pembahasan, dan keputusan.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 self-start"
          >
            <Plus className="w-4 h-4" /> Buat Notulen
          </button>
        )}
      </div>

      {showForm && canEdit && (
        <form
          onSubmit={handleSave}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-4 no-print"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Judul rapat..."
              className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono"
            />
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Lokasi..."
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-xs">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono"
            />
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono"
            />
          </div>
          <textarea
            rows={2}
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            placeholder="Agenda rapat..."
            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
          />
          <textarea
            rows={3}
            value={discussion}
            onChange={(e) => setDiscussion(e.target.value)}
            placeholder="Ringkasan pembahasan..."
            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
          />
          <textarea
            rows={3}
            value={decisions}
            onChange={(e) => setDecisions(e.target.value)}
            placeholder="Keputusan & tindak lanjut..."
            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
          />
          <div>
            <p className="text-xs font-semibold mb-2 text-slate-700 dark:text-slate-300">Peserta Hadir:</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto p-2 rounded-xl border border-slate-200 dark:border-slate-800">
              {classMembers.map((m) => (
                <label key={m.uid} className="flex items-center gap-2 text-xs cursor-pointer text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={attendees.includes(m.uid)}
                    onChange={(e) =>
                      setAttendees((prev) =>
                        e.target.checked ? [...prev, m.uid] : prev.filter((id) => id !== m.uid)
                      )
                    }
                  />
                  <span className="truncate">{m.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-semibold"
            >
              {busy ? 'Menyimpan...' : 'Simpan Notulen'}
            </button>
          </div>
        </form>
      )}

      <div className="relative no-print">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari judul, agenda, atau lokasi rapat..."
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-slate-100 text-sm"
        />
      </div>

      {selected && (
        <div className="rounded-2xl border border-amber-500/40 bg-white/95 dark:bg-slate-900/95 p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-mono text-amber-600 dark:text-amber-400 font-bold">
                NOTULEN RAPAT · {selected.date} ({selected.startTime}–{selected.endTime})
              </p>
              <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white mt-1">
                {selected.title}
              </h3>
              <p className="text-xs text-slate-500">
                Lokasi: {selected.location} · Pencatat: {selected.creatorName}
              </p>
            </div>
            <div className="flex gap-2 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold inline-flex items-center gap-1"
              >
                <Printer className="w-3.5 h-3.5" /> Cetak PDF
              </button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
          <div className="space-y-3 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-200">HADIR ({selected.attendees.length}):</p>
              <p className="text-slate-600 dark:text-slate-400">
                {selected.attendees
                  .map((uid) => classMembers.find((m) => m.uid === uid)?.name || uid)
                  .join(', ') || 'Tidak tercatat'}
              </p>
            </div>
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-200">AGENDA:</p>
              <p className="whitespace-pre-line">{selected.agenda}</p>
            </div>
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-200">PEMBAHASAN:</p>
              <p className="whitespace-pre-line">{selected.discussion || '-'}</p>
            </div>
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-200">KEPUTUSAN:</p>
              <p className="whitespace-pre-line">{selected.decisions || '-'}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 no-print">
        {filtered.map((n) => (
          <div
            key={n.id}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 flex flex-col justify-between gap-3"
          >
            <div>
              <p className="text-xs font-mono text-slate-500">
                {n.date} · {n.location}
              </p>
              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white mt-0.5">
                {n.title}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">
                {n.agenda}
              </p>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSelected(n)}
                className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
              >
                Lihat Detail & Cetak
              </button>
              {canEdit && (
                confirmDeleteId === n.id ? (
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDelete(n.id)}
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
                    onClick={() => setConfirmDeleteId(n.id)}
                    className="p-1 text-slate-400 hover:text-rose-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const DocumentModule: React.FC<{
  user: UserProfile;
  classId: string;
  documents: DocumentItem[];
  driveFolders: DriveFolderItem[];
}> = ({ user, classId, documents, driveFolders }) => {
  const { showToast } = useToast();
  const [cat, setCat] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [docCategory, setDocCategory] = useState<DocumentItem['category']>('Naskah');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...documents]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .filter((d) => (cat === 'ALL' ? true : d.category === cat))
      .filter((d) => (!q ? true : d.title.toLowerCase().includes(q)));
  }, [documents, cat, search]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim()) {
      showToast('Judul dan tautan Google Drive wajib diisi', 'warning');
      return;
    }
    setBusy(true);
    try {
      const id = makeSafeId('doc');
      const item: DocumentItem = {
        id,
        classId,
        title: title.trim(),
        url: url.trim(),
        category: docCategory,
        uploadedBy: user.uid,
        uploaderName: user.name,
        createdAt: new Date().toISOString(),
      };
      await upsertDocument('documents', id, item as unknown as Record<string, unknown>);
      setTitle('');
      setUrl('');
      showToast('Tautan dokumen diarsipkan', 'success');
    } catch (err) {
      showToast('Gagal menyimpan tautan dokumen', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    try {
      await removeDocument('documents', id);
      setConfirmDeleteId(null);
      showToast('Dokumen dihapus dari arsip', 'info');
    } catch (err) {
      showToast('Gagal menghapus dokumen', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-amber-500" />
          Pusat Arsip Dokumen & Folder Drive
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Simpan tautan dokumen Google Drive produksi dan akses direktori 12 folder resmi divisi.
        </p>
      </div>

      <form
        onSubmit={handleUpload}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 grid grid-cols-1 sm:grid-cols-4 gap-3"
      >
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Judul berkas..."
          className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
        />
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://drive.google.com/..."
          className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono"
        />
        <div className="flex gap-2">
          <select
            value={docCategory}
            onChange={(e) => setDocCategory(e.target.value as DocumentItem['category'])}
            className="flex-1 px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
          >
            {(['Naskah', 'Proposal', 'RAB', 'LPJ', 'Notulen', 'Foto/Video', 'Lainnya'] as const).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy}
            className="px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 font-semibold text-xs whitespace-nowrap"
          >
            {busy ? '...' : 'Simpan'}
          </button>
        </div>
      </form>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari arsip dokumen..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-slate-100 text-xs"
          />
        </div>
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-slate-100 text-xs font-semibold"
        >
          <option value="ALL">Semua Kategori</option>
          {['Naskah', 'Proposal', 'RAB', 'LPJ', 'Notulen', 'Foto/Video', 'Lainnya'].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((d) => {
          const docHref = d.url || d.fileUrl || '#';
          return (
            <div
              key={d.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  {d.category} · {d.uploaderName}
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{d.title}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={docHref}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1"
                >
                  Buka <ExternalLink className="w-3 h-3" />
                </a>
                {(isTeacherOrAdmin(user.role) || d.uploadedBy === user.uid) &&
                  (confirmDeleteId === d.id ? (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDelete(d.id)}
                        className="px-2 py-1 rounded bg-rose-600 text-white text-[11px] font-semibold"
                      >
                        Hapus
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px]"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(d.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-3">
        <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
          Direktori Folder Google Drive Divisi
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {driveFolders.map((f) => (
            <a
              key={f.id}
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 hover:border-amber-500/60 transition-colors"
            >
              <p className="text-xs font-bold text-slate-900 dark:text-white">{f.name}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                PIC: {f.picRole} · {f.access}
              </p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};

export const ComplaintModule: React.FC<{
  user: UserProfile;
  classId: string;
  complaints: ComplaintItem[];
  classMembers: UserProfile[];
}> = ({ user, classId, complaints, classMembers }) => {
  const { showToast } = useToast();
  const isTeacher = isTeacherOrAdmin(user.role);

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('Konflik Divisi');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [message, setMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | ComplaintItem['status']>('ALL');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => {
    return [...complaints]
      .filter((c) => (isTeacher ? true : c.studentId === user.uid))
      .filter((c) => (statusFilter === 'ALL' ? true : c.status === statusFilter))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [complaints, isTeacher, user.uid, statusFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      showToast('Subjek dan kronologi aduan wajib diisi', 'warning');
      return;
    }
    setBusy(true);
    try {
      const id = makeSafeId('cmp');
      const now = new Date().toISOString();
      const item: ComplaintItem = {
        id,
        classId,
        studentId: user.uid,
        studentName: isAnonymous ? 'Anonim' : user.name,
        subject: subject.trim(),
        category,
        evidenceUrl: evidenceUrl.trim() || undefined,
        message: message.trim(),
        isAnonymous,
        status: 'OPEN',
        createdAt: now,
        updatedAt: now,
      };
      await upsertDocument('complaints', id, item as unknown as Record<string, unknown>);
      const teachers = classMembers.filter((m) => isTeacherOrAdmin(m.role));
      await notifyUsers({
        userIds: teachers.map((t) => t.uid),
        classId,
        title: `Aduan Siswa Baru: ${item.subject}`,
        message: `Dari ${item.studentName} (${category}). Harap segera ditindaklanjuti.`,
        category: 'Urgent',
        link: 'aduan',
      });
      setSubject('');
      setMessage('');
      setEvidenceUrl('');
      showToast('Aduan terkirim ke Guru Pengampu', 'success');
    } catch (err) {
      showToast('Gagal mengirim aduan', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleReply = async (c: ComplaintItem, nextStatus: ComplaintItem['status']) => {
    setBusy(true);
    try {
      const reply = (replyDrafts[c.id] ?? c.teacherResponse ?? '').trim();
      const now = new Date().toISOString();
      await upsertDocument('complaints', c.id, {
        ...c,
        subject: c.subject || c.title || 'Aduan',
        message: c.message || c.description || '-',
        status: nextStatus,
        teacherResponse: reply,
        respondedBy: user.name,
        respondedAt: now,
        updatedAt: now,
      });
      await notifyUsers({
        userIds: [c.studentId],
        classId,
        title: `Tanggapan Aduan: ${c.subject || c.title}`,
        message: `Status: ${nextStatus}. ${reply || ''}`,
        category: 'Feedback',
        link: 'aduan',
      });
      showToast(`Status aduan diperbarui menjadi ${nextStatus}`, 'success');
    } catch (err) {
      showToast('Gagal memperbarui tanggapan aduan', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <MessageSquareWarning className="w-5 h-5 text-amber-500" />
          Kanal Aduan & Konsultasi Siswa
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Laporkan kendala teknis, konflik divisi, atau keberatan penilaian secara aman (opsi anonim tersedia).
        </p>
      </div>

      {!isTeacher && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subjek aduan..."
              className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-semibold"
            >
              <option value="Konflik Divisi">Konflik Divisi</option>
              <option value="Teknis Produksi">Teknis Produksi</option>
              <option value="Penilaian 360°">Penilaian 360°</option>
              <option value="Keuangan / Kas">Keuangan / Kas</option>
              <option value="Fasilitas / Alat">Fasilitas / Alat</option>
              <option value="Lainnya">Lainnya</option>
            </select>
          </div>
          <textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Jelaskan kronologi atau kendala yang Anda alami..."
            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
          />
          <input
            type="url"
            value={evidenceUrl}
            onChange={(e) => setEvidenceUrl(e.target.value)}
            placeholder="Tautan bukti pendukung / tangkapan layar (opsional, https://...)..."
            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono"
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
              />
              Kirim sebagai Anonim (nama disembunyikan)
            </label>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-semibold"
            >
              {busy ? 'Mengirim...' : 'Kirim Aduan'}
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-1.5">
        {(['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              statusFilter === st
                ? 'bg-amber-500 text-slate-950'
                : 'bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-8 text-center text-xs text-slate-500">
            Tidak ada aduan pada status ini.
          </div>
        ) : (
          visible.map((c) => {
            const studentObj = !c.isAnonymous
              ? classMembers.find((m) => m.uid === c.studentId)
              : undefined;
            return (
              <div
                key={c.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-mono text-slate-500">
                      <span className="font-sans font-bold text-amber-600 dark:text-amber-400">
                        {c.status}
                      </span>
                      {c.category ? ` · ${c.category}` : ''}
                      <span className="mx-1.5">·</span>
                      {c.studentName}
                      <span className="mx-1.5">·</span>
                      {formatRelativeTime(c.createdAt)}
                    </p>
                    <h3 className="font-display font-bold text-base text-slate-900 dark:text-white mt-0.5">
                      {c.subject || c.title}
                    </h3>
                  </div>
                  {isTeacher && studentObj?.phone && (
                    <a
                      href={buildWhatsAppUrl(
                        studentObj.phone,
                        `Halo ${studentObj.name}, menindaklanjuti aduan "${c.subject || c.title}"...`
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-1"
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> WA Siswa
                    </a>
                  )}
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line">
                  {c.message || c.description}
                </p>
                {c.evidenceUrl && (
                  <a
                    href={c.evidenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    Lihat Bukti Lampiran <ExternalLink className="w-3 h-3" />
                  </a>
                )}

                {c.teacherResponse && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
                    <p className="font-bold text-emerald-700 dark:text-emerald-300">
                      Tanggapan {c.respondedBy}:
                    </p>
                    <p className="mt-0.5 text-slate-800 dark:text-slate-200">{c.teacherResponse}</p>
                  </div>
                )}

                {isTeacher ? (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={replyDrafts[c.id] ?? c.teacherResponse ?? ''}
                      onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      placeholder="Tulis solusi atau tanggapan guru..."
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
                    />
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleReply(c, 'IN_PROGRESS')}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                      >
                        Proses
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleReply(c, 'RESOLVED')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                      >
                        Selesaikan
                      </button>
                    </div>
                  </div>
                ) : (
                  c.status === 'RESOLVED' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleReply(c, 'CLOSED')}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold"
                    >
                      Konfirmasi Selesai & Tutup
                    </button>
                  )
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
