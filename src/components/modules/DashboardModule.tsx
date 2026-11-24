import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Calendar,
  CheckSquare,
  Database,
  DollarSign,
  GitBranch,
  Layers,
  Megaphone,
  RefreshCw,
  Shield,
  Users,
  Wrench,
} from 'lucide-react';
import {
  DIVISIONS,
  PRODUCTION_STAGES,
  STAGE_LABELS,
  isAdminRole,
  isCoreCommitteeRole,
  isTeacherOrAdmin,
} from '../../core/constants';
import {
  Assessment,
  DeadlineSubmission,
  DeadlineTask,
  ModuleId,
  Production,
  SchoolClass,
  StageManagerConfig,
  UserProfile,
} from '../../core/types';
import {
  checkPeerAssessmentGate,
  computeFinalStudentReport,
  isTaskRelevantToUser,
} from '../../services/autoScoreService';
import { CleanBarChart } from '../common/Charts';

interface Props {
  user: UserProfile;
  activeClass: SchoolClass | undefined;
  allClasses: SchoolClass[];
  production: Production | undefined;
  stageConfig: StageManagerConfig;
  classMembers: UserProfile[];
  assessments: Assessment[];
  deadlines: DeadlineTask[];
  submissions: DeadlineSubmission[];
  loading: boolean;
  onNavigate: (moduleId: ModuleId) => void;
  onMigrateLegacy?: () => Promise<void>;
  legacySyncBusy?: boolean;
}

