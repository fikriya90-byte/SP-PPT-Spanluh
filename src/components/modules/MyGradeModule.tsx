import React, { useMemo } from 'react';
import { Award, Download, Lock, MessageCircle, Printer } from 'lucide-react';
import { isTeacherOrAdmin } from '../../core/constants';
import {
  Assessment,
  AssessorCategory,
  AssessorWeightsConfig,
  ModuleId,
  SchoolClass,
  StageManagerConfig,
  UserProfile,
} from '../../core/types';
import {
  checkPeerAssessmentGate,
  computeFinalStudentReport,
  isAssessmentOpen,
} from '../../services/autoScoreService';
import { exportXLSX } from '../../utils/exportXLSX';
import { buildWhatsAppUrl } from '../../utils/imageCompress';
import { CleanBarChart, StageRadarChart } from '../common/Charts';

interface Props {
  user: UserProfile;
  activeClass: SchoolClass | undefined;
  stageConfig: StageManagerConfig;
  weightsConfig: AssessorWeightsConfig;
  classMembers: UserProfile[];
  assessments: Assessment[];
  onNavigate: (moduleId: ModuleId) => void;
}

export const MyGradeModule: React.FC<Props> = ({
  user,
  activeClass,
  stageConfig,
  weightsConfig,
  classMembers,
  assessments,
  onNavigate,
}) => {
  const isTeacher = isTeacherOrAdmin(user.role);
  const currentStage = stageConfig.currentStage;

  const peerGate = useMemo(
    () => checkPeerAssessmentGate(user, classMembers, assessments, currentStage),
    [user, classMembers, assessments, currentStage]
  );

  const windowGate = useMemo(
    () => isAssessmentOpen(stageConfig.stageDeadlines, currentStage),
    [stageConfig.stageDeadlines, currentStage]
  );

  const report = useMemo(() => {
    const roleW = weightsConfig.roleWeights?.[user.role];
    return computeFinalStudentReport(
      user,
      assessments,
      weightsConfig.stageWeights,
      roleW,
      !isTeacher
    );
  }, [user, assessments, weightsConfig, isTeacher]);

  const teacherContact = classMembers.find((m) => isTeacherOrAdmin(m.role) && m.phone);

  // Gate 1: Peer Assessment incomplete
  if (!isTeacher && !peerGate.isComplete) {
    return (
      <div className="max-w-2xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 space-y-5">
        <div className="flex items-center gap-3 text-amber-500">
          <Lock className="w-6 h-6" />
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Rapor Terkunci — Selesaikan Penilaian Rekan
          </h2>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Untuk melihat rapor nilai Anda pada tahap <strong>{currentStage}</strong>, Anda harus menilai seluruh rekan dan atasan sesuai matriks 360°.
        </p>
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono tabular-nums">
            <span>Progres Penilaian</span>
            <span className="font-bold">
              {peerGate.filled}/{peerGate.total} selesai
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full"
              style={{ width: `${Math.round((peerGate.filled / Math.max(1, peerGate.total)) * 100)}%` }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-1.5">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Target yang belum dinilai:
          </p>
          {peerGate.pendingTargets.map((t) => (
            <p key={t.student.uid} className="text-xs text-slate-600 dark:text-slate-400">
              · {t.student.name} ({t.student.role} · sebagai {t.category})
            </p>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onNavigate('nilai')}
          className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs"
        >
          Isi Penilaian Rekan Sekarang
        </button>
      </div>
    );
  }

  // Gate 2: Assessment window closed/not-started/disabled
  if (!isTeacher && !windowGate.isOpen) {
    return (
      <div className="max-w-2xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 space-y-4">
        <div className="flex items-center gap-3 text-amber-500">
          <Lock className="w-6 h-6" />
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Rapor Belum Dibuka untuk Tahap {currentStage}
          </h2>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{windowGate.reason}</p>
      </div>
    );
  }

  const handleExportReport = () => {
    exportXLSX(`rapor_360_${user.name.replace(/\s+/g, '_')}`, [
      {
        name: 'Ringkasan Tahap',
        headers: ['Tahap', 'Bobot (%)', 'Nilai Tahap', 'Guru', 'Atasan', 'Rekan', 'Bawahan'],
        rows: report.stageSummaries.map((s) => [
          s.stage,
          weightsConfig.stageWeights[s.stage] ?? 0,
          s.score ?? '-',
          s.categoryAverages.GURU?.avg ?? '-',
          s.categoryAverages.ATASAN?.avg ?? '-',
          s.categoryAverages.REKAN?.avg ?? '-',
          s.categoryAverages.BAWAHAN?.avg ?? '-',
        ]),
      },
      {
        name: 'Nilai Akhir',
        headers: ['Nama', 'Peran', 'Divisi', 'Kelas', 'Nilai Akhir', 'Predikat', 'Keterangan'],
        rows: [
          [
            user.name,
            user.role,
            user.divisionName,
            activeClass?.name || user.classId,
            report.finalScore,
            report.predicate.grade,
            report.predicate.label,
          ],
        ],
      },
      {
        name: 'Rincian Kriteria',
        headers: ['Kriteria', 'Bobot (%)', 'Sumber', 'Rata-rata (1-4)', 'Konversi (0-100)'],
        rows: report.criteriaBreakdown.map((c) => [
          c.label,
          c.weight,
          c.source === 'MANUAL' ? 'Manual' : 'Otomatis Sistem',
          c.avgRaw ?? '-',
          c.converted ?? '-',
        ]),
      },
      {
        name: 'Komentar',
        headers: ['Tanggal', 'Tahap', 'Kategori', 'Penilai', 'Nilai', 'Komentar'],
        rows: report.comments.map((cm) => [
          cm.createdAt.slice(0, 10),
          cm.stage,
          cm.category,
          cm.authorDisplay,
          cm.score,
          cm.comment,
        ]),
      },
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {activeClass?.name || user.classId} · {user.role} · {user.divisionName}
          </p>
          <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
            Rapor Nilai 360° — {user.name}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          {teacherContact && (
            <a
              href={buildWhatsAppUrl(
                teacherContact.phone,
                `Halo ${teacherContact.name}, saya ${user.name} (${user.role}) ingin berkonsultasi mengenai hasil Rapor 360° saya.`
              )}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Tanya Guru
            </a>
          )}
          <button
            type="button"
            onClick={handleExportReport}
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Unduh XLSX
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            Cetak PDF
          </button>
        </div>
      </div>

      {/* Final Score + Radar + Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-500" />
              Nilai Akhir Kumulatif
            </p>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-5xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                {report.finalScore}
              </span>
              <span
                className={`text-xl font-bold font-mono ${
                  report.predicate.tone === 'emerald'
                    ? 'text-emerald-500'
                    : report.predicate.tone === 'blue'
                      ? 'text-blue-500'
                      : report.predicate.tone === 'amber'
                        ? 'text-amber-500'
                        : 'text-rose-500'
                }`}
              >
                Predikat {report.predicate.grade}
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-1">
              {report.predicate.label}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2.5 pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
            {(['GURU', 'ATASAN', 'REKAN', 'BAWAHAN'] as AssessorCategory[]).map((cat) => (
              <div key={cat} className="rounded-xl bg-slate-50 dark:bg-slate-950 p-2.5">
                <p className="text-[11px] text-slate-500">{cat}</p>
                <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {report.categoryTotals[cat].avg ?? '-'} ({report.categoryTotals[cat].count}x)
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col items-center justify-center">
          <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white mb-2 self-start">
            Radar 4 Tahap Produksi
          </h3>
          <StageRadarChart
            data={report.stageSummaries.map((s) => ({
              label: s.stage,
              value: s.score ?? 0,
            }))}
          />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white mb-4">
            Perbandingan Nilai Antar Tahap
          </h3>
          <CleanBarChart
            data={report.stageSummaries.map((s) => ({
              label: `${s.stage} (${weightsConfig.stageWeights[s.stage] ?? 0}%)`,
              value: s.score ?? 0,
            }))}
          />
        </div>
      </div>

      {/* Criteria Breakdown */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <h3 className="font-display font-bold text-base text-slate-900 dark:text-white mb-4">
          Rincian per Kriteria Penilaian
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {report.criteriaBreakdown.map((c) => (
            <div
              key={c.key}
              className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-1"
            >
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{c.source === 'MANUAL' ? 'Penilaian Manual' : 'Otomatis Sistem'}</span>
                <span className="font-mono tabular-nums font-bold">Bobot {c.weight}%</span>
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{c.label}</p>
              <p className="text-xs font-mono tabular-nums text-amber-600 dark:text-amber-400 font-semibold">
                Rata-rata: {c.avgRaw ?? '-'} / 4 · Konversi: {c.converted ?? '-'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Comments */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <h3 className="font-display font-bold text-base text-slate-900 dark:text-white mb-3">
          Catatan & Komentar Penilai ({report.comments.length})
        </h3>
        {report.comments.length === 0 ? (
          <p className="text-xs text-slate-500">Belum ada komentar penilai yang masuk.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {report.comments.map((cm) => (
              <div key={cm.id} className="py-3 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {cm.authorDisplay} · {cm.stage}
                  </span>
                  <span className="font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400">
                    Skor {cm.score}
                  </span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300">{cm.comment}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
