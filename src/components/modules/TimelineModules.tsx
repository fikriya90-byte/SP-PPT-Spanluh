import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  Camera,
  Check,
  CheckCircle,
  Circle,
  Clock,
  Edit3,
  Eye,
  FileText,
  Flag,
  GitBranch,
  Image as ImageIcon,
  Info,
  List,
  MapPin,
  Megaphone,
  Palette,
  Play,
  PlusCircle,
  Save,
  Search,
  Settings2,
  Sparkles,
  Star,
  Trash2,
  User,
  Users,
  Video,
  X,
} from 'lucide-react';
import { writeBatch, doc } from 'firebase/firestore';
import {
  DIVISIONS,
  STAGE_LABELS,
  isCoordinatorRole,
  isCoreCommitteeRole,
  isTeacherOrAdmin,
} from '../../core/constants';
import {
  ContentScheduleItem,
  ContentScheduleStatus,
  DirectorTimelineItem,
  DivisionScheduleItem,
  ProductionStage,
  TimelineConfig,
  TimelineWeek,
  UserProfile,
} from '../../core/types';
import { db } from '../../services/firebase';
import {
  makeSafeId,
  recordAuditLog,
  removeDocument,
  updateDocumentFields,
  upsertDocument,
} from '../../services/firestoreService';
import { useToast } from '../common/Toast';

// =========================================================================
// 1. MASTER TIMELINE MODULE
// =========================================================================

const PHASE_STYLES: Record<
  ProductionStage,
  { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }
> = {
  PERSIAPAN: {
    label: 'Persiapan',
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-100 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800',
    icon: BookOpen,
  },
  PELAKSANAAN: {
    label: 'Pelaksanaan',
    color: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-100 dark:bg-blue-950/50 border-blue-300 dark:border-blue-800',
    icon: Palette,
  },
  PERTUNJUKAN: {
    label: 'Pertunjukan',
    color: 'text-purple-700 dark:text-purple-300',
    bg: 'bg-purple-100 dark:bg-purple-950/50 border-purple-300 dark:border-purple-800',
    icon: Star,
  },
  PASCA: {
    label: 'Pasca',
    color: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-100 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800',
    icon: Flag,
  },
};

const WEEK_STATUS_STYLES: Record<
  'PLANNED' | 'ONGOING' | 'DONE',
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  PLANNED: {
    label: 'Rencana',
    color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700',
    icon: Circle,
  },
  ONGOING: {
    label: 'Berjalan',
    color: 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800',
    icon: Play,
  },
  DONE: {
    label: 'Selesai',
    color: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    icon: CheckCircle,
  },
};

function generateWeeksBetween(startDate: string, endDate: string) {
  const result: Array<{ start: string; end: string; num: number }> = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return result;

  const current = new Date(start);
  let num = 1;
  while (current <= end) {
    const weekStart = new Date(current);
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const actualEnd = weekEnd > end ? new Date(end) : weekEnd;
    result.push({
      start: weekStart.toISOString(),
      end: actualEnd.toISOString(),
      num,
    });
    current.setDate(current.getDate() + 7);
    num++;
    if (num > 120) break;
  }
  return result;
}

const fmtShortDate = (iso?: string) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};

const fmtLongDate = (iso?: string) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

interface MasterTimelineModuleProps {
  user: UserProfile;
  classId: string;
  timelineConfigs: TimelineConfig[];
  timelineWeeks: TimelineWeek[];
}

