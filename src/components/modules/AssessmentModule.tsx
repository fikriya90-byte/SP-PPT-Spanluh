import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  Lock,
  MessageCircle,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  PRODUCTION_STAGES,
  SCORE_LABELS,
  isTeacherOrAdmin,
} from '../../core/constants';
import {
  Assessment,
  AssessorCategory,
  AttendanceRecord,
  AttendanceSession,
  DeadlineSubmission,
  DeadlineTask,
  ProductionStage,
  SchoolClass,
  StageManagerConfig,
  UserProfile,
} from '../../core/types';
import {
  checkPeerAssessmentGate,
  computeAttendanceScore,
  computePemeranDiscipline,
  computeTaskResponsibility,
  computeTotalScore,
  detectAnomalies,
  getAssessmentTargetsForUser,
  getCriteriaForRole,
  isAssessmentOpen,
} from '../../services/autoScoreService';
import {
  logAssessmentHistory,
  recordAuditLog,
  removeDocument,
  resetStageAssessments,
  upsertDocument,
} from '../../services/firestoreService';
import { exportXLSX } from '../../utils/exportXLSX';
import { buildWhatsAppUrl } from '../../utils/imageCompress';
import { useToast } from '../common/Toast';

interface Props {
  user: UserProfile;
  activeClass: SchoolClass | undefined;
  classId: string;
  stageConfig: StageManagerConfig;
  classMembers: UserProfile[];
  assessments: Assessment[];
  deadlines: DeadlineTask[];
  submissions: DeadlineSubmission[];
  attendanceSessions: AttendanceSession[];
  attendanceRecords: AttendanceRecord[];
}