export const DashboardModule: React.FC<Props> = ({
  user,
  activeClass,
  allClasses,
  production,
  stageConfig,
  classMembers,
  assessments,
  deadlines,
  submissions,
  loading,
  onNavigate,
  onMigrateLegacy,
  legacySyncBusy = false,
}) => {
  const isTeacher = isTeacherOrAdmin(user.role);
  const isAdmin = isAdminRole(user.role);
  const currentStage = stageConfig.currentStage;
  const students = useMemo(
    () => classMembers.filter((m) => !isTeacherOrAdmin(m.role) && m.isActive !== false),
    [classMembers]
  );

  const peerGate = useMemo(
    () => checkPeerAssessmentGate(user, classMembers, assessments, currentStage),
    [user, classMembers, assessments, currentStage]
  );

  const upcomingDeadlines = useMemo(() => {
    const now = Date.now();
    return deadlines
      .filter((d) => {
        if (d.status === 'CANCELLED') return false;
        if (!isTeacher && !isTaskRelevantToUser(d, user)) return false;
        const sub = submissions.find((s) => s.deadlineId === d.id && s.studentId === user.uid);
        if (!isTeacher && sub && sub.status !== 'BELUM') return false;
        const diffDays = (new Date(d.dueDate).getTime() - now) / 86400000;
        return diffDays <= 3 && diffDays >= -7;
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5);
  }, [deadlines, submissions, user, isTeacher]);

  const stageChartData = useMemo(() => {
    return PRODUCTION_STAGES.map((st) => {
      const inStage = assessments.filter((a) => a.stage === st);
      const avg =
        inStage.length > 0
          ? Math.round((inStage.reduce((s, x) => s + x.totalScore, 0) / inStage.length) * 10) / 10
          : 0;
      return {
        label: `${st} (${STAGE_LABELS[st].weight}%)`,
        value: avg,
        colorClass: st === currentStage ? 'bg-amber-500' : 'bg-blue-500',
      };
    });
  }, [assessments, currentStage]);

  const studentWarnings = useMemo(() => {
    if (!isTeacher) return { incompletePeerCount: 0, missingTeacherPhone: false };
    const incompletePeerCount = students.filter(
      (s) => !checkPeerAssessmentGate(s, classMembers, assessments, currentStage).isComplete
    ).length;
    const missingTeacherPhone = !user.phone || user.phone.trim().length < 8;
    return { incompletePeerCount, missingTeacherPhone };
  }, [isTeacher, students, classMembers, assessments, currentStage, user.phone]);

  const myReport = useMemo(() => {
    if (isTeacher) return null;
    return computeFinalStudentReport(user, assessments);
  }, [isTeacher, user, assessments]);

  const isLeadership = isTeacher || isCoreCommitteeRole(user.role);

  const divisionSummary = useMemo(() => {
    if (!isLeadership) return [];
    const activeDeadlines = deadlines.filter((d) => d.status !== 'CANCELLED');
    return DIVISIONS.map((div) => {
      const members = students.filter(
        (m) => m.divisionId === div.id || m.divisionName === div.name || div.roles.includes(m.role)
      );
      const relevantTasks = activeDeadlines.filter((d) => {
        if (d.targetScope === 'SEMUA') return true;
        if (d.targetScope === 'DIVISI') {
          return (
            d.targetDivision === div.name ||
            d.targetDivision === div.id ||
            (d.targetDivisions || []).includes(div.name)
          );
        }
        if (d.targetScope === 'PERAN') {
          return (
            (d.targetRole && div.roles.includes(d.targetRole as any)) ||
            (d.targetRoles || []).some((r) => div.roles.includes(r as any))
          );
        }
        return members.some((m) => isTaskRelevantToUser(d, m));
      });
      const totalPairTargets = members.length * relevantTasks.length;
      const donePairs =
        totalPairTargets === 0
          ? 0
          : members.reduce((acc, member) => {
              const memberDone = relevantTasks.filter((task) =>
                submissions.some(
                  (s) =>
                    s.deadlineId === task.id &&
                    s.studentId === member.uid &&
                    s.status !== 'BELUM'
                )
              ).length;
              return acc + memberDone;
            }, 0);
      const pct = totalPairTargets > 0 ? Math.round((donePairs / totalPairTargets) * 100) : 0;
      return {
        id: div.id,
        name: div.name,
        memberCount: members.length,
        taskCount: relevantTasks.length,
        pct,
      };
    });
  }, [isLeadership, students, deadlines, submissions]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-32 rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Hero Card */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {activeClass?.name || user.classId}
              <span className="mx-1.5" aria-hidden="true">·</span>
              {activeClass?.troupeName || 'Produksi Teater Kelas IX'}
              <span className="mx-1.5" aria-hidden="true">·</span>
              Tahap Aktif: <span className="font-semibold text-amber-600 dark:text-amber-400">{currentStage}</span>
            </p>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-1">
              Selamat datang, {user.name}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              Peran: <span className="font-semibold text-slate-900 dark:text-slate-100">{user.role}</span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              Divisi: <span className="font-semibold text-slate-900 dark:text-slate-100">{user.divisionName}</span>
              {production && (
                <>
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  Lakon: <span className="font-semibold text-slate-900 dark:text-slate-100">{production.title}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {isTeacher ? (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate('kelola-tahapan')}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Layers className="w-4 h-4" />
                  Stage Manager
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('kelola-siswa')}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-xs inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Users className="w-4 h-4" />
                  Kelola Siswa
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate('nilai-saya')}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Award className="w-4 h-4" />
                  Rapor Saya
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('tugas')}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-xs inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <CheckSquare className="w-4 h-4" />
                  Tugas Saya
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Legacy Data Sync Prompt for Teacher/Admin when database is still empty */}
      {isTeacher && (allClasses.length === 0 || students.length === 0) && (
        <section className="rounded-2xl border border-amber-500/50 bg-amber-50/95 dark:bg-amber-950/40 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              Gunakan Data Lama yang Sudah Ada
            </h3>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              Belum ada daftar siswa atau kelas pada database aktif. Anda dapat langsung menarik seluruh data lama dari database <code className="font-mono">(default)</code> atau mengunggah file backup JSON di menu Backup &amp; Restore.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onMigrateLegacy && (
              <button
                type="button"
                disabled={legacySyncBusy}
                onClick={() => void onMigrateLegacy()}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${legacySyncBusy ? 'animate-spin' : ''}`} />
                {legacySyncBusy ? 'Menarik Data...' : 'Tarik Data Lama Sekarang'}
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('backup')}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              Buka Backup &amp; Restore
            </button>
          </div>
        </section>
      )}

      {/* Role-specific KPI / Quick Action Row */}
      {isTeacher ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Total Siswa Kelas</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
              {students.length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {isAdmin ? `${allClasses.length} kelas aktif terdaftar` : activeClass?.code || user.classId}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Tugas Aktif ({currentStage})</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
              {deadlines.filter((d) => d.stage === currentStage && d.status !== 'HOLD' && d.status !== 'CANCELLED').length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {submissions.filter((s) => s.status === 'SELESAI').length} pengumpulan selesai
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Penilaian 360° Masuk</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
              {assessments.filter((a) => a.stage === currentStage).length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Total {assessments.length} evaluasi semua tahap
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4 flex flex-col justify-between">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Aksi Cepat Manajemen</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1">
                {isAdmin ? 'Admin Panel & Audit' : 'Jadwal Penilaian & Backup'}
              </p>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => onNavigate(isAdmin ? 'admin' : 'jadwal-penilaian')}
                className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline inline-flex items-center gap-1"
              >
                {isAdmin ? <Shield className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5" />}
                Buka Modul
              </button>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => onNavigate('backup')}
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:underline inline-flex items-center gap-1"
              >
                <Database className="w-3.5 h-3.5" />
                Backup
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            type="button"
            onClick={() => onNavigate('nilai-saya')}
            className="text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4 hover:border-amber-500/60 transition-colors"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-medium">Rapor Nilai 360°</span>
              <Award className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-2">
              {myReport ? myReport.finalScore : 0}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 inline-flex items-center gap-1">
              Lihat rincian rapor <ArrowRight className="w-3 h-3" />
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('tugas')}
            className="text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4 hover:border-amber-500/60 transition-colors"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-medium">Tugas & Deadline</span>
              <CheckSquare className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-2">
              {upcomingDeadlines.length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 inline-flex items-center gap-1">
              Deadline mendesak (≤ 3 hari) <ArrowRight className="w-3 h-3" />
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('jadwal')}
            className="text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4 hover:border-amber-500/60 transition-colors"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-medium">Jadwal Produksi</span>
              <Calendar className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-white mt-2">
              {STAGE_LABELS[currentStage].label}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 inline-flex items-center gap-1">
              Buka kalender latihan <ArrowRight className="w-3 h-3" />
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('struktur')}
            className="text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4 hover:border-amber-500/60 transition-colors"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-medium">Kerabat Kerja</span>
              <Users className="w-4 h-4 text-slate-400" />
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-2">
              {students.length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 inline-flex items-center gap-1">
              Anggota tim kelas <ArrowRight className="w-3 h-3" />
            </p>
          </button>
        </div>
      )}

      {/* Warnings & Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isTeacher ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-4">
            <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
              Distribusi Nilai per Tahap
            </h3>
            <CleanBarChart data={stageChartData} />
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                Progres Penilaian Rekan (Gate Rapor)
              </h3>
              <span className="font-mono tabular-nums text-xs font-bold text-amber-600 dark:text-amber-400">
                {peerGate.filled}/{peerGate.total} selesai
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all"
                style={{
                  width: `${peerGate.total > 0 ? Math.round((peerGate.filled / peerGate.total) * 100) : 100}%`,
                }}
              />
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {peerGate.isComplete
                ? 'Seluruh target penilaian rekan pada tahap ini telah lengkap. Anda dapat membuka rapor kapan saja saat jadwal dibuka.'
                : `Masih ada ${peerGate.pendingTargets.length} rekan/atasan yang belum Anda nilai pada tahap ${currentStage}. Lengkapi untuk membuka akses Rapor Saya.`}
            </p>
            {!peerGate.isComplete && (
              <button
                type="button"
                onClick={() => onNavigate('nilai')}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs transition-colors"
              >
                Isi Penilaian Rekan Sekarang
              </button>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
              {isTeacher ? 'Perhatian Guru & Sistem' : 'Deadline Terdekat (<= 3 Hari)'}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate(isTeacher ? 'nilai' : 'tugas')}
              className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
            >
              Lihat Semua
            </button>
          </div>

          {isTeacher && (studentWarnings.incompletePeerCount > 0 || studentWarnings.missingTeacherPhone) && (
            <div className="space-y-2">
              {studentWarnings.incompletePeerCount > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>
                    <strong className="font-mono tabular-nums">{studentWarnings.incompletePeerCount}</strong> siswa belum menyelesaikan penilaian 360° tahap {currentStage}.
                  </span>
                </div>
              )}
              {studentWarnings.missingTeacherPhone && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>
                    Nomor WhatsApp Anda belum diisi. Lengkapi di Pengaturan agar siswa dapat menghubungi saat booking alat.
                  </span>
                </div>
              )}
            </div>
          )}

          {upcomingDeadlines.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
              Tidak ada deadline tugas mendesak dalam 3 hari ke depan.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {upcomingDeadlines.map((dl) => (
                <div key={dl.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {dl.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      Batas: {new Date(dl.dueDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      Prioritas {dl.priority}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('tugas')}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
                  >
                    Buka
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Shortcuts */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
            Akses Cepat Produksi
          </h3>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Pintasan modul utama
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => onNavigate('master-timeline')}
            className="text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 hover:border-amber-500/60 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
              <GitBranch className="w-4 h-4" />
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <p className="text-xs font-bold text-slate-900 dark:text-white mt-2">Master Timeline</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Peta mingguan lintas tahap
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('informasi')}
            className="text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 hover:border-amber-500/60 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
              <Megaphone className="w-4 h-4" />
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <p className="text-xs font-bold text-slate-900 dark:text-white mt-2">
              Informasi & Pengumuman
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Papan info & arahan produksi
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('kas')}
            className="text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 hover:border-amber-500/60 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
              <DollarSign className="w-4 h-4" />
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <p className="text-xs font-bold text-slate-900 dark:text-white mt-2">
              Tagihan & Buku Kas
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Iuran kas & catatan transaksi
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('booking')}
            className="text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 hover:border-amber-500/60 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
              <Wrench className="w-4 h-4" />
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <p className="text-xs font-bold text-slate-900 dark:text-white mt-2">Booking Alat</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Peminjaman inventaris panggung
            </p>
          </button>
        </div>
      </section>

      {/* Division Progress Card for Leadership / Teachers */}
      {isLeadership && divisionSummary.length > 0 && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                Ringkasan Divisi Produksi
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Jumlah anggota dan progres penyelesaian tugas per divisi produksi
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('division-schedule')}
              className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              Jadwal Divisi <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {divisionSummary.map((div) => (
              <div
                key={div.id}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                    {div.name}
                  </p>
                  <span className="font-mono tabular-nums text-[11px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
                    {div.pct}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all"
                    style={{ width: `${div.pct}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {div.memberCount} anggota · {div.taskCount} tugas relevan
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
