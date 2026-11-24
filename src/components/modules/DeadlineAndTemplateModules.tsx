import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Bell,
  BookOpen,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  Layers,
  LayoutGrid,
  MessageSquare,
  PauseCircle,
  PlayCircle,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  PRODUCTION_STAGES,
  ROLE_DEFINITIONS,
  STUDENT_ROLES,
  isCoordinatorRole,
  isCoreCommitteeRole,
  isTeacherOrAdmin,
} from '../../core/constants';
import { DEADLINE_TEMPLATES, DeadlineTemplate } from '../../core/deadlineTemplates';
import {
  DeadlineSubmission,
  DeadlineTask,
  PhotoEvidence,
  ProductionStage,
  SchoolClass,
  UserProfile,
} from '../../core/types';
import { getTaskStage, isSubmissionDone, isTaskRelevantToUser } from '../../services/autoScoreService';
import {
  makeSafeId,
  notifyUsers,
  recordAuditLog,
  removeDocument,
  upsertDocument,
} from '../../services/firestoreService';
import { buildWhatsAppUrl } from '../../utils/imageCompress';
import { PhotoEvidenceUploader } from '../common/PhotoEvidenceUploader';
import { useToast } from '../common/Toast';

export const DeadlineModule: React.FC<{
  user: UserProfile;
  classId: string;
  currentStage: ProductionStage;
  deadlines: DeadlineTask[];
  submissions: DeadlineSubmission[];
  classMembers: UserProfile[];
  allClasses?: SchoolClass[];
}> = ({ user, classId, currentStage, deadlines, submissions, classMembers, allClasses = [] }) => {
  const { showToast } = useToast();
  const canCreate = isCoreCommitteeRole(user.role) || isCoordinatorRole(user.role);
  const canReview = isTeacherOrAdmin(user.role) || user.role === 'Pimpinan Produksi';
  const isTeacher = isTeacherOrAdmin(user.role);

  const [stageFilter, setStageFilter] = useState<'ALL' | ProductionStage>(currentStage);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'DONE' | 'LATE' | 'HOLD' | 'CANCELLED'>('ALL');
  const [search, setSearch] = useState('');
  const [groupByStage, setGroupByStage] = useState(false);
  const [collapsedStages, setCollapsedStages] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // HOLD / CANCELLED modal
  const [statusModalTask, setStatusModalTask] = useState<DeadlineTask | null>(null);
  const [statusModalMode, setStatusModalMode] = useState<'HOLD' | 'CANCELLED'>('HOLD');
  const [statusReason, setStatusReason] = useState('');

  // Duplicate to other classes modal
  const [duplicateTask, setDuplicateTask] = useState<DeadlineTask | null>(null);
  const [duplicateClassIds, setDuplicateClassIds] = useState<string[]>([]);

  // Create / Edit modal state
  const [showCreate, setShowCreate] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskStage, setTaskStage] = useState<ProductionStage>(currentStage);
  const [dueDate, setDueDate] = useState(() =>
    new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16)
  );
  const [priority, setPriority] = useState<DeadlineTask['priority']>('HIGH');
  const [targetScope, setTargetScope] = useState<DeadlineTask['targetScope']>('SEMUA');
  const [targetRole, setTargetRole] = useState('Pemeran');
  const [targetDivision, setTargetDivision] = useState('Perlengkapan');
  const [targetUserIds, setTargetUserIds] = useState<string[]>([]);
  const [isCritical, setIsCritical] = useState(false);
  const [refMeta, setRefMeta] = useState<{ reference?: string; deadlineRef?: string }>({});

  // Student submit state
  const [activeSubmitTaskId, setActiveSubmitTaskId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoEvidence[]>([]);
  const [verifiedAuthentic, setVerifiedAuthentic] = useState(false);

  // Teacher review state
  const [reviewTaskId, setReviewTaskId] = useState<string | null>(null);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});

  const divisions = useMemo(
    () => Array.from(new Set(ROLE_DEFINITIONS.map((r) => r.divisionName))),
    []
  );

  const studentMembers = useMemo(
    () => classMembers.filter((m) => !isTeacherOrAdmin(m.role) && m.isActive !== false),
    [classMembers]
  );

  const otherClasses = useMemo(
    () => allClasses.filter((c) => c.id !== classId && c.isActive !== false),
    [allClasses, classId]
  );

  const visibleDeadlines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...deadlines]
      .filter((d) => (statusFilter === 'CANCELLED' ? d.status === 'CANCELLED' : d.status !== 'CANCELLED'))
      .filter((d) => (stageFilter === 'ALL' ? true : getTaskStage(d) === stageFilter))
      .filter((d) => (canReview ? true : isTaskRelevantToUser(d, user)))
      .filter((d) => {
        if (!q) return true;
        return (
          d.title.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          (d.reference || '').toLowerCase().includes(q)
        );
      })
      .filter((d) => {
        if (statusFilter === 'ALL' || statusFilter === 'CANCELLED') return true;
        if (statusFilter === 'HOLD') return d.status === 'HOLD';
        const mySub = submissions.find((s) => s.deadlineId === d.id && s.studentId === user.uid);
        const done = isSubmissionDone(mySub);
        const isOverdue = Date.now() > new Date(d.dueDate).getTime();
        if (statusFilter === 'DONE') return done;
        if (statusFilter === 'LATE') {
          return Boolean(mySub?.status === 'TERLAMBAT' || (!done && isOverdue));
        }
        return d.status !== 'HOLD' && !done;
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [deadlines, stageFilter, statusFilter, search, canReview, user, submissions]);

  const summaryStats = useMemo(() => {
    const relevant = deadlines.filter(
      (d) => d.status !== 'CANCELLED' && (canReview || isTaskRelevantToUser(d, user))
    );
    let done = 0;
    let overdue = 0;
    for (const d of relevant) {
      const sub = submissions.find((s) => s.deadlineId === d.id && s.studentId === user.uid);
      if (isSubmissionDone(sub)) {
        done++;
      } else if (d.status !== 'HOLD' && Date.now() > new Date(d.dueDate).getTime()) {
        overdue++;
      }
    }
    return { total: relevant.length, done, overdue };
  }, [deadlines, submissions, canReview, user]);

  const getDeadlineBadge = (dueIso: string) => {
    const diffDays = Math.ceil((new Date(dueIso).getTime() - Date.now()) / 86400000);
    if (diffDays < 0)
      return {
        text: `Terlambat ${Math.abs(diffDays)} hari`,
        cls: 'text-rose-600 dark:text-rose-400',
      };
    if (diffDays === 0) return { text: 'HARI INI', cls: 'text-rose-600 dark:text-rose-400' };
    if (diffDays === 1) return { text: 'BESOK', cls: 'text-amber-600 dark:text-amber-400' };
    return { text: `${diffDays} hari lagi`, cls: 'text-slate-500 dark:text-slate-400' };
  };

  const resetForm = () => {
    setEditingTaskId(null);
    setTitle('');
    setDescription('');
    setTaskStage(currentStage);
    setDueDate(new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16));
    setPriority('HIGH');
    setTargetScope('SEMUA');
    setTargetRole('Pemeran');
    setTargetDivision('Perlengkapan');
    setTargetUserIds([]);
    setIsCritical(false);
    setRefMeta({});
  };

  const handleOpenEdit = (task: DeadlineTask) => {
    setEditingTaskId(task.id);
    setTitle(task.title);
    setDescription(task.description);
    setTaskStage(getTaskStage(task));
    setDueDate(new Date(task.dueDate).toISOString().slice(0, 16));
    setPriority(task.priority);
    setTargetScope(task.targetScope);
    setTargetRole(task.targetRole || 'Pemeran');
    setTargetDivision(task.targetDivision || 'Perlengkapan');
    setTargetUserIds(task.targetUserIds || []);
    setIsCritical(task.isCritical);
    setRefMeta({ reference: task.reference, deadlineRef: task.deadlineRef });
    setShowCreate(true);
  };

  const handlePickTemplate = (tpl: DeadlineTemplate) => {
    setEditingTaskId(null);
    setTitle(tpl.title);
    setDescription(tpl.description);
    setTaskStage(tpl.stage);
    const d = new Date(Date.now() + tpl.daysFromNow * 86400000);
    d.setHours(23, 59, 0, 0);
    setDueDate(d.toISOString().slice(0, 16));
    setPriority(tpl.priority);
    setTargetScope(tpl.targetType);
    if (tpl.targetRole) setTargetRole(tpl.targetRole);
    if (tpl.targetDivision) setTargetDivision(tpl.targetDivision);
    setIsCritical(tpl.isCritical);
    setRefMeta({ reference: tpl.reference, deadlineRef: tpl.deadlineRef });
    setShowTemplatePicker(false);
    setShowCreate(true);
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('Judul tugas wajib diisi', 'warning');
      return;
    }
    if (targetScope === 'CUSTOM' && targetUserIds.length === 0) {
      showToast('Pilih minimal 1 siswa untuk target khusus', 'warning');
      return;
    }
    setBusy(true);
    try {
      const existing = editingTaskId ? deadlines.find((d) => d.id === editingTaskId) : undefined;
      const id = editingTaskId || makeSafeId('dl');
      const task: DeadlineTask = {
        id,
        classId,
        stage: taskStage,
        title: title.trim(),
        description: description.trim(),
        dueDate: new Date(dueDate).toISOString(),
        priority,
        targetScope,
        ...(targetScope === 'PERAN' ? { targetRole } : {}),
        ...(targetScope === 'DIVISI' ? { targetDivision } : {}),
        ...(targetScope === 'CUSTOM' ? { targetUserIds } : {}),
        isCritical,
        status: existing?.status || 'PENDING',
        ...(refMeta.reference ? { reference: refMeta.reference } : {}),
        ...(refMeta.deadlineRef ? { deadlineRef: refMeta.deadlineRef } : {}),
        ...(existing?.carriedOverFrom ? { carriedOverFrom: existing.carriedOverFrom } : {}),
        createdBy: existing?.createdBy || user.uid,
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
      await upsertDocument('deadlines', id, task as unknown as Record<string, unknown>);
      if (!editingTaskId) {
        await notifyUsers({
          userIds: classMembers
            .filter((m) => m.uid !== user.uid && isTaskRelevantToUser(task, m))
            .map((m) => m.uid),
          classId,
          title: `Tugas Baru: ${task.title}`,
          message: `Tenggat pengumpulan ${new Date(task.dueDate).toLocaleDateString('id-ID')}.`,
          category: 'Tugas',
          link: 'tugas',
        });
      }
      await recordAuditLog({
        user,
        action: editingTaskId ? 'UPDATE' : 'CREATE',
        targetType: 'deadline',
        targetId: id,
        details: `${editingTaskId ? 'Memperbarui' : 'Membuat'} tugas "${task.title}" (${task.stage}).`,
      });
      resetForm();
      setShowCreate(false);
      showToast(editingTaskId ? 'Tugas diperbarui' : 'Tugas baru dipublikasikan', 'success');
    } catch (err) {
      showToast('Gagal menyimpan tugas', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleTaskStatusUpdate = async (
    task: DeadlineTask,
    nextStatus: 'PENDING' | 'HOLD' | 'CANCELLED',
    reason = ''
  ) => {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const updated: DeadlineTask = {
        ...task,
        status: nextStatus,
        ...(nextStatus === 'HOLD'
          ? { holdReason: reason.trim(), heldAt: now, heldBy: user.name }
          : {}),
        ...(nextStatus === 'CANCELLED'
          ? { cancelReason: reason.trim(), cancelledAt: now, cancelledBy: user.name }
          : {}),
      };
      await upsertDocument('deadlines', task.id, updated as unknown as Record<string, unknown>);
      await recordAuditLog({
        user,
        action: 'UPDATE',
        targetType: 'deadline',
        targetId: task.id,
        details: `Mengubah status tugas "${task.title}" menjadi ${nextStatus}${reason ? `: ${reason}` : ''}`,
      });
      setStatusModalTask(null);
      setStatusReason('');
      showToast(`Status tugas diubah menjadi ${nextStatus}`, 'info');
    } catch (err) {
      showToast('Gagal mengubah status tugas', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleDuplicateTask = async () => {
    if (!duplicateTask || duplicateClassIds.length === 0) {
      showToast('Pilih minimal 1 kelas tujuan', 'warning');
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      for (const targetCid of duplicateClassIds) {
        const newId = makeSafeId('dl_dup');
        const copy: DeadlineTask = {
          ...duplicateTask,
          id: newId,
          classId: targetCid,
          status: 'PENDING',
          createdBy: user.uid,
          creatorName: user.name,
          createdAt: now,
        };
        await upsertDocument('deadlines', newId, copy as unknown as Record<string, unknown>);
      }
      await recordAuditLog({
        user,
        action: 'CREATE',
        targetType: 'deadline',
        targetId: duplicateTask.id,
        details: `Menduplikasi tugas "${duplicateTask.title}" ke ${duplicateClassIds.length} kelas.`,
      });
      setDuplicateTask(null);
      setDuplicateClassIds([]);
      showToast(`Tugas berhasil diduplikasi ke ${duplicateClassIds.length} kelas`, 'success');
    } catch (err) {
      showToast('Gagal menduplikasi tugas', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTask = async (task: DeadlineTask) => {
    setBusy(true);
    try {
      await removeDocument('deadlines', task.id);
      await recordAuditLog({
        user,
        action: 'DELETE',
        targetType: 'deadline',
        targetId: task.id,
        details: `Menghapus tugas "${task.title}".`,
      });
      setConfirmDeleteId(null);
      showToast('Tugas dihapus', 'info');
    } catch (err) {
      showToast('Gagal menghapus tugas', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleStudentSubmit = async (task: DeadlineTask) => {
    if (task.status === 'HOLD') {
      showToast('Tugas sedang ditahan sementara (HOLD) oleh pembimbing', 'warning');
      return;
    }
    const requirePhoto = getTaskStage(task) === 'PELAKSANAAN';
    if (requirePhoto && photos.length === 0) {
      showToast('Tahap PELAKSANAAN wajib melampirkan minimal 1 foto bukti', 'warning');
      return;
    }
    if (photos.length > 0 && !verifiedAuthentic) {
      showToast('Centang pernyataan keaslian foto bukti terlebih dahulu', 'warning');
      return;
    }
    setBusy(true);
    try {
      const subId = `${task.id}_${user.uid}`;
      const isLate = Date.now() > new Date(task.dueDate).getTime();
      const sub: DeadlineSubmission = {
        id: subId,
        deadlineId: task.id,
        studentId: user.uid,
        studentName: user.name,
        classId,
        status: isLate ? 'TERLAMBAT' : 'SELESAI',
        submittedAt: new Date().toISOString(),
        photos,
        verifiedAuthentic,
      };
      await upsertDocument('deadlineSubmissions', subId, sub as unknown as Record<string, unknown>);
      const teachers = classMembers.filter((m) => isTeacherOrAdmin(m.role));
      await notifyUsers({
        userIds: teachers.map((t) => t.uid),
        classId,
        title: `${user.name} mengumpulkan tugas`,
        message: `Tugas "${task.title}" ditandai ${sub.status}.`,
        category: 'Tugas',
        link: 'tugas',
      });
      await recordAuditLog({
        user,
        action: 'SUBMIT',
        targetType: 'deadlineSubmission',
        targetId: subId,
        details: `Mengumpulkan tugas "${task.title}" (${sub.status}).`,
      });
      setActiveSubmitTaskId(null);
      setPhotos([]);
      setVerifiedAuthentic(false);
      showToast('Tugas berhasil dikumpulkan!', 'success');
    } catch (err) {
      showToast('Gagal mengumpulkan tugas', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveFeedback = async (sub: DeadlineSubmission, taskTitle: string) => {
    const fb = (feedbackDrafts[sub.id] ?? sub.feedback ?? sub.reviewNote ?? '').trim();
    const rawScore = scoreDrafts[sub.id];
    const existingScore = sub.feedbackScore ?? sub.rating;
    const parsedScore =
      rawScore !== undefined && rawScore !== ''
        ? Math.min(100, Math.max(0, Number(rawScore)))
        : existingScore;
    if (!fb && parsedScore === undefined) {
      showToast('Tulis catatan feedback atau nilai terlebih dahulu', 'warning');
      return;
    }
    setBusy(true);
    try {
      await upsertDocument('deadlineSubmissions', sub.id, {
        ...sub,
        feedback: fb,
        ...(parsedScore !== undefined && !Number.isNaN(parsedScore) ? { feedbackScore: parsedScore } : {}),
        feedbackBy: user.name,
      });
      await notifyUsers({
        userIds: [sub.studentId],
        classId,
        title: `Feedback Tugas: ${taskTitle}`,
        message: `${user.name}: ${fb || `Nilai ${parsedScore}`}`,
        category: 'Feedback',
        link: 'tugas',
      });
      showToast('Feedback tersimpan dan dikirim ke siswa', 'success');
    } catch (err) {
      showToast('Gagal menyimpan feedback', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleRemindMissing = async (task: DeadlineTask, missingStudents: UserProfile[]) => {
    if (missingStudents.length === 0) {
      showToast('Seluruh siswa target sudah mengumpulkan tugas ini', 'info');
      return;
    }
    setBusy(true);
    try {
      await notifyUsers({
        userIds: missingStudents.map((s) => s.uid),
        classId,
        title: `Pengingat Tugas: ${task.title}`,
        message: `Segera kumpulkan sebelum ${new Date(task.dueDate).toLocaleString('id-ID')}.`,
        category: 'Reminder',
        link: 'tugas',
      });
      showToast(`Pengingat dikirim ke ${missingStudents.length} siswa`, 'success');
    } catch (err) {
      showToast('Gagal mengirim pengingat', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const describeTarget = (task: DeadlineTask): string => {
    if (task.targetScope === 'SEMUA') return 'Semua Siswa';
    if (task.targetScope === 'PERAN') {
      return task.targetRoles?.join(', ') || task.targetRole || 'Peran Tertentu';
    }
    if (task.targetScope === 'DIVISI') {
      return task.targetDivisions?.join(', ') || task.targetDivision || 'Divisi Tertentu';
    }
    if (task.targetScope === 'CUSTOM') {
      return `${task.targetUserIds?.length || 0} siswa dipilih`;
    }
    return 'Semua Siswa';
  };

  const filteredModalTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    return DEADLINE_TEMPLATES.filter((t) => {
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.stage.toLowerCase().includes(q) ||
        (t.targetDivision || '').toLowerCase().includes(q) ||
        (t.targetRole || '').toLowerCase().includes(q)
      );
    });
  }, [templateSearch]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Tugas & Deadline Produksi
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ketepatan pengumpulan memengaruhi nilai otomatis Tanggung Jawab. Tahap PELAKSANAAN wajib foto bukti.
          </p>
        </div>
        {canCreate && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowTemplatePicker(true)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              Buat dari Template ({DEADLINE_TEMPLATES.length})
            </button>
            <button
              type="button"
              onClick={() => {
                if (showCreate && !editingTaskId) {
                  setShowCreate(false);
                } else {
                  resetForm();
                  setShowCreate(true);
                }
              }}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Buat Tugas Manual
            </button>
          </div>
        )}
      </div>

      {/* Ringkasan Statistik Cepat */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-3.5">
          <p className="text-[11px] text-slate-500">Total Tugas</p>
          <p className="font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-white mt-0.5">
            {summaryStats.total}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-3.5">
          <p className="text-[11px] text-slate-500">{canReview ? 'Tahap Aktif' : 'Sudah Kumpul'}</p>
          <p className="font-mono tabular-nums text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
            {canReview ? currentStage : summaryStats.done}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-3.5">
          <p className="text-[11px] text-slate-500">Melewati Tenggat</p>
          <p className="font-mono tabular-nums text-xl font-bold text-rose-600 dark:text-rose-400 mt-0.5">
            {summaryStats.overdue}
          </p>
        </div>
      </div>

      {/* Quick Template Picker Modal */}
      {showTemplatePicker && canCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl max-h-[85vh] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-amber-500" />
                  Pilih Template Tugas ({filteredModalTemplates.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Klik salah satu template untuk mengisi form deadline secara otomatis.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTemplatePicker(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  placeholder="Cari judul template, tahap, divisi, atau peran..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredModalTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handlePickTemplate(tpl)}
                  className="text-left rounded-xl border border-slate-200 dark:border-slate-800 hover:border-amber-500 p-3.5 space-y-1.5 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      {tpl.stage} · {tpl.priority}
                    </span>
                    <span className="font-mono text-slate-400">H+{tpl.daysFromNow}</span>
                  </div>
                  <p className="font-display font-bold text-xs text-slate-900 dark:text-white">
                    {tpl.title}
                  </p>
                  <p className="text-[11px] text-slate-500 line-clamp-2">{tpl.description}</p>
                  <p className="text-[11px] text-slate-400">
                    Target: {tpl.targetDivision || tpl.targetRole || tpl.targetRoles?.join(', ') || 'Semua Siswa'}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showCreate && canCreate && (
        <form
          onSubmit={handleCreateOrUpdate}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
              {editingTaskId ? 'Edit Tugas & Deadline' : 'Terbitkan Tugas & Deadline Baru'}
            </h3>
            {refMeta.deadlineRef && (
              <span className="font-mono text-[11px] text-amber-600 dark:text-amber-400">
                Ref: {refMeta.deadlineRef}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Judul tugas produksi..."
              className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono"
            />
          </div>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Instruksi pengerjaan tugas..."
            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
          />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <select
              value={taskStage}
              onChange={(e) => setTaskStage(e.target.value as ProductionStage)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            >
              {PRODUCTION_STAGES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as DeadlineTask['priority'])}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            >
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
            <select
              value={targetScope}
              onChange={(e) => setTargetScope(e.target.value as DeadlineTask['targetScope'])}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            >
              <option value="SEMUA">Semua Siswa</option>
              <option value="PERAN">Peran Tertentu</option>
              <option value="DIVISI">Divisi Tertentu</option>
              <option value="CUSTOM">Siswa Pilihan (Custom)</option>
            </select>
            {targetScope === 'PERAN' && (
              <select
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              >
                {STUDENT_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}
            {targetScope === 'DIVISI' && (
              <select
                value={targetDivision}
                onChange={(e) => setTargetDivision(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              >
                {divisions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
          </div>

          {targetScope === 'CUSTOM' && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Pilih Siswa Target ({targetUserIds.length} dipilih):
              </p>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {studentMembers.map((st) => {
                  const checked = targetUserIds.includes(st.uid);
                  return (
                    <label
                      key={st.uid}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setTargetUserIds((prev) =>
                            checked ? prev.filter((id) => id !== st.uid) : [...prev, st.uid]
                          )
                        }
                      />
                      {st.name}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isCritical}
                onChange={(e) => setIsCritical(e.target.checked)}
                className="rounded border-slate-300 text-amber-500"
              />
              Tugas Kritis (keterlambatan/tidak kumpul memengaruhi skor maksimal)
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowCreate(false);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-semibold cursor-pointer"
              >
                {editingTaskId ? 'Simpan Perubahan' : 'Terbitkan Tugas'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Stage, Status, Grouping, & Search filter bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(['ALL', ...PRODUCTION_STAGES] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStageFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                stageFilter === st
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {st === 'ALL' ? 'Semua Tahap' : st}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setGroupByStage(!groupByStage)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border ${
              groupByStage
                ? 'bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-300'
                : 'bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Grup per Tahap
          </button>
          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari tugas..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-slate-100 text-xs"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-slate-100 text-xs font-semibold"
          >
            <option value="ALL">Semua Status Aktif</option>
            {!canReview && <option value="PENDING">Belum Dikumpulkan</option>}
            {!canReview && <option value="DONE">Sudah Dikumpulkan</option>}
            {!canReview && <option value="LATE">Terlambat / Lewat Batas</option>}
            <option value="HOLD">Ditahan (HOLD)</option>
            {canCreate && <option value="CANCELLED">Dibatalkan (Arsip)</option>}
          </select>
        </div>
      </div>

      {/* HOLD / CANCELLED modal */}
      {statusModalTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-2xl">
            <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
              {statusModalMode === 'HOLD' ? 'Tahan Sementara (HOLD)' : 'Batalkan Tugas (CANCELLED)'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">{statusModalTask.title}</p>
            <textarea
              rows={2}
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder="Alasan / catatan perubahan status..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStatusModalTask(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleTaskStatusUpdate(statusModalTask, statusModalMode, statusReason)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold text-white ${
                  statusModalMode === 'HOLD' ? 'bg-amber-600' : 'bg-rose-600'
                }`}
              >
                {statusModalMode === 'HOLD' ? 'Konfirmasi HOLD' : 'Konfirmasi Batalkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate to other classes modal */}
      {duplicateTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-2xl">
            <h3 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Copy className="w-4 h-4 text-amber-500" />
              Duplikat Tugas ke Kelas Lain
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">{duplicateTask.title}</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto p-2 rounded-xl border border-slate-200 dark:border-slate-800">
              {otherClasses.map((cls) => (
                <label
                  key={cls.id}
                  className="flex items-center gap-2 text-xs cursor-pointer text-slate-700 dark:text-slate-200 py-1"
                >
                  <input
                    type="checkbox"
                    checked={duplicateClassIds.includes(cls.id)}
                    onChange={(e) =>
                      setDuplicateClassIds((prev) =>
                        e.target.checked ? [...prev, cls.id] : prev.filter((id) => id !== cls.id)
                      )
                    }
                  />
                  <span>{cls.name} ({cls.code})</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDuplicateTask(null);
                  setDuplicateClassIds([]);
                }}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={busy || duplicateClassIds.length === 0}
                onClick={handleDuplicateTask}
                className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-semibold disabled:opacity-50"
              >
                Duplikat ({duplicateClassIds.length} kelas)
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {visibleDeadlines.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-10 text-center text-xs text-slate-500">
            Belum ada tugas pada filter ini.
          </div>
        ) : (
          (groupByStage
            ? PRODUCTION_STAGES.filter((st) => visibleDeadlines.some((t) => getTaskStage(t) === st)).map((st) => ({
                groupKey: st,
                tasks: visibleDeadlines.filter((t) => getTaskStage(t) === st),
              }))
            : [{ groupKey: 'FLAT', tasks: visibleDeadlines }]
          ).map((grp) => {
            const isCollapsed = groupByStage && Boolean(collapsedStages[grp.groupKey]);
            return (
              <div key={grp.groupKey} className="space-y-3">
                {groupByStage && (
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedStages((prev) => ({
                        ...prev,
                        [grp.groupKey]: !prev[grp.groupKey],
                      }))
                    }
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 text-left"
                  >
                    <span className="font-display font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-amber-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-amber-500" />
                      )}
                      Tahap {grp.groupKey}
                    </span>
                    <span className="text-xs font-mono text-slate-500">{grp.tasks.length} tugas</span>
                  </button>
                )}

                {!isCollapsed &&
                  grp.tasks.map((task) => {
                    const badge = getDeadlineBadge(task.dueDate);
                    const mySub = submissions.find((s) => s.deadlineId === task.id && s.studentId === user.uid);
                    const mySubDone = isSubmissionDone(mySub);
                    const taskSubs = submissions.filter(
                      (s) => s.deadlineId === task.id && isSubmissionDone(s)
                    );
                    const targetStudents = studentMembers.filter((m) => isTaskRelevantToUser(task, m));
                    const submittedIds = new Set(taskSubs.map((s) => s.studentId));
                    const missingStudents = targetStudents.filter((s) => !submittedIds.has(s.uid));
                    const tplMatch = task.deadlineRef
                      ? DEADLINE_TEMPLATES.find((t) => t.deadlineRef === task.deadlineRef)
                      : undefined;

                    return (
                      <div
                        key={task.id}
                        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              {task.status === 'HOLD' && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-[10px]">
                                  HOLD
                                </span>
                              )}
                              {task.status === 'CANCELLED' && (
                                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold text-[10px]">
                                  DIBATALKAN
                                </span>
                              )}
                              <span className={`font-bold ${badge.cls}`}>{badge.text}</span>
                              <span className="text-slate-400" aria-hidden="true">·</span>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">{getTaskStage(task)}</span>
                              <span className="text-slate-400" aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums text-slate-500">
                                {new Date(task.dueDate).toLocaleDateString('id-ID', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                              <span className="text-slate-400" aria-hidden="true">·</span>
                              <span className="text-slate-500 dark:text-slate-400">
                                Target: <strong className="text-slate-700 dark:text-slate-200">{describeTarget(task)}</strong>
                              </span>
                              {task.isCritical && (
                                <>
                                  <span className="text-slate-400" aria-hidden="true">·</span>
                                  <span className="font-bold text-rose-500">Kritis</span>
                                </>
                              )}
                              {task.carriedOverFrom && (
                                <>
                                  <span className="text-slate-400" aria-hidden="true">·</span>
                                  <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                    Lanjutan {task.carriedOverFrom}
                                  </span>
                                </>
                              )}
                            </div>
                            <h3 className="font-display font-bold text-base text-slate-900 dark:text-white mt-1">
                              {task.title}
                            </h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                              {task.description}
                            </p>
                            {task.holdReason && task.status === 'HOLD' && (
                              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                                Alasan Hold: {task.holdReason}
                              </p>
                            )}
                            {task.cancelReason && task.status === 'CANCELLED' && (
                              <p className="text-[11px] text-rose-500 mt-1">
                                Alasan Pembatalan: {task.cancelReason}
                              </p>
                            )}
                            {task.reference && (
                              <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                                <BookOpen className="w-3 h-3 text-amber-500" />
                                Acuan: {task.reference} {task.deadlineRef ? `(${task.deadlineRef})` : ''}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            {!isTeacherOrAdmin(user.role) && !mySubDone && task.status === 'PENDING' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveSubmitTaskId(activeSubmitTaskId === task.id ? null : task.id);
                                  setPhotos([]);
                                  setVerifiedAuthentic(false);
                                }}
                                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Tandai Selesai
                              </button>
                            )}
                            {canReview && (
                              <button
                                type="button"
                                onClick={() => setReviewTaskId(reviewTaskId === task.id ? null : task.id)}
                                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                Progres ({taskSubs.length}/{targetStudents.length || taskSubs.length})
                              </button>
                            )}
                            {canCreate && (
                              <>
                                {task.status === 'PENDING' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setStatusModalTask(task);
                                        setStatusModalMode('HOLD');
                                        setStatusReason('');
                                      }}
                                      title="Tahan sementara (HOLD)"
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 cursor-pointer"
                                    >
                                      <PauseCircle className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setStatusModalTask(task);
                                        setStatusModalMode('CANCELLED');
                                        setStatusReason('');
                                      }}
                                      title="Batalkan tugas"
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
                                    >
                                      <Ban className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                                {task.status === 'HOLD' && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleTaskStatusUpdate(task, 'PENDING')}
                                    title="Aktifkan kembali"
                                    className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-500/10 cursor-pointer"
                                  >
                                    <PlayCircle className="w-4 h-4" />
                                  </button>
                                )}
                                {task.status === 'CANCELLED' && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleTaskStatusUpdate(task, 'PENDING')}
                                    title="Pulihkan tugas"
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold inline-flex items-center gap-1"
                                  >
                                    <RotateCcw className="w-3 h-3" /> Pulihkan
                                  </button>
                                )}
                                {isTeacher && otherClasses.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDuplicateTask(task);
                                      setDuplicateClassIds([]);
                                    }}
                                    title="Duplikat ke kelas lain"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 cursor-pointer"
                                  >
                                    <Copy className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(task)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 cursor-pointer"
                                  aria-label="Edit tugas"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                {confirmDeleteId === task.id ? (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => handleDeleteTask(task)}
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
                                    onClick={() => setConfirmDeleteId(task.id)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
                                    aria-label="Hapus tugas"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                {mySubDone && mySub && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs space-y-1">
                    <p className="font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Dikumpulkan ({mySub.status === 'BELUM' ? 'SELESAI' : mySub.status}) pada{' '}
                      {mySub.submittedAt ? new Date(mySub.submittedAt).toLocaleString('id-ID') : '-'}
                    </p>
                    {(mySub.notes || mySub.proofNote) && (
                      <p className="text-slate-700 dark:text-slate-200">
                        Catatan: {mySub.notes || mySub.proofNote}
                      </p>
                    )}
                    {(mySub.linkUrl || mySub.proofUrl) && (
                      <a
                        href={mySub.linkUrl || mySub.proofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 underline"
                      >
                        Lihat Tautan Bukti
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {(mySub.feedbackScore ?? mySub.rating) !== undefined && (
                      <p className="font-mono font-bold text-slate-800 dark:text-slate-100">
                        Nilai Tugas: {mySub.feedbackScore ?? mySub.rating}
                      </p>
                    )}
                    {(mySub.feedback || mySub.reviewNote) && (
                      <p className="text-slate-700 dark:text-slate-200">
                        <strong>Feedback {mySub.feedbackBy || 'Pembimbing'}:</strong>{' '}
                        {mySub.feedback || mySub.reviewNote}
                      </p>
                    )}
                  </div>
                )}

                {activeSubmitTaskId === task.id && (
                  <div className="pt-2 space-y-3">
                    {tplMatch?.photoHint && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                        <Camera className="w-4 h-4 shrink-0 text-amber-500" />
                        <span>
                          <strong>Petunjuk Foto Bukti:</strong> {tplMatch.photoHint}
                        </span>
                      </div>
                    )}
                    <PhotoEvidenceUploader
                      photos={photos}
                      onChange={setPhotos}
                      verifiedAuthentic={verifiedAuthentic}
                      onVerifiedChange={setVerifiedAuthentic}
                      requirePhoto={getTaskStage(task) === 'PELAKSANAAN'}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveSubmitTaskId(null)}
                        className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStudentSubmit(task)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        Kirim Pengumpulan
                      </button>
                    </div>
                  </div>
                )}

                {canReview && reviewTaskId === task.id && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-4">
                    {/* Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          Sudah Mengumpulkan ({taskSubs.length}) · Belum ({missingStudents.length})
                        </span>
                        {missingStudents.length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleRemindMissing(task, missingStudents)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold hover:bg-amber-500/25 cursor-pointer"
                          >
                            <Bell className="w-3 h-3" />
                            Ingatkan Belum Kumpul
                          </button>
                        )}
                      </div>
                      {targetStudents.length > 0 && (
                        <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, Math.round((taskSubs.length / targetStudents.length) * 100))}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {taskSubs.length === 0 ? (
                      <p className="text-xs text-slate-500">Belum ada siswa mengumpulkan.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {taskSubs.map((sub) => {
                          const subPhotos =
                            sub.photos && sub.photos.length > 0 ? sub.photos : sub.evidencePhotos || [];
                          const subLink = sub.linkUrl || sub.proofUrl;
                          const subNote = sub.notes || sub.proofNote;
                          const subScore = sub.feedbackScore ?? sub.rating;
                          const subFeedback = sub.feedback || sub.reviewNote || '';
                          const displayStatus = sub.status === 'BELUM' ? 'SELESAI' : sub.status;
                          return (
                            <div
                              key={sub.id}
                              className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2 text-xs"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900 dark:text-white">
                                  {sub.studentName} ·{' '}
                                  <span
                                    className={
                                      displayStatus === 'TERLAMBAT'
                                        ? 'text-rose-500'
                                        : 'text-emerald-600 dark:text-emerald-400'
                                    }
                                  >
                                    {displayStatus}
                                  </span>
                                </span>
                                <span className="font-mono text-slate-400">
                                  {sub.submittedAt
                                    ? new Date(sub.submittedAt).toLocaleString('id-ID')
                                    : '-'}
                                </span>
                              </div>
                              {subNote && (
                                <p className="text-slate-600 dark:text-slate-300">{subNote}</p>
                              )}
                              {subLink && (
                                <a
                                  href={subLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 underline"
                                >
                                  Buka Tautan Bukti
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                              {subPhotos.length > 0 && (
                                <div className="flex gap-2 overflow-x-auto">
                                  {subPhotos.map((ph, phIdx) => (
                                    <img
                                      key={ph.id || `${sub.id}_ph_${phIdx}`}
                                      src={ph.dataUrl}
                                      alt={ph.caption || 'Foto bukti tugas'}
                                      className="w-20 h-16 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
                                      referrerPolicy="no-referrer"
                                    />
                                  ))}
                                </div>
                              )}
                              <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={
                                    scoreDrafts[sub.id] ??
                                    (subScore !== undefined ? String(subScore) : '')
                                  }
                                  onChange={(e) =>
                                    setScoreDrafts((prev) => ({ ...prev, [sub.id]: e.target.value }))
                                  }
                                  placeholder="Nilai (opsional)"
                                  className="sm:w-32 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                                />
                                <input
                                  type="text"
                                  value={feedbackDrafts[sub.id] ?? subFeedback}
                                  onChange={(e) =>
                                    setFeedbackDrafts((prev) => ({
                                      ...prev,
                                      [sub.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Tulis feedback guru..."
                                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveFeedback(sub, task.title)}
                                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-semibold cursor-pointer"
                                >
                                  Kirim Feedback
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Daftar Siswa Belum Mengumpulkan */}
                    {missingStudents.length > 0 && (
                      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 space-y-2">
                        <p className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Belum Mengumpulkan ({missingStudents.length} siswa)
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                          {missingStudents.map((ms) => (
                            <div
                              key={ms.uid}
                              className="flex items-center justify-between gap-2 rounded-lg bg-white/80 dark:bg-slate-900/80 px-2.5 py-1.5 border border-slate-200 dark:border-slate-800"
                            >
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                                  {ms.name}
                                </p>
                                <p className="text-[11px] text-slate-400 truncate">{ms.role}</p>
                              </div>
                              <a
                                href={buildWhatsAppUrl(
                                  ms.phone,
                                  `Halo ${ms.name}, pengingat tugas "${task.title}" (tenggat ${new Date(task.dueDate).toLocaleDateString('id-ID')}). Mohon segera dikumpulkan di SP-PPT.`
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold shrink-0"
                              >
                                WA
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export const TemplateHubModule: React.FC<{
  user: UserProfile;
  classId: string;
  classMembers: UserProfile[];
  allClasses?: SchoolClass[];
}> = ({ user, classId, classMembers, allClasses = [] }) => {
  const { showToast } = useToast();
  const [stage, setStage] = useState<ProductionStage>('PERSIAPAN');
  const [targetFilter, setTargetFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [customDueMap, setCustomDueMap] = useState<Record<string, string>>({});
  const [tplBusy, setTplBusy] = useState(false);

  // Editable pre-filled modal when teacher clicks "Sesuaikan & Apply"
  const [editingTemplate, setEditingTemplate] = useState<DeadlineTemplate | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editPriority, setEditPriority] = useState<DeadlineTask['priority']>('HIGH');
  const [editCritical, setEditCritical] = useState(false);
  const [editTargetClassIds, setEditTargetClassIds] = useState<string[]>([classId]);

  const targetOptions = useMemo(() => {
    const vals = new Set<string>();
    DEADLINE_TEMPLATES.filter((t) => t.stage === stage).forEach((t) => {
      if (t.targetDivision) vals.add(t.targetDivision);
      if (t.targetRole) vals.add(t.targetRole);
      if (t.targetType === 'SEMUA') vals.add('Semua Siswa');
    });
    return Array.from(vals).sort();
  }, [stage]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return DEADLINE_TEMPLATES.filter((t) => t.stage === stage)
      .filter((t) => {
        if (targetFilter === 'ALL') return true;
        if (targetFilter === 'Semua Siswa') return t.targetType === 'SEMUA';
        return (
          t.targetDivision === targetFilter ||
          t.targetRole === targetFilter ||
          t.targetRoles?.includes(targetFilter)
        );
      })
      .filter((t) => {
        if (!q) return true;
        return (
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.deadlineRef.toLowerCase().includes(q)
        );
      });
  }, [stage, targetFilter, search]);

  if (!isTeacherOrAdmin(user.role)) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-6 text-sm text-slate-500">
        Template Hub hanya dapat diakses Guru Pengampu & Administrator.
      </div>
    );
  }

  const publishFromTemplate = async (
    tpl: DeadlineTemplate,
    overrides?: {
      title: string;
      description: string;
      dueIso: string;
      priority: DeadlineTask['priority'];
      isCritical: boolean;
      targetClassIds?: string[];
    }
  ) => {
    setTplBusy(true);
    try {
      const defaultDate = new Date(Date.now() + tpl.daysFromNow * 86400000).toISOString().slice(0, 10);
      const dueStr = customDueMap[tpl.id] || defaultDate;
      const targetCids =
        overrides?.targetClassIds && overrides.targetClassIds.length > 0
          ? overrides.targetClassIds
          : [classId];
      for (const cid of targetCids) {
        const id = makeSafeId('dl_tpl');
        const task: DeadlineTask = {
          id,
          classId: cid,
          stage: tpl.stage,
          title: overrides?.title || tpl.title,
          description: overrides?.description || tpl.description,
          dueDate: overrides?.dueIso || new Date(`${dueStr}T23:59:00`).toISOString(),
          priority: overrides?.priority || tpl.priority,
          targetScope: tpl.targetType,
          ...(tpl.targetDivision ? { targetDivision: tpl.targetDivision } : {}),
          ...(tpl.targetRole ? { targetRole: tpl.targetRole } : {}),
          ...(tpl.targetRoles ? { targetRoles: tpl.targetRoles } : {}),
          isCritical: overrides ? overrides.isCritical : tpl.isCritical,
          status: 'PENDING',
          reference: tpl.reference,
          deadlineRef: tpl.deadlineRef,
          createdBy: user.uid,
          createdAt: new Date().toISOString(),
        };
        await upsertDocument('deadlines', id, task as unknown as Record<string, unknown>);
        if (cid === classId) {
          await notifyUsers({
            userIds: classMembers
              .filter((m) => m.uid !== user.uid && isTaskRelevantToUser(task, m))
              .map((m) => m.uid),
            classId: cid,
            title: `Tugas Baru: ${task.title}`,
            message: `Template diterapkan untuk tahap ${tpl.stage}. Batas: ${new Date(task.dueDate).toLocaleDateString('id-ID')}.`,
            category: 'Tugas',
            link: 'tugas',
          });
        }
        await recordAuditLog({
          user,
          action: 'CREATE',
          targetType: 'deadlineTemplate',
          targetId: id,
          details: `Menerapkan template ${tpl.deadlineRef} ("${task.title}") ke ${cid}.`,
        });
      }
      showToast(
        targetCids.length > 1
          ? `Template diterapkan ke ${targetCids.length} kelas`
          : `Template "${overrides?.title || tpl.title}" diterapkan ke Tugas & Deadline`,
        'success'
      );
    } catch (err) {
      showToast('Gagal menerapkan template', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setTplBusy(false);
    }
  };

  const openPreFilledForm = (tpl: DeadlineTemplate) => {
    const defaultDate = new Date(Date.now() + tpl.daysFromNow * 86400000).toISOString().slice(0, 10);
    const dueStr = customDueMap[tpl.id] || defaultDate;
    setEditingTemplate(tpl);
    setEditTitle(tpl.title);
    setEditDescription(tpl.description);
    setEditDueDate(`${dueStr}T23:59`);
    setEditPriority(tpl.priority);
    setEditCritical(tpl.isCritical);
    setEditTargetClassIds([classId]);
  };

  const handleConfirmEditedApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate || tplBusy) return;
    await publishFromTemplate(editingTemplate, {
      title: editTitle.trim() || editingTemplate.title,
      description: editDescription.trim() || editingTemplate.description,
      dueIso: new Date(editDueDate).toISOString(),
      priority: editPriority,
      isCritical: editCritical,
      targetClassIds: editTargetClassIds,
    });
    setEditingTemplate(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <LayoutGrid className="w-5 h-5 text-amber-500" />
          Template Hub Tugas Produksi ({DEADLINE_TEMPLATES.length} Template)
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Terapkan atau sesuaikan template tugas standar per tahap, peran, dan divisi dalam satu klik.
        </p>
      </div>

      {/* Stage Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {PRODUCTION_STAGES.map((st) => {
          const count = DEADLINE_TEMPLATES.filter((t) => t.stage === st).length;
          return (
            <button
              key={st}
              type="button"
              onClick={() => {
                setStage(st);
                setTargetFilter('ALL');
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                stage === st
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {st} ({count})
            </button>
          );
        })}
      </div>

      {/* Role/Division Filter & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari judul, kode template (TPL-...), atau deskripsi..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 text-xs"
          />
        </div>
        <select
          value={targetFilter}
          onChange={(e) => setTargetFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 text-xs font-semibold"
        >
          <option value="ALL">Semua Target Peran / Divisi</option>
          {targetOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      {/* Pre-filled Apply Edit Form Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleConfirmEditedApply}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-mono text-amber-600 dark:text-amber-400">
                  {editingTemplate.deadlineRef} · {editingTemplate.stage}
                </p>
                <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Sesuaikan & Terapkan Template
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Judul Tugas</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Deskripsi & Instruksi</label>
              <textarea
                rows={3}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Tenggat Waktu</label>
                <input
                  type="datetime-local"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Prioritas</label>
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value as DeadlineTask['priority'])}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={editCritical}
                onChange={(e) => setEditCritical(e.target.checked)}
              />
              Tandai sebagai Tugas Kritis
            </label>

            {allClasses.length > 1 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-1.5">
                <p className="text-[11px] font-semibold text-slate-500">Terapkan ke Kelas:</p>
                <div className="flex flex-wrap gap-2">
                  {allClasses
                    .filter((c) => c.isActive !== false)
                    .map((cls) => {
                      const checked = editTargetClassIds.includes(cls.id);
                      return (
                        <label
                          key={cls.id}
                          className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setEditTargetClassIds((prev) =>
                                e.target.checked
                                  ? [...prev, cls.id]
                                  : prev.filter((id) => id !== cls.id)
                              )
                            }
                          />
                          {cls.code || cls.name}
                        </label>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={tplBusy || editTargetClassIds.length === 0}
                className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {tplBusy ? 'Menerbitkan...' : 'Terbitkan ke Tugas & Deadline'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {list.map((tpl) => {
          const defaultDate = new Date(Date.now() + tpl.daysFromNow * 86400000).toISOString().slice(0, 10);
          return (
            <div
              key={tpl.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                    {tpl.deadlineRef}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold">{tpl.priority}</span>
                  <span aria-hidden="true">·</span>
                  <span>H+{tpl.daysFromNow} hari</span>
                  {tpl.isCritical && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-rose-500 font-semibold">Kritis</span>
                    </>
                  )}
                </div>
                <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white mt-1.5">
                  {tpl.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{tpl.description}</p>
                <div className="mt-2 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <p>
                    Target:{' '}
                    <strong className="text-slate-700 dark:text-slate-200">
                      {tpl.targetDivision || tpl.targetRole || tpl.targetRoles?.join(', ') || 'Semua Siswa'}
                    </strong>
                  </p>
                  <p>Acuan: {tpl.reference}</p>
                  {tpl.photoHint && (
                    <p className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <Camera className="w-3 h-3" />
                      Foto Bukti: {tpl.photoHint}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <input
                  type="date"
                  value={customDueMap[tpl.id] || defaultDate}
                  onChange={(e) => setCustomDueMap((prev) => ({ ...prev, [tpl.id]: e.target.value }))}
                  className="flex-1 min-w-[130px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => openPreFilledForm(tpl)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Sesuaikan
                </button>
                <button
                  type="button"
                  onClick={() => publishFromTemplate(tpl)}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-semibold whitespace-nowrap cursor-pointer"
                >
                  Terapkan
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