export const MasterTimelineModule: React.FC<MasterTimelineModuleProps> = ({
  user,
  classId,
  timelineConfigs,
  timelineWeeks,
}) => {
  const { showToast } = useToast();
  const [viewMode, setViewMode] = useState<'line' | 'table'>('line');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPhase, setFilterPhase] = useState<'ALL' | ProductionStage>('ALL');

  const config = useMemo(
    () => timelineConfigs.find((c) => c.classId === classId) || timelineConfigs[0] || null,
    [timelineConfigs, classId]
  );

  const sortedWeeks = useMemo(() => {
    const base = config
      ? timelineWeeks.filter((w) => !w.timelineId || w.timelineId === config.id)
      : timelineWeeks;
    return [...base].sort((a, b) => {
      if (a.weekNumber != null && b.weekNumber != null) return a.weekNumber - b.weekNumber;
      return (a.startDate || a.date || '').localeCompare(b.startDate || b.date || '');
    });
  }, [timelineWeeks, config]);

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configTitle, setConfigTitle] = useState('Timeline Produksi Teater');
  const [configDesc, setConfigDesc] = useState('');
  const [configStart, setConfigStart] = useState(new Date().toISOString().slice(0, 10));
  const [configEnd, setConfigEnd] = useState(
    new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
  );
  const [savingConfig, setSavingConfig] = useState(false);

  const [editingWeek, setEditingWeek] = useState<TimelineWeek | null>(null);
  const [weekTitle, setWeekTitle] = useState('');
  const [weekDesc, setWeekDesc] = useState('');
  const [weekPhase, setWeekPhase] = useState<ProductionStage>('PERSIAPAN');
  const [weekStatus, setWeekStatus] = useState<'PLANNED' | 'ONGOING' | 'DONE'>('PLANNED');
  const [weekLabelInput, setWeekLabelInput] = useState('');
  const [weekDateInput, setWeekDateInput] = useState(new Date().toISOString().slice(0, 10));
  const [savingWeek, setSavingWeek] = useState(false);
  const [confirmDeleteWeekId, setConfirmDeleteWeekId] = useState<string | null>(null);

  const canManage =
    isTeacherOrAdmin(user.role) ||
    user.role === 'Pimpinan Produksi' ||
    user.role === 'Sekretaris';

  const openConfigModal = () => {
    if (config) {
      setConfigTitle(config.title || 'Timeline Produksi Teater');
      setConfigDesc(config.description || '');
      setConfigStart(config.startDate.slice(0, 10));
      setConfigEnd(config.endDate.slice(0, 10));
    } else {
      setConfigTitle('Timeline Produksi Teater');
      setConfigDesc('');
      setConfigStart(new Date().toISOString().slice(0, 10));
      setConfigEnd(new Date(Date.now() + 84 * 86400000).toISOString().slice(0, 10));
    }
    setIsConfigOpen(true);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    if (!configStart || !configEnd || new Date(configStart) > new Date(configEnd)) {
      showToast('Tanggal mulai harus sebelum atau sama dengan tanggal selesai', 'warning');
      return;
    }

    const slots = generateWeeksBetween(configStart, configEnd);
    if (slots.length === 0) {
      showToast('Rentang tanggal tidak menghasilkan minggu kerja', 'warning');
      return;
    }

    setSavingConfig(true);
    try {
      const cfgId = config?.id || makeSafeId('tl_cfg');
      const now = new Date().toISOString();
      await upsertDocument('timelineConfigs', cfgId, {
        id: cfgId,
        classId,
        title: configTitle.trim() || 'Timeline Produksi Teater',
        description: configDesc.trim(),
        startDate: configStart,
        endDate: configEnd,
        createdBy: config?.createdBy || user.uid,
        creatorName: config?.creatorName || user.displayName || user.name,
        createdAt: config?.createdAt || now,
        updatedAt: now,
      });

      const batch = writeBatch(db);
      slots.forEach((slot) => {
        const existingMatch = sortedWeeks.find((w) => w.weekNumber === slot.num);
        const wId = existingMatch?.id || `${cfgId}_w${slot.num}`;
        const defaultPhase: ProductionStage =
          slot.num <= Math.ceil(slots.length * 0.25)
            ? 'PERSIAPAN'
            : slot.num <= Math.ceil(slots.length * 0.7)
            ? 'PELAKSANAAN'
            : slot.num <= Math.ceil(slots.length * 0.9)
            ? 'PERTUNJUKAN'
            : 'PASCA';
        batch.set(
          doc(db, 'timelineWeeks', wId),
          {
            id: wId,
            classId,
            timelineId: cfgId,
            weekNumber: slot.num,
            startDate: slot.start.slice(0, 10),
            endDate: slot.end.slice(0, 10),
            date: slot.start.slice(0, 10),
            label: `Minggu ${slot.num}`,
            weekLabel: `Minggu ${slot.num}`,
            title: existingMatch?.title || `Target Minggu ${slot.num}`,
            description: existingMatch?.description || existingMatch?.notes || '',
            phase: existingMatch?.phase || existingMatch?.stage || defaultPhase,
            stage: existingMatch?.phase || existingMatch?.stage || defaultPhase,
            status: existingMatch?.status || 'PLANNED',
            createdBy: existingMatch?.createdBy || user.uid,
            creatorName: existingMatch?.creatorName || user.displayName || user.name,
            createdAt: existingMatch?.createdAt || now,
            updatedAt: now,
          },
          { merge: true }
        );
      });
      await batch.commit();

      await recordAuditLog({
        user,
        action: config ? 'UPDATE' : 'CREATE',
        targetType: 'timelineConfigs',
        targetId: cfgId,
        details: `Menyimpan Master Timeline "${configTitle.trim()}" (${slots.length} minggu).`,
      });
      showToast(`Master Timeline berhasil dibuat/diperbarui (${slots.length} minggu)!`, 'success');
      setIsConfigOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi timeline', 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const openEditWeek = (week?: TimelineWeek) => {
    if (week) {
      setEditingWeek(week);
      setWeekTitle(week.title || '');
      setWeekDesc(week.description || week.notes || '');
      setWeekPhase(week.phase || week.stage || 'PERSIAPAN');
      setWeekStatus(week.status || 'PLANNED');
      setWeekLabelInput(week.label || week.weekLabel || `Minggu ${week.weekNumber || ''}`);
      setWeekDateInput((week.startDate || week.date || new Date().toISOString()).slice(0, 10));
    } else {
      setEditingWeek({
        id: '',
        classId,
        weekLabel: `Minggu ${sortedWeeks.length + 1}`,
        title: '',
        date: new Date().toISOString().slice(0, 10),
        stage: 'PERSIAPAN',
        createdAt: new Date().toISOString(),
      });
      setWeekTitle('');
      setWeekDesc('');
      setWeekPhase('PERSIAPAN');
      setWeekStatus('PLANNED');
      setWeekLabelInput(`Minggu ${sortedWeeks.length + 1}`);
      setWeekDateInput(new Date().toISOString().slice(0, 10));
    }
  };

  const handleSaveWeek = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWeek || !canManage) return;
    if (!weekTitle.trim()) {
      showToast('Judul target minggu wajib diisi', 'warning');
      return;
    }
    setSavingWeek(true);
    try {
      const id = editingWeek.id || makeSafeId('tw');
      const now = new Date().toISOString();
      await upsertDocument('timelineWeeks', id, {
        id,
        classId,
        timelineId: config?.id || editingWeek.timelineId || '',
        weekNumber: editingWeek.weekNumber || sortedWeeks.length + 1,
        label: weekLabelInput.trim() || `Minggu ${sortedWeeks.length + 1}`,
        weekLabel: weekLabelInput.trim() || `Minggu ${sortedWeeks.length + 1}`,
        title: weekTitle.trim(),
        description: weekDesc.trim(),
        notes: weekDesc.trim(),
        phase: weekPhase,
        stage: weekPhase,
        status: weekStatus,
        date: weekDateInput,
        startDate: editingWeek.startDate || weekDateInput,
        endDate: editingWeek.endDate || weekDateInput,
        createdBy: editingWeek.createdBy || user.uid,
        creatorName: editingWeek.creatorName || user.displayName || user.name,
        createdAt: editingWeek.createdAt || now,
        updatedAt: now,
      });
      showToast('Target minggu timeline disimpan', 'success');
      setEditingWeek(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan minggu timeline', 'error');
    } finally {
      setSavingWeek(false);
    }
  };

  const handleQuickStatus = async (week: TimelineWeek, status: 'PLANNED' | 'ONGOING' | 'DONE') => {
    if (!canManage) return;
    try {
      await updateDocumentFields('timelineWeeks', week.id, {
        status,
        updatedAt: new Date().toISOString(),
      });
      showToast(`Status minggu diperbarui menjadi ${WEEK_STATUS_STYLES[status].label}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memperbarui status', 'error');
    }
  };

  const handleDeleteWeek = async (id: string) => {
    if (!canManage) return;
    try {
      await removeDocument('timelineWeeks', id);
      setConfirmDeleteWeekId(null);
      showToast('Slot timeline dihapus', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus slot timeline', 'error');
    }
  };

  const filteredWeeks = useMemo(() => {
    return sortedWeeks.filter((w) => {
      const phase = w.phase || w.stage || 'PERSIAPAN';
      if (filterPhase !== 'ALL' && phase !== filterPhase) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          w.title.toLowerCase().includes(q) ||
          (w.description || w.notes || '').toLowerCase().includes(q) ||
          (w.label || w.weekLabel || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [sortedWeeks, filterPhase, searchQuery]);

  const doneCount = sortedWeeks.filter((w) => w.status === 'DONE').length;
  const progressPct = sortedWeeks.length > 0 ? Math.round((doneCount / sortedWeeks.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-indigo-950 via-slate-900 to-amber-950 text-white shadow-xl border border-indigo-800/40">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center shrink-0">
              <GitBranch className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <h2 className="font-display text-xl font-black">
                {config?.title || 'Master Timeline Produksi'}
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {config
                  ? `${fmtLongDate(config.startDate)} – ${fmtLongDate(config.endDate)} · ${sortedWeeks.length} minggu kerja`
                  : 'Garis besar jadwal produksi mingguan lintas tahap.'}
              </p>
              {config?.description && (
                <p className="text-xs text-amber-200/90 mt-1 max-w-2xl">{config.description}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {sortedWeeks.length > 0 && (
              <div className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs font-semibold">
                Progres: <span className="text-amber-300 font-bold">{doneCount}/{sortedWeeks.length} ({progressPct}%)</span>
              </div>
            )}
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={openConfigModal}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Settings2 className="w-4 h-4" />
                  {config ? 'Atur Rentang Produksi' : 'Buat Master Timeline'}
                </button>
                <button
                  type="button"
                  onClick={() => openEditWeek()}
                  className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  Tambah Slot
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filter & View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/95 dark:bg-slate-900/95 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari agenda minggu..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>
          <select
            value={filterPhase}
            onChange={(e) => setFilterPhase(e.target.value as 'ALL' | ProductionStage)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-900 dark:text-slate-100"
          >
            <option value="ALL">Semua Tahap</option>
            {Object.entries(STAGE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 p-1">
          <button
            type="button"
            onClick={() => setViewMode('line')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'line'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            Garis Timeline
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'table'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            Tabel
          </button>
        </div>
      </div>

      {/* Content */}
      {filteredWeeks.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800">
          <Calendar className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            Belum ada slot Master Timeline
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {canManage
              ? 'Klik "Buat Master Timeline" untuk otomatis membagi minggu kerja, atau tambahkan slot manual.'
              : 'Menunggu Pimpinan Produksi, Sekretaris, atau Guru menyusun Master Timeline.'}
          </p>
        </div>
      ) : viewMode === 'line' ? (
        <div className="relative pl-6 sm:pl-8 space-y-4 before:content-[''] before:absolute before:left-2.5 sm:before:left-3.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-amber-400/50">
          {filteredWeeks.map((week) => {
            const phase = week.phase || week.stage || 'PERSIAPAN';
            const phaseInfo = PHASE_STYLES[phase] || PHASE_STYLES.PERSIAPAN;
            const statusKey = week.status || 'PLANNED';
            const stInfo = WEEK_STATUS_STYLES[statusKey] || WEEK_STATUS_STYLES.PLANNED;
            const StatusIcon = stInfo.icon;
            const labelText = week.label || week.weekLabel || `Minggu ${week.weekNumber || '-'}`;

            return (
              <div key={week.id} className="relative">
                <div
                  className={`absolute -left-[22px] sm:-left-[26px] top-5 w-4 h-4 rounded-full border-2 border-white dark:border-slate-950 ${
                    statusKey === 'DONE'
                      ? 'bg-emerald-500'
                      : statusKey === 'ONGOING'
                      ? 'bg-blue-500'
                      : 'bg-amber-500'
                  }`}
                />
                <div className="p-5 rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-amber-400/60 transition-colors">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-amber-400 text-[11px] font-bold">
                          {labelText}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-lg border text-[11px] font-bold ${phaseInfo.bg} ${phaseInfo.color}`}>
                          {phaseInfo.label}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 ${stInfo.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {stInfo.label}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {week.startDate && week.endDate
                            ? `${fmtShortDate(week.startDate)} – ${fmtShortDate(week.endDate)}`
                            : fmtLongDate(week.date)}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white pt-1">
                        {week.title}
                      </h3>
                      {(week.description || week.notes) && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {week.description || week.notes}
                        </p>
                      )}
                    </div>

                    {canManage && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {statusKey !== 'DONE' && (
                          <button
                            type="button"
                            onClick={() => void handleQuickStatus(week, 'DONE')}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            title="Tandai Selesai"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Selesai
                          </button>
                        )}
                        {statusKey === 'PLANNED' && (
                          <button
                            type="button"
                            onClick={() => void handleQuickStatus(week, 'ONGOING')}
                            className="px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 text-[11px] font-bold cursor-pointer"
                          >
                            Mulai
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEditWeek(week)}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          title="Edit Target Minggu"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeleteWeekId === week.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleDeleteWeek(week.id)}
                              className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                            >
                              Yakin
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteWeekId(null)}
                              className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-[10px] font-bold cursor-pointer"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteWeekId(week.id)}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                            title="Hapus"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400">
                <th className="p-3 font-bold">Minggu</th>
                <th className="p-3 font-bold">Rentang Tanggal</th>
                <th className="p-3 font-bold">Tahap</th>
                <th className="p-3 font-bold">Target & Catatan</th>
                <th className="p-3 font-bold">Status</th>
                {canManage && <th className="p-3 font-bold text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredWeeks.map((week) => {
                const phase = week.phase || week.stage || 'PERSIAPAN';
                const phaseInfo = PHASE_STYLES[phase] || PHASE_STYLES.PERSIAPAN;
                const statusKey = week.status || 'PLANNED';
                const stInfo = WEEK_STATUS_STYLES[statusKey] || WEEK_STATUS_STYLES.PLANNED;
                return (
                  <tr key={week.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="p-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {week.label || week.weekLabel || `Minggu ${week.weekNumber || '-'}`}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {week.startDate && week.endDate
                        ? `${fmtShortDate(week.startDate)} – ${fmtShortDate(week.endDate)}`
                        : fmtShortDate(week.date)}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${phaseInfo.bg} ${phaseInfo.color}`}>
                        {phaseInfo.label}
                      </span>
                    </td>
                    <td className="p-3">
                      <p className="font-bold text-slate-900 dark:text-white">{week.title}</p>
                      {(week.description || week.notes) && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {week.description || week.notes}
                        </p>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${stInfo.color}`}>
                        {stInfo.label}
                      </span>
                    </td>
                    {canManage && (
                      <td className="p-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEditWeek(week)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                        >
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Konfigurasi Master Timeline */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Konfigurasi Master Timeline
              </h3>
              <button
                type="button"
                onClick={() => setIsConfigOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveConfig} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Judul Timeline Produksi
                </label>
                <input
                  type="text"
                  required
                  value={configTitle}
                  onChange={(e) => setConfigTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Tanggal Mulai
                  </label>
                  <input
                    type="date"
                    required
                    value={configStart}
                    onChange={(e) => setConfigStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Tanggal Selesai
                  </label>
                  <input
                    type="date"
                    required
                    value={configEnd}
                    onChange={(e) => setConfigEnd(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Deskripsi / Fokus Utama
                </label>
                <textarea
                  rows={3}
                  value={configDesc}
                  onChange={(e) => setConfigDesc(e.target.value)}
                  placeholder="Contoh: Produksi Teater Tradisional Nusantara Kelas IX..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-[11px] text-amber-800 dark:text-amber-300 flex gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Sistem akan otomatis membuat slot mingguan berdasarkan rentang tanggal tanpa menimpa judul minggu yang sudah Anda edit.
                </span>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingConfig ? 'Menyimpan...' : 'Simpan & Generate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit/Tambah Minggu */}
      {editingWeek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                {editingWeek.id ? 'Edit Target Minggu' : 'Tambah Slot Timeline'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingWeek(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveWeek} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Label Minggu
                  </label>
                  <input
                    type="text"
                    required
                    value={weekLabelInput}
                    onChange={(e) => setWeekLabelInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Tanggal Acuan
                  </label>
                  <input
                    type="date"
                    required
                    value={weekDateInput}
                    onChange={(e) => setWeekDateInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Tahap Produksi
                  </label>
                  <select
                    value={weekPhase}
                    onChange={(e) => setWeekPhase(e.target.value as ProductionStage)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  >
                    {Object.entries(STAGE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Status
                  </label>
                  <select
                    value={weekStatus}
                    onChange={(e) => setWeekStatus(e.target.value as 'PLANNED' | 'ONGOING' | 'DONE')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  >
                    <option value="PLANNED">Rencana</option>
                    <option value="ONGOING">Berjalan</option>
                    <option value="DONE">Selesai</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Target Utama Minggu Ini
                </label>
                <input
                  type="text"
                  required
                  value={weekTitle}
                  onChange={(e) => setWeekTitle(e.target.value)}
                  placeholder="Contoh: Bedah Naskah & Casting Pemeran"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Rincian / Output yang Diharapkan
                </label>
                <textarea
                  rows={3}
                  value={weekDesc}
                  onChange={(e) => setWeekDesc(e.target.value)}
                  placeholder="Catatan capaian atau divisi terkait..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingWeek(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingWeek}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-50"
                >
                  {savingWeek ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// 2. DIRECTOR TIMELINE MODULE
// =========================================================================

interface DirectorTimelineModuleProps {
  user: UserProfile;
  classId: string;
  items: DirectorTimelineItem[];
}

export const DirectorTimelineModule: React.FC<DirectorTimelineModuleProps> = ({
  user,
  classId,
  items,
}) => {
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [phase, setPhase] = useState<'Latihan' | 'Gladi' | 'Pementasan' | 'Evaluasi'>('Latihan');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const canPost =
    isTeacherOrAdmin(user.role) ||
    ['Sutradara', 'Asisten Sutradara', 'Pimpinan Produksi', 'Sekretaris'].includes(user.role);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.date.localeCompare(b.date)),
    [items]
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPost || !title.trim() || !date) return;
    setSaving(true);
    try {
      const id = makeSafeId('dt');
      await upsertDocument('directorTimelines', id, {
        id,
        classId,
        title: title.trim(),
        date,
        phase,
        notes: notes.trim(),
        authorId: user.uid,
        authorName: user.displayName || user.name,
        authorRole: user.role,
        createdAt: new Date().toISOString(),
      });
      await recordAuditLog({
        user,
        action: 'CREATE',
        targetType: 'directorTimelines',
        targetId: id,
        details: `Menambah timeline sutradara "${title.trim()}" (${phase}).`,
      });
      showToast('Timeline sutradara ditambahkan!', 'success');
      setIsOpen(false);
      setTitle('');
      setNotes('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan timeline sutradara', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await removeDocument('directorTimelines', id);
      setConfirmDeleteId(null);
      showToast('Milestone sutradara dihapus', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus milestone', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-3xl bg-gradient-to-r from-rose-900 via-pink-900 to-slate-900 text-white shadow-xl border border-rose-800/40">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Sparkles className="w-7 h-7 text-pink-300" />
            <div>
              <h2 className="font-display text-xl font-black">Timeline Sutradara</h2>
              <p className="text-xs text-slate-300">
                Milestone khusus penyutradaraan: Latihan, Gladi, Pementasan, dan Evaluasi
              </p>
            </div>
          </div>
          {canPost && (
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              Tambah Timeline
            </button>
          )}
        </div>
      </div>

      {sortedItems.length === 0 ? (
        <div className="p-12 text-center bg-white/95 dark:bg-slate-900/95 rounded-3xl border border-slate-200 dark:border-slate-800">
          <Clock className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            Belum ada timeline penyutradaraan
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Sutradara atau Asisten Sutradara dapat menambahkan target latihan, blocking, dan gladi di sini.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedItems.map((it) => (
            <div
              key={it.id}
              className="p-5 rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-rose-200 dark:border-rose-900/50 shadow-sm flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                    {it.phase}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    {fmtLongDate(it.date)}
                  </span>
                </div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{it.title}</h3>
                {it.notes && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5">{it.notes}</p>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
                <span>
                  {it.authorName} · {it.authorRole}
                </span>
                {canPost && (
                  confirmDeleteId === it.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleDelete(it.id)}
                        className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold text-[10px]"
                      >
                        Hapus
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[10px]"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(it.id)}
                      className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded"
                      title="Hapus milestone"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isOpen && canPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Tambah Timeline Sutradara
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Fase Latihan
                </label>
                <select
                  value={phase}
                  onChange={(e) =>
                    setPhase(e.target.value as 'Latihan' | 'Gladi' | 'Pementasan' | 'Evaluasi')
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value="Latihan">Latihan</option>
                  <option value="Gladi">Gladi</option>
                  <option value="Pementasan">Pementasan</option>
                  <option value="Evaluasi">Evaluasi</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Judul Milestone
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: Blocking Babak 2 & Transisi Musik"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Tanggal Target
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Catatan Penyutradaraan (Opsional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Fokus adegan, alat yang dibutuhkan, dll..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// 3. DIVISION SCHEDULE MODULE
// =========================================================================

interface DivisionScheduleModuleProps {
  user: UserProfile;
  classId: string;
  items: DivisionScheduleItem[];
}

export const DivisionScheduleModule: React.FC<DivisionScheduleModuleProps> = ({
  user,
  classId,
  items,
}) => {
  const { showToast } = useToast();
  const isStaffFull =
    isTeacherOrAdmin(user.role) || user.role === 'Pimpinan Produksi';
  const isCore = isCoreCommitteeRole(user.role);
  const isKoor = isCoordinatorRole(user.role);

  const divisionNames = useMemo(() => DIVISIONS.map((d) => d.name), []);
  const defaultDiv =
    divisionNames.includes(user.divisionName) ? user.divisionName : divisionNames[0];

  const [selectedDivision, setSelectedDivision] = useState<string>(defaultDiv);
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('15:00');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const canSeeAll = isStaffFull || isCore;
  const accessibleDivisions = canSeeAll
    ? divisionNames
    : user.divisionName
    ? [user.divisionName]
    : divisionNames;

  const activeDivision = accessibleDivisions.includes(selectedDivision)
    ? selectedDivision
    : accessibleDivisions[0];

  const canAddHere =
    isStaffFull ||
    user.role === 'Sekretaris' ||
    (isKoor && activeDivision === user.divisionName);

  const filteredItems = useMemo(() => {
    return items
      .filter((i) => i.divisionName === activeDivision)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [items, activeDivision]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAddHere || !title.trim() || !date) {
      showToast('Isi judul & tanggal jadwal divisi.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const id = makeSafeId('dsched');
      await upsertDocument('divisionSchedules', id, {
        id,
        classId,
        divisionName: activeDivision,
        title: title.trim(),
        description: description.trim(),
        date,
        time: time.trim(),
        location: location.trim(),
        authorId: user.uid,
        authorName: user.displayName || user.name,
        authorRole: user.role,
        createdAt: new Date().toISOString(),
      });
      await recordAuditLog({
        user,
        action: 'CREATE',
        targetType: 'divisionSchedules',
        targetId: id,
        details: `Menambah jadwal divisi ${activeDivision}: "${title.trim()}".`,
      });
      showToast(`Jadwal divisi ${activeDivision} berhasil ditambahkan!`, 'success');
      setIsOpen(false);
      setTitle('');
      setDescription('');
      setLocation('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan jadwal divisi', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await removeDocument('divisionSchedules', id);
      setConfirmDeleteId(null);
      showToast('Jadwal divisi dihapus', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus jadwal divisi', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white shadow-xl border border-emerald-800/40">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Users className="w-7 h-7 text-emerald-300" />
            <div>
              <h2 className="font-display text-xl font-black">Jadwal Kerja Divisi</h2>
              <p className="text-xs text-slate-300">
                Agenda internal tiap divisi produksi (properti, musik, rias, busana, publikasi, panggung)
              </p>
            </div>
          </div>
          {canAddHere && (
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              Tambah Jadwal {activeDivision}
            </button>
          )}
        </div>
      </div>

      {/* Division Selector Pills */}
      <div className="flex flex-wrap gap-2 bg-white/95 dark:bg-slate-900/95 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        {accessibleDivisions.map((divName) => {
          const active = activeDivision === divName;
          const count = items.filter((i) => i.divisionName === divName).length;
          return (
            <button
              key={divName}
              type="button"
              onClick={() => setSelectedDivision(divName)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
                active
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span>{divName}</span>
              <span
                className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                  active ? 'bg-slate-950/20 text-slate-950' : 'bg-white dark:bg-slate-900 text-slate-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {filteredItems.length === 0 ? (
        <div className="p-12 text-center bg-white/95 dark:bg-slate-900/95 rounded-3xl border border-slate-200 dark:border-slate-800">
          <Calendar className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            Belum ada jadwal untuk divisi {activeDivision}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {canAddHere
              ? 'Klik tombol "Tambah Jadwal" di atas untuk menjadwalkan kerja divisi.'
              : 'Koordinator divisi akan menambahkan jadwal kerja di sini.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((it) => (
            <div
              key={it.id}
              className="p-5 rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
                    {it.divisionName}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    {fmtLongDate(it.date)}
                  </span>
                </div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{it.title}</h3>
                {it.description && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5">{it.description}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                  {it.time && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      {it.time} WITA
                    </span>
                  )}
                  {it.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-rose-500" />
                      {it.location}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
                <span>Oleh: {it.authorName}</span>
                {canAddHere && (
                  confirmDeleteId === it.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleDelete(it.id)}
                        className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold text-[10px]"
                      >
                        Hapus
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[10px]"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(it.id)}
                      className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isOpen && canAddHere && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Jadwal Divisi: {activeDivision}
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Judul agenda kerja divisi"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                />
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Lokasi kegiatan (misal: Ruang Kelas IX-A)"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Rincian pekerjaan & perlengkapan yang dibawa..."
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// 4. CONTENT SCHEDULE MODULE (PUBLIKASI)
// =========================================================================

const CONTENT_CATEGORIES = [
  { value: 'Poster', label: 'Poster', icon: ImageIcon, color: 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800' },
  { value: 'Teaser', label: 'Teaser', icon: Play, color: 'bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800' },
  { value: 'Video', label: 'Video', icon: Video, color: 'bg-purple-100 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800' },
  { value: 'Foto', label: 'Foto', icon: Camera, color: 'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800' },
  { value: 'Story', label: 'Story', icon: Sparkles, color: 'bg-pink-100 dark:bg-pink-950/50 text-pink-800 dark:text-pink-300 border-pink-300 dark:border-pink-800' },
  { value: 'Reels', label: 'Reels', icon: Play, color: 'bg-fuchsia-100 dark:bg-fuchsia-950/50 text-fuchsia-800 dark:text-fuchsia-300 border-fuchsia-300 dark:border-fuchsia-800' },
  { value: 'Behind The Scenes', label: 'Behind The Scenes', icon: Eye, color: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800' },
  { value: 'Countdown', label: 'Countdown', icon: Clock, color: 'bg-orange-100 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-800' },
  { value: 'Pengumuman', label: 'Pengumuman', icon: Megaphone, color: 'bg-cyan-100 dark:bg-cyan-950/50 text-cyan-800 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800' },
  { value: 'Lainnya', label: 'Lainnya', icon: FileText, color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700' },
];

const PLATFORMS = ['Instagram', 'TikTok', 'WhatsApp', 'Poster Cetak', 'YouTube', 'Facebook'];

const CONTENT_STATUS_STYLES: Record<ContentScheduleStatus, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700' },
  APPROVED: { label: 'Disetujui', color: 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800' },
  POSTED: { label: 'Sudah Diposting', color: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800' },
};

interface ContentScheduleModuleProps {
  user: UserProfile;
  classId: string;
  items: ContentScheduleItem[];
}

export const ContentScheduleModule: React.FC<ContentScheduleModuleProps> = ({
  user,
  classId,
  items,
}) => {
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<ContentScheduleItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | ContentScheduleStatus>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [category, setCategory] = useState('Poster');
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState('Instagram');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<ContentScheduleStatus>('DRAFT');
  const [pic, setPic] = useState(user.displayName || user.name);
  const [notes, setNotes] = useState('');

  const canPost =
    isTeacherOrAdmin(user.role) ||
    [
      'Koordinator Publikasi',
      'Anggota Publikasi',
      'Pimpinan Produksi',
      'Sekretaris',
      'Sutradara',
    ].includes(user.role);

  const canEditAny =
    isTeacherOrAdmin(user.role) ||
    ['Koordinator Publikasi', 'Pimpinan Produksi', 'Sekretaris'].includes(user.role);

  const openModal = (item?: ContentScheduleItem) => {
    if (item) {
      setEditing(item);
      setCategory(item.category);
      setTitle(item.title);
      setPlatform(item.platform);
      setDate(item.date);
      setStatus(item.status);
      setPic(item.pic || '');
      setNotes(item.notes || '');
    } else {
      setEditing(null);
      setCategory('Poster');
      setTitle('');
      setPlatform('Instagram');
      setDate(new Date().toISOString().slice(0, 10));
      setStatus('DRAFT');
      setPic(user.displayName || user.name);
      setNotes('');
    }
    setIsOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPost || !title.trim() || !date) return;
    setSaving(true);
    try {
      const id = editing?.id || makeSafeId('cnt');
      const now = new Date().toISOString();
      await upsertDocument('contentSchedules', id, {
        id,
        classId,
        category,
        title: title.trim(),
        platform,
        date,
        status,
        pic: pic.trim() || user.name,
        notes: notes.trim(),
        authorId: editing?.authorId || user.uid,
        authorName: editing?.authorName || user.displayName || user.name,
        createdAt: editing?.createdAt || now,
        updatedAt: now,
      });
      await recordAuditLog({
        user,
        action: editing ? 'UPDATE' : 'CREATE',
        targetType: 'contentSchedules',
        targetId: id,
        details: `${editing ? 'Memperbarui' : 'Menambah'} jadwal konten "${title.trim()}" (${platform}).`,
      });
      showToast('Jadwal konten publikasi disimpan!', 'success');
      setIsOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan jadwal konten', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStatus = async (item: ContentScheduleItem, nextStatus: ContentScheduleStatus) => {
    try {
      await updateDocumentFields('contentSchedules', item.id, {
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      });
      showToast(`Status konten diperbarui: ${CONTENT_STATUS_STYLES[nextStatus].label}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengubah status konten', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await removeDocument('contentSchedules', id);
      setConfirmDeleteId(null);
      showToast('Jadwal konten dihapus', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus konten', 'error');
    }
  };

  const filteredItems = useMemo(() => {
    return [...items]
      .filter((it) => {
        if (filterStatus !== 'ALL' && it.status !== filterStatus) return false;
        if (filterCategory !== 'ALL' && it.category !== filterCategory) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            it.title.toLowerCase().includes(q) ||
            it.platform.toLowerCase().includes(q) ||
            (it.pic || '').toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [items, filterStatus, filterCategory, searchQuery]);

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-3xl bg-gradient-to-r from-fuchsia-900 via-purple-900 to-slate-900 text-white shadow-xl border border-purple-800/40">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Camera className="w-7 h-7 text-fuchsia-300" />
            <div>
              <h2 className="font-display text-xl font-black">Jadwal Konten & Publikasi</h2>
              <p className="text-xs text-slate-300">
                Rencana rilis poster, teaser, reels, countdown, dan dokumentasi pertunjukan
              </p>
            </div>
          </div>
          {canPost && (
            <button
              type="button"
              onClick={() => openModal()}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              Tambah Konten
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-white/95 dark:bg-slate-900/95 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari judul konten, platform, atau PIC..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-900 dark:text-slate-100"
        >
          <option value="ALL">Semua Kategori</option>
          {CONTENT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as 'ALL' | ContentScheduleStatus)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-900 dark:text-slate-100"
        >
          <option value="ALL">Semua Status</option>
          <option value="DRAFT">Draft</option>
          <option value="APPROVED">Disetujui</option>
          <option value="POSTED">Sudah Diposting</option>
        </select>
      </div>

      {filteredItems.length === 0 ? (
        <div className="p-12 text-center bg-white/95 dark:bg-slate-900/95 rounded-3xl border border-slate-200 dark:border-slate-800">
          <Camera className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            Belum ada jadwal konten publikasi
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Divisi Publikasi & Dokumentasi dapat menjadwalkan rilis konten promosi di sini.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((it) => {
            const catMeta = CONTENT_CATEGORIES.find((c) => c.value === it.category) || CONTENT_CATEGORIES[CONTENT_CATEGORIES.length - 1];
            const stMeta = CONTENT_STATUS_STYLES[it.status] || CONTENT_STATUS_STYLES.DRAFT;
            const canModify = canEditAny || it.authorId === user.uid;
            return (
              <div
                key={it.id}
                className="p-5 rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className={`px-2.5 py-0.5 rounded-lg border text-[10px] font-bold ${catMeta.color}`}>
                      {it.category}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-lg border text-[10px] font-bold ${stMeta.color}`}>
                      {stMeta.label}
                    </span>
                  </div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{it.title}</h3>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-fuchsia-600 dark:text-fuchsia-400">{it.platform}</span>
                    <span>· {fmtLongDate(it.date)}</span>
                  </div>
                  {it.pic && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                      <User className="w-3 h-3" /> PIC: {it.pic}
                    </p>
                  )}
                  {it.notes && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 bg-slate-50 dark:bg-slate-950/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                      {it.notes}
                    </p>
                  )}
                </div>

                {canModify && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-1">
                      {it.status === 'DRAFT' && canEditAny && (
                        <button
                          type="button"
                          onClick={() => void handleQuickStatus(it, 'APPROVED')}
                          className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 text-[10px] font-bold cursor-pointer"
                        >
                          Setujui
                        </button>
                      )}
                      {it.status !== 'POSTED' && (
                        <button
                          type="button"
                          onClick={() => void handleQuickStatus(it, 'POSTED')}
                          className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold cursor-pointer"
                        >
                          Tandai Posting
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openModal(it)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {confirmDeleteId === it.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleDelete(it.id)}
                            className="px-2 py-1 rounded bg-rose-600 text-white text-[10px] font-bold"
                          >
                            Hapus
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(it.id)}
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isOpen && canPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                {editing ? 'Edit Jadwal Konten' : 'Tambah Jadwal Konten'}
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                >
                  {CONTENT_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Judul konten / poster"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                />
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ContentScheduleStatus)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="APPROVED">Disetujui</option>
                  <option value="POSTED">Sudah Diposting</option>
                </select>
              </div>
              <input
                type="text"
                value={pic}
                onChange={(e) => setPic(e.target.value)}
                placeholder="PIC / Penanggung Jawab"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Caption, konsep visual, atau link bahan..."
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
