import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  BarChart3,
  CheckCircle2,
  Download,
  MessageCircle,
  Search,
  Trash2,
} from 'lucide-react';
import { PRODUCTION_STAGES, isTeacherOrAdmin } from '../../core/constants';
import {
  Assessment,
  AssessmentHistory,
  AssessorWeightsConfig,
  ProductionStage,
  UserProfile,
} from '../../core/types';
import {
  checkPeerAssessmentGate,
  computeFinalStudentReport,
  detectAnomalies,
} from '../../services/autoScoreService';
import {
  logAssessmentHistory,
  recordAuditLog,
  removeDocument,
  updateDocumentFields,
} from '../../services/firestoreService';
import { exportXLSX } from '../../utils/exportXLSX';
import { buildWhatsAppUrl, formatRelativeTime } from '../../utils/imageCompress';
import { useToast } from '../common/Toast';

export const ModerationModule: React.FC<{
  user: UserProfile;
  classId: string;
  assessments: Assessment[];
  history: AssessmentHistory[];
  classMembers: UserProfile[];
}> = ({ user, classId, assessments, history, classMembers }) => {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'anomali' | 'semua' | 'riwayat'>('anomali');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const anomalies = useMemo(() => detectAnomalies(assessments), [assessments]);

  if (!isTeacherOrAdmin(user.role)) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-6 text-sm text-slate-500">
        Hanya Guru Pengampu dan Administrator yang dapat mengakses Moderasi Penilaian.
      </div>
    );
  }

  const handleValidate = async (a: Assessment) => {
    try {
      const now = new Date().toISOString();
      await updateDocumentFields('assessments', a.id, {
        validatedBy: user.name,
        validatedAt: now,
      });
      await logAssessmentHistory({
        classId,
        assessmentId: a.id,
        studentId: a.studentId,
        studentName: a.studentName,
        editedBy: user.uid,
        editedByName: user.name,
        action: 'VALIDATE',
        newScore: a.totalScore,
        reason: 'Divalidasi guru setelah tinjauan anomali',
      });
      await recordAuditLog({
        user,
        action: 'UPDATE',
        targetType: 'assessment',
        targetId: a.id,
        details: `Memvalidasi penilaian anomali ${a.assessorName} -> ${a.studentName}.`,
      });
      showToast('Penilaian ditandai valid', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memvalidasi penilaian', 'error');
    }
  };

  const handleDelete = async (a: Assessment) => {
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
        reason: 'Dihapus melalui Moderasi Anomali',
      });
      await removeDocument('assessments', a.id);
      setConfirmDeleteId(null);
      showToast('Penilaian dihapus dan dicatat ke riwayat', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus penilaian', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <AlertOctagon className="w-5 h-5 text-amber-500" />
          Moderasi & Audit Anomali Nilai
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Deteksi otomatis nilai ekstrem, pola seragam, outlier ≥ 25 poin, dan gap skor manual vs sistem.
        </p>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-fit">
        <button
          type="button"
          onClick={() => setTab('anomali')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
            tab === 'anomali' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white' : 'text-slate-500'
          }`}
        >
          Anomali ({anomalies.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('semua')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
            tab === 'semua' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white' : 'text-slate-500'
          }`}
        >
          Semua ({assessments.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('riwayat')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
            tab === 'riwayat' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white' : 'text-slate-500'
          }`}
        >
          Riwayat Revisi ({history.length})
        </button>
      </div>

      {tab === 'anomali' && (
        <div className="space-y-3">
          {anomalies.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-xs text-slate-500">
              Tidak ada penilaian anomali yang terdeteksi.
            </div>
          ) : (
            anomalies.map(({ assessment: a, severity, reasons }) => {
              const assessorMember = classMembers.find((m) => m.uid === a.assessorId);
              return (
                <div
                  key={a.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={`font-bold ${
                            severity === 'HIGH'
                              ? 'text-rose-600 dark:text-rose-400'
                              : severity === 'MEDIUM'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-blue-600 dark:text-blue-400'
                          }`}
                        >
                          {severity}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="font-mono">{a.stage}</span>
                        <span className="text-slate-400">·</span>
                        <span className="font-mono tabular-nums font-bold">Skor {a.totalScore}</span>
                        {a.validatedAt && (
                          <>
                            <span className="text-slate-400">·</span>
                            <span className="text-emerald-600 font-semibold">Tervalidasi</span>
                          </>
                        )}
                      </div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                        Penilai: {a.assessorName} ({a.assessorCategory}) → Target: {a.studentName}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleValidate(a)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Validasi
                      </button>
                      {assessorMember?.phone && (
                        <a
                          href={buildWhatsAppUrl(
                            assessorMember.phone,
                            `Halo ${a.assessorName}, mohon klarifikasi penilaian Anda untuk ${a.studentName} pada tahap ${a.stage} (${reasons[0]}).`
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-emerald-500" /> WA Klarifikasi
                        </a>
                      )}
                      {confirmDeleteId === a.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleDelete(a)}
                            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold"
                          >
                            Yakin Hapus
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(a.id)}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Hapus
                        </button>
                      )}
                    </div>
                  </div>
                  <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-disc list-inside">
                    {reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                  {a.comment && (
                    <p className="text-xs text-slate-500 italic">Komentar penilai: &quot;{a.comment}&quot;</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'semua' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                <th className="py-3 px-4 font-semibold">Penilai</th>
                <th className="py-3 px-4 font-semibold">Siswa</th>
                <th className="py-3 px-3 font-semibold">Tahap</th>
                <th className="py-3 px-3 font-semibold">Kategori</th>
                <th className="py-3 px-3 font-semibold text-right font-mono">Nilai</th>
                <th className="py-3 px-4 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {assessments.map((a) => (
                <tr key={a.id}>
                  <td className="py-2.5 px-4 font-semibold">{a.assessorName}</td>
                  <td className="py-2.5 px-4">{a.studentName}</td>
                  <td className="py-2.5 px-3 font-mono">{a.stage}</td>
                  <td className="py-2.5 px-3">{a.assessorCategory}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold">{a.totalScore}</td>
                  <td className="py-2.5 px-4 text-right">
                    {confirmDeleteId === a.id ? (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleDelete(a)}
                          className="px-2 py-1 rounded bg-rose-600 text-white font-bold text-[11px]"
                        >
                          Yakin
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-[11px]"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(a.id)}
                        className="text-rose-500 hover:underline font-semibold"
                      >
                        Hapus
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'riwayat' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {history.length === 0 ? (
            <p className="p-8 text-center text-xs text-slate-500">Belum ada riwayat revisi nilai.</p>
          ) : (
            [...history]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((h) => (
                <div key={h.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">
                      {h.action} · {h.studentName}
                    </p>
                    <p className="text-slate-500">
                      Oleh {h.editedByName} · {h.reason || '-'}
                    </p>
                  </div>
                  <span className="font-mono tabular-nums text-slate-400">
                    {formatRelativeTime(h.createdAt)}
                  </span>
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
};

export const GradeRecapModule: React.FC<{
  user: UserProfile;
  classId: string;
  weightsConfig: AssessorWeightsConfig;
  classMembers: UserProfile[];
  assessments: Assessment[];
}> = ({ user, classId, weightsConfig, classMembers, assessments }) => {
  const [stageFilter, setStageFilter] = useState<'ALL' | ProductionStage>('ALL');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'score'>('score');
  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);

  const students = useMemo(
    () => classMembers.filter((m) => !isTeacherOrAdmin(m.role) && m.isActive !== false),
    [classMembers]
  );

  const anomalies = useMemo(() => detectAnomalies(assessments), [assessments]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students
      .filter((s) => (!q ? true : s.name.toLowerCase().includes(q) || s.role.toLowerCase().includes(q)))
      .map((s) => {
        const pool = stageFilter === 'ALL' ? assessments : assessments.filter((a) => a.stage === stageFilter);
        const report = computeFinalStudentReport(
          s,
          pool,
          weightsConfig.stageWeights,
          weightsConfig.roleWeights?.[s.role],
          false
        );
        const peer = checkPeerAssessmentGate(
          s,
          classMembers,
          assessments,
          stageFilter === 'ALL' ? 'PERSIAPAN' : stageFilter
        );
        const stageScore =
          stageFilter === 'ALL'
            ? report.finalScore
            : report.stageSummaries.find((st) => st.stage === stageFilter)?.score ?? 0;

        return {
          student: s,
          report,
          score: stageScore,
          peer,
          hasAnomaly: anomalies.some((an) => an.assessment.studentId === s.uid),
        };
      })
      .sort((a, b) => (sortBy === 'score' ? b.score - a.score : a.student.name.localeCompare(b.student.name)));
  }, [students, assessments, stageFilter, search, sortBy, weightsConfig, classMembers, anomalies]);

  if (!isTeacherOrAdmin(user.role)) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-6 text-sm text-slate-500">
        Hanya Guru Pengampu dan Administrator yang dapat melihat Rekap Nilai Kelas.
      </div>
    );
  }

  const handleExport = () => {
    exportXLSX(`rekap_nilai_${classId}_${stageFilter}`, [
      {
        name: 'Rekap Nilai',
        headers: ['Nama', 'Peran', 'Divisi', 'Peer (X/Y)', 'Guru', 'Atasan', 'Rekan', 'Bawahan', 'Nilai Akhir', 'Predikat'],
        rows: rows.map((r) => [
          r.student.name,
          r.student.role,
          r.student.divisionName,
          `${r.peer.filled}/${r.peer.total}`,
          r.report.categoryTotals.GURU.avg ?? '-',
          r.report.categoryTotals.ATASAN.avg ?? '-',
          r.report.categoryTotals.REKAN.avg ?? '-',
          r.report.categoryTotals.BAWAHAN.avg ?? '-',
          r.score,
          r.report.predicate.grade,
        ]),
      },
      {
        name: 'Komentar',
        headers: ['Siswa', 'Penilai', 'Kategori', 'Tahap', 'Nilai', 'Komentar'],
        rows: assessments
          .filter((a) => (stageFilter === 'ALL' ? true : a.stage === stageFilter))
          .map((a) => [a.studentName, a.assessorName, a.assessorCategory, a.stage, a.totalScore, a.comment || '-']),
      },
    ]);
  };

  const detailRow = rows.find((r) => r.student.uid === detailStudentId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-amber-500" />
            Rekap Nilai Akhir Kelas
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Klik nama siswa untuk meninjau rincian penilaian lintas kategori.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs inline-flex items-center gap-2 self-start"
        >
          <Download className="w-4 h-4" />
          Ekspor Rekap XLSX
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari siswa atau peran..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
          />
        </div>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as 'ALL' | ProductionStage)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold"
        >
          <option value="ALL">Kumulatif 4 Tahap</option>
          {PRODUCTION_STAGES.map((st) => (
            <option key={st} value={st}>
              Tahap {st}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'score')}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold"
        >
          <option value="score">Urutkan: Nilai Tertinggi</option>
          <option value="name">Urutkan: Nama A–Z</option>
        </select>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
              <th className="py-3 px-4 font-semibold">Nama Siswa</th>
              <th className="py-3 px-4 font-semibold">Peran</th>
              <th className="py-3 px-3 font-semibold text-center font-mono">Peer</th>
              <th className="py-3 px-3 font-semibold text-right font-mono">Guru</th>
              <th className="py-3 px-3 font-semibold text-right font-mono">Atasan</th>
              <th className="py-3 px-3 font-semibold text-right font-mono">Rekan</th>
              <th className="py-3 px-3 font-semibold text-right font-mono">Anggota</th>
              <th className="py-3 px-4 font-semibold text-right font-mono">Nilai</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => (
              <tr
                key={r.student.uid}
                onClick={() => setDetailStudentId(detailStudentId === r.student.uid ? null : r.student.uid)}
                className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
              >
                <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                  {r.student.name}
                  {r.hasAnomaly && <span className="ml-2 text-rose-500 font-bold">· Anomali</span>}
                </td>
                <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{r.student.role}</td>
                <td className="py-3 px-3 text-center font-mono tabular-nums">
                  {r.peer.filled}/{r.peer.total}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums">
                  {r.report.categoryTotals.GURU.avg ?? '-'}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums">
                  {r.report.categoryTotals.ATASAN.avg ?? '-'}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums">
                  {r.report.categoryTotals.REKAN.avg ?? '-'}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums">
                  {r.report.categoryTotals.BAWAHAN.avg ?? '-'}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400">
                  {r.score} ({r.report.predicate.grade})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detailRow && (
        <div className="rounded-2xl border border-amber-500/40 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
              Rincian Nilai: {detailRow.student.name} ({detailRow.student.role})
            </h3>
            <button
              type="button"
              onClick={() => setDetailStudentId(null)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Tutup
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {detailRow.report.criteriaBreakdown.map((c) => (
              <div key={c.key} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-xs">
                <p className="font-bold text-slate-900 dark:text-white">{c.label}</p>
                <p className="font-mono tabular-nums text-slate-500 mt-0.5">
                  Skor rata-rata: {c.avgRaw ?? '-'} · Konversi: {c.converted ?? '-'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