export const AssessmentModule: React.FC<Props> = ({
  user,
  activeClass,
  classId,
  stageConfig,
  classMembers,
  assessments,
  deadlines,
  submissions,
  attendanceSessions,
  attendanceRecords,
}) => {
  const { showToast } = useToast();
  const isTeacher = isTeacherOrAdmin(user.role);
  const [stage, setStage] = useState<ProductionStage>(stageConfig.currentStage);

  React.useEffect(() => {
    setStage(stageConfig.currentStage);
  }, [stageConfig.currentStage]);

  const windowStatus = useMemo(
    () => isAssessmentOpen(stageConfig.stageDeadlines, stage),
    [stageConfig.stageDeadlines, stage]
  );
  const isLockedForStudent = !isTeacher && !windowStatus.isOpen;

  const targets = useMemo(
    () => getAssessmentTargetsForUser(user, classMembers, assessments, stage),
    [user, classMembers, assessments, stage]
  );

  // Active assessment drawer state
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<AssessorCategory>('REKAN');
  const [manualScores, setManualScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset stage modal state
  const [showResetBox, setShowResetBox] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const stageAssessments = useMemo(
    () => assessments.filter((a) => a.stage === stage),
    [assessments, stage]
  );

  const anomalies = useMemo(
    () => (isTeacher ? detectAnomalies(stageAssessments) : []),
    [isTeacher, stageAssessments]
  );

  const autoScoresForSelected = useMemo(() => {
    if (!selectedStudent) return { tanggung_jawab: 3, kehadiran: 3, kedisiplinan: 3 };
    const taskRes = computeTaskResponsibility(selectedStudent, deadlines, submissions, stage);
    const attRes = computeAttendanceScore(selectedStudent, attendanceSessions, attendanceRecords, stage);
    const disc = computePemeranDiscipline(taskRes.score, attRes.score);
    return {
      tanggung_jawab: taskRes.score,
      kehadiran: attRes.score,
      kedisiplinan: disc,
    };
  }, [selectedStudent, deadlines, submissions, attendanceSessions, attendanceRecords, stage]);

  const openAssessmentForm = (student: UserProfile, category: AssessorCategory) => {
    const existing = assessments.find(
      (a) => a.assessorId === user.uid && a.studentId === student.uid && a.stage === stage
    );
    const criteria = getCriteriaForRole(student.role);
    const initial: Record<string, number> = {};
    for (const c of criteria) {
      if (c.source === 'MANUAL') {
        initial[c.key] = existing?.scores?.[c.key] ?? 3;
      }
    }
    setSelectedStudent(student);
    setSelectedCategory(category);
    setManualScores(initial);
    setComment(existing?.comment || '');
  };

  const previewTotal = useMemo(() => {
    if (!selectedStudent) return 0;
    return computeTotalScore(selectedStudent.role, manualScores, autoScoresForSelected);
  }, [selectedStudent, manualScores, autoScoresForSelected]);

  const handleSubmitAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    if (isLockedForStudent) {
      showToast('Jendela penilaian sedang dikunci oleh guru', 'warning');
      return;
    }

    const hasLow = Object.values(manualScores).some((v) => v <= 2);
    if (hasLow && comment.trim().length < 5) {
      showToast('Komentar wajib diisi (min 5 karakter) jika ada nilai <= 2', 'warning');
      return;
    }

    setBusy(true);
    try {
      const id = `${user.uid}_${selectedStudent.uid}_${stage}`;
      const existing = assessments.find((a) => a.id === id);
      const now = new Date().toISOString();
      const payload: Assessment = {
        id,
        classId,
        productionId: `prod_${classId}`,
        studentId: selectedStudent.uid,
        studentName: selectedStudent.name,
        studentRole: selectedStudent.role,
        studentDivision: selectedStudent.divisionName,
        assessorId: user.uid,
        assessorName: user.name,
        assessorRole: user.role,
        assessorCategory: selectedCategory,
        stage,
        scores: manualScores,
        autoScores: autoScoresForSelected,
        totalScore: previewTotal,
        comment: comment.trim(),
        isFinal: true,
        version: (existing?.version || 0) + 1,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      await upsertDocument('assessments', id, payload as unknown as Record<string, unknown>);
      if (existing) {
        await logAssessmentHistory({
          classId,
          assessmentId: id,
          studentId: selectedStudent.uid,
          studentName: selectedStudent.name,
          editedBy: user.uid,
          editedByName: user.name,
          action: 'UPDATE',
          previousScore: existing.totalScore,
          newScore: previewTotal,
          reason: 'Pembaruan nilai 360°',
        });
      }
      await recordAuditLog({
        user,
        action: 'ASSESS',
        targetType: 'assessment',
        targetId: id,
        details: `Menilai ${selectedStudent.name} (${selectedCategory}, ${stage}) = ${previewTotal}.`,
      });
      showToast(`Penilaian untuk ${selectedStudent.name} tersimpan (${previewTotal})`, 'success');
      setSelectedStudent(null);
    } catch (err) {
      showToast('Gagal menyimpan penilaian', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAssessment = async (a: Assessment) => {
    setBusy(true);
    try {
      await logAssessmentHistory({
        classId,
        assessmentId: a.id,
        studentId: a.studentId,
        studentName: a.studentName,
        editedBy: user.uid,
        editedByName: user.name,
        action: 'DELETE',
        previousScore: a.totalScore,
        reason: 'Dihapus oleh Guru Pengampu',
      });
      await removeDocument('assessments', a.id);
      setConfirmDeleteId(null);
      showToast(`Penilaian dari ${a.assessorName} untuk ${a.studentName} dihapus`, 'info');
    } catch (err) {
      showToast('Gagal menghapus penilaian', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleResetStage = async () => {
    const classNameTarget = activeClass?.name || classId;
    if (resetConfirmText.trim() !== classNameTarget) {
      showToast(`Ketik persis "${classNameTarget}" untuk konfirmasi reset`, 'warning');
      return;
    }
    setBusy(true);
    try {
      const count = await resetStageAssessments({
        classId,
        stage,
        assessments,
        actor: user,
      });
      setShowResetBox(false);
      setResetConfirmText('');
      showToast(`${count} data penilaian tahap ${stage} telah direset`, 'info');
    } catch (err) {
      showToast('Gagal mereset nilai tahap', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleExportRecap = () => {
    const students = classMembers.filter((m) => !isTeacherOrAdmin(m.role));
    exportXLSX(`penilaian_360_${classId}_${stage}`, [
      {
        name: 'Rekap Penilaian',
        headers: ['Nama Siswa', 'Peran', 'Divisi', 'Guru', 'Atasan', 'Rekan', 'Bawahan', 'Rata-rata'],
        rows: students.map((stu) => {
          const mine = stageAssessments.filter((a) => a.studentId === stu.uid);
          const avg = (cat: AssessorCategory) => {
            const list = mine.filter((a) => a.assessorCategory === cat);
            return list.length ? Math.round((list.reduce((s, x) => s + x.totalScore, 0) / list.length) * 10) / 10 : '-';
          };
          const allAvg = mine.length
            ? Math.round((mine.reduce((s, x) => s + x.totalScore, 0) / mine.length) * 10) / 10
            : 0;
          return [stu.name, stu.role, stu.divisionName, avg('GURU'), avg('ATASAN'), avg('REKAN'), avg('BAWAHAN'), allAvg];
        }),
      },
      {
        name: 'Komentar Penilai',
        headers: ['Siswa', 'Penilai', 'Kategori', 'Nilai', 'Komentar', 'Tanggal'],
        rows: stageAssessments.map((a) => [
          a.studentName,
          a.assessorName,
          a.assessorCategory,
          a.totalScore,
          a.comment || '-',
          a.createdAt.slice(0, 10),
        ]),
      },
    ]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-amber-500" />
            Penilaian 360° Produksi Teater
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Evaluasi multi-arah (Guru, Atasan, Rekan, Anggota) dengan komponen otomatis Tugas & Presensi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as ProductionStage)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold"
          >
            {PRODUCTION_STAGES.map((st) => (
              <option key={st} value={st}>
                Tahap: {st}
              </option>
            ))}
          </select>
          {isTeacher && (
            <>
              <button
                type="button"
                onClick={handleExportRecap}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Ekspor XLSX
              </button>
              <button
                type="button"
                onClick={() => setShowResetBox(!showResetBox)}
                className="px-3.5 py-2 rounded-xl border border-rose-500/40 text-rose-600 dark:text-rose-400 text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Tahap
              </button>
            </>
          )}
        </div>
      </div>

      {/* Lock / Bypass Banner */}
      {isLockedForStudent ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-center gap-3 text-xs text-amber-900 dark:text-amber-200">
          <Lock className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <p className="font-bold">Penilaian Terkunci</p>
            <p>{windowStatus.reason}</p>
          </div>
        </div>
      ) : isTeacher && !windowStatus.isOpen ? (
        <div className="rounded-2xl border border-blue-500/40 bg-blue-500/10 p-3 text-xs text-blue-800 dark:text-blue-200">
          Info Guru: Jendela penilaian siswa saat ini terkunci ({windowStatus.reason}), namun Guru Pengampu tetap dapat menilai.
        </div>
      ) : null}

      {isTeacher && showResetBox && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 space-y-3">
          <p className="text-xs font-bold text-rose-700 dark:text-rose-300">
            Reset Seluruh Nilai Tahap {stage}? Ketik nama kelas &quot;{activeClass?.name || classId}&quot; untuk konfirmasi:
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder={activeClass?.name || classId}
              className="flex-1 px-3 py-2 rounded-xl border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 text-xs"
            />
            <button
              type="button"
              onClick={handleResetStage}
              className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold"
            >
              Hapus Semua Nilai {stage}
            </button>
          </div>
        </div>
      )}

      {/* Active Form Drawer */}
      {selectedStudent && (
        <form
          onSubmit={handleSubmitAssessment}
          className="rounded-2xl border border-amber-500/50 bg-white dark:bg-slate-900 p-6 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                Kategori Penilai: {selectedCategory} · Tahap {stage}
              </p>
              <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                Menilai {selectedStudent.name} ({selectedStudent.role})
              </h3>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Pratinjau Total Skor</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
                {previewTotal}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {getCriteriaForRole(selectedStudent.role).map((c) => {
              const isAuto = c.source !== 'MANUAL';
              const autoVal =
                c.source === 'AUTO_TASK'
                  ? autoScoresForSelected.tanggung_jawab
                  : c.source === 'AUTO_ATTENDANCE'
                    ? autoScoresForSelected.kehadiran
                    : autoScoresForSelected.kedisiplinan;
              const currentVal = isAuto ? autoVal : manualScores[c.key] ?? 3;

              return (
                <div
                  key={c.key}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {c.label}{' '}
                      <span className="font-mono text-xs text-slate-500">({c.weight}%)</span>
                      {isAuto && (
                        <span className="ml-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
                          Otomatis Sistem
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{c.description}</p>
                  </div>

                  {isAuto ? (
                    <div className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono tabular-nums text-xs font-bold text-slate-900 dark:text-slate-100 shrink-0">
                      Skor {currentVal} ({SCORE_LABELS[currentVal]})
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {[1, 2, 3, 4].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setManualScores((prev) => ({ ...prev, [c.key]: val }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono transition-colors ${
                            currentVal === val
                              ? 'bg-amber-500 text-slate-950'
                              : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {val} · {SCORE_LABELS[val]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Komentar & Catatan Evaluasi {Object.values(manualScores).some((v) => v <= 2) ? '(Wajib karena ada nilai <= 2)' : '(Opsional)'}
            </label>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tuliskan apresiasi atau saran perbaikan konstruktif..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setSelectedStudent(null)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold"
            >
              {busy ? 'Menyimpan...' : 'Simpan Nilai 360°'}
            </button>
          </div>
        </form>
      )}

      {/* Target Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-300">
              <th className="py-3 px-4 font-semibold">Nama Target</th>
              <th className="py-3 px-4 font-semibold">Peran & Divisi</th>
              <th className="py-3 px-3 font-semibold">Hubungan</th>
              <th className="py-3 px-3 font-semibold text-center font-mono">Peer (X/Y)</th>
              <th className="py-3 px-3 font-semibold text-right font-mono">Guru</th>
              <th className="py-3 px-3 font-semibold text-right font-mono">Koord/Atasan</th>
              <th className="py-3 px-3 font-semibold text-right font-mono">Rekan</th>
              <th className="py-3 px-3 font-semibold text-right font-mono">Anggota</th>
              <th className="py-3 px-4 font-semibold text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {targets.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500">
                  Tidak ada target penilaian untuk peran Anda di kelas ini.
                </td>
              </tr>
            ) : (
              targets.map(({ student, category, alreadyAssessed }) => {
                const stuAssessments = stageAssessments.filter((a) => a.studentId === student.uid);
                const peerStatus = checkPeerAssessmentGate(student, classMembers, assessments, stage);
                const countCat = (c: AssessorCategory) =>
                  stuAssessments.filter((a) => a.assessorCategory === c).length;
                const hasAnomaly = anomalies.some((an) => an.assessment.studentId === student.uid);

                return (
                  <tr key={student.uid} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-1.5">
                        {student.name}
                        {hasAnomaly && (
                          <span title="Terdeteksi anomali" className="inline-flex">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                      {student.role} · {student.divisionName}
                    </td>
                    <td className="py-3 px-3 font-semibold text-amber-600 dark:text-amber-400">
                      {category}
                    </td>
                    <td className="py-3 px-3 text-center font-mono tabular-nums">
                      {peerStatus.filled}/{peerStatus.total}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">{countCat('GURU')}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">{countCat('ATASAN')}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">{countCat('REKAN')}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">{countCat('BAWAHAN')}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isLockedForStudent}
                          onClick={() => openAssessmentForm(student, category)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 ${
                            isLockedForStudent
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                              : alreadyAssessed
                                ? 'border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'
                                : 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                          }`}
                        >
                          {isLockedForStudent ? (
                            <>
                              <Lock className="w-3 h-3" /> Terkunci
                            </>
                          ) : alreadyAssessed ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" /> Edit Nilai
                            </>
                          ) : (
                            'Nilai Sekarang'
                          )}
                        </button>
                        {isTeacher && !peerStatus.isComplete && student.phone && (
                          <a
                            href={buildWhatsAppUrl(
                              student.phone,
                              `Halo ${student.name}, harap segera selesaikan penilaian 360° tahap ${stage} di aplikasi SP-PPT.`
                            )}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-500/10"
                            title="Kirim pengingat WA"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Teacher quick list of individual assessments in stage */}
      {isTeacher && stageAssessments.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
            Daftar Penilaian Masuk Tahap {stage} ({stageAssessments.length})
          </h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
            {stageAssessments.map((a) => (
              <div key={a.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">
                    {a.assessorName} ({a.assessorCategory}) → {a.studentName}
                  </p>
                  <p className="text-slate-500 truncate">{a.comment || 'Tanpa komentar'}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                    {a.totalScore}
                  </span>
                  {confirmDeleteId === a.id ? (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDeleteAssessment(a)}
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
                      onClick={() => setConfirmDeleteId(a.id)}
                      className="p-1 text-slate-400 hover:text-rose-500"
                      title="Hapus penilaian"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
