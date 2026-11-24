import React, { useState } from 'react';
import { ArrowRightCircle, CalendarDays, Layers, Save } from 'lucide-react';
import { PRODUCTION_STAGES, STAGE_LABELS, isTeacherOrAdmin } from '../../core/constants';
import {
  DeadlineTask,
  ProductionStage,
  StageManagerConfig,
  UserProfile,
} from '../../core/types';
import { getStageStatus, isAssessmentOpen } from '../../services/autoScoreService';
import { carryOverDeadlines, saveStageManager } from '../../services/firestoreService';
import { useToast } from '../common/Toast';

export const StageManagerModule: React.FC<{
  user: UserProfile;
  classId: string;
  stageConfig: StageManagerConfig;
  deadlines: DeadlineTask[];
}> = ({ user, classId, stageConfig, deadlines }) => {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<StageManagerConfig>(stageConfig);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    setDraft(stageConfig);
  }, [stageConfig]);

  if (!isTeacherOrAdmin(user.role)) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-sm text-slate-500">
        Hanya Guru Pengampu dan Administrator yang dapat mengelola tahapan produksi.
      </div>
    );
  }

  const currentIdx = PRODUCTION_STAGES.indexOf(draft.currentStage);
  const prevStage = currentIdx > 0 ? PRODUCTION_STAGES[currentIdx - 1] : null;
  const carryCount = prevStage
    ? deadlines.filter((d) => d.stage === prevStage && d.status === 'PENDING').length
    : 0;

  const handleSave = async () => {
    setBusy(true);
    try {
      await saveStageManager(classId, {
        ...draft,
        updatedBy: user.uid,
        updatedByName: user.name,
        updatedAt: new Date().toISOString(),
      });
      showToast('Konfigurasi tahapan produksi disimpan', 'success');
    } catch (err) {
      showToast('Gagal menyimpan konfigurasi tahapan', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleCarryOver = async () => {
    if (!prevStage) return;
    setBusy(true);
    try {
      const moved = await carryOverDeadlines({
        deadlines,
        fromStage: prevStage,
        toStage: draft.currentStage,
        actor: user,
      });
      showToast(`${moved} tugas dipindahkan ke tahap ${draft.currentStage}`, 'success');
    } catch (err) {
      showToast('Gagal melakukan carry-over tugas', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-500" />
            Stage Manager (Kelola 4 Tahapan)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Pilih tahap aktif produksi kelas dan kelola rentang jadwal setiap fase.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={handleSave}
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs inline-flex items-center gap-2 self-start"
        >
          <Save className="w-4 h-4" />
          Simpan Konfigurasi
        </button>
      </div>

      {/* Select Active Stage */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {PRODUCTION_STAGES.map((st) => {
          const active = draft.currentStage === st;
          return (
            <button
              key={st}
              type="button"
              onClick={() => setDraft({ ...draft, currentStage: st })}
              className={`p-4 rounded-2xl border text-left transition-colors ${
                active
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-400'
              }`}
            >
              <p className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                {st} ({STAGE_LABELS[st].weight}%)
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                {active ? 'Tahap Aktif Saat Ini' : 'Jadikan Tahap Aktif'}
              </p>
            </button>
          );
        })}
      </div>

      {prevStage && carryCount > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-amber-900 dark:text-amber-200">
            Terdeteksi <strong className="font-mono tabular-nums">{carryCount}</strong> tugas dari tahap{' '}
            <strong>{prevStage}</strong> yang masih berstatus PENDING.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={handleCarryOver}
            className="px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap self-start"
          >
            <ArrowRightCircle className="w-4 h-4" />
            Carry-Over ke {draft.currentStage}
          </button>
        </div>
      )}

      <div className="space-y-4">
        {PRODUCTION_STAGES.map((st) => {
          const cfg = draft.stageDeadlines[st];
          const computed = getStageStatus(cfg);
          return (
            <div
              key={st}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    {st} — {STAGE_LABELS[st].label}
                  </h3>
                  <p className="text-xs text-slate-500">Status terhitung: {computed.label}</p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfg.enabled}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        stageDeadlines: {
                          ...draft.stageDeadlines,
                          [st]: { ...cfg, enabled: e.target.checked },
                        },
                      })
                    }
                    className="rounded border-slate-300 text-amber-500"
                  />
                  Tahap Aktif
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  type="date"
                  value={cfg.startDate}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      stageDeadlines: {
                        ...draft.stageDeadlines,
                        [st]: { ...cfg, startDate: e.target.value },
                      },
                    })
                  }
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
                <input
                  type="time"
                  value={cfg.startTime}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      stageDeadlines: {
                        ...draft.stageDeadlines,
                        [st]: { ...cfg, startTime: e.target.value },
                      },
                    })
                  }
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
                <input
                  type="date"
                  value={cfg.endDate}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      stageDeadlines: {
                        ...draft.stageDeadlines,
                        [st]: { ...cfg, endDate: e.target.value },
                      },
                    })
                  }
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
                <input
                  type="time"
                  value={cfg.endTime}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      stageDeadlines: {
                        ...draft.stageDeadlines,
                        [st]: { ...cfg, endTime: e.target.value },
                      },
                    })
                  }
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const AssessmentScheduleModule: React.FC<{
  user: UserProfile;
  classId: string;
  stageConfig: StageManagerConfig;
}> = ({ user, classId, stageConfig }) => {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<StageManagerConfig>(stageConfig);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    setDraft(stageConfig);
  }, [stageConfig]);

  if (!isTeacherOrAdmin(user.role)) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-sm text-slate-500">
        Hanya Guru Pengampu dan Administrator yang dapat mengatur jadwal buka-tutup penilaian 360°.
      </div>
    );
  }

  const handleSave = async () => {
    setBusy(true);
    try {
      await saveStageManager(classId, {
        ...draft,
        updatedBy: user.uid,
        updatedByName: user.name,
        updatedAt: new Date().toISOString(),
      });
      showToast('Jadwal penilaian 360° berhasil diperbarui', 'success');
    } catch (err) {
      showToast('Gagal memperbarui jadwal penilaian', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-amber-500" />
            Jadwal Penilaian 360° & Lock Gate
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mengatur waktu buka dan tutup penilaian siswa serta akses Rapor Saya per tahap.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={handleSave}
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs inline-flex items-center gap-2 self-start"
        >
          <Save className="w-4 h-4" />
          Simpan Jadwal
        </button>
      </div>

      <div className="space-y-4">
        {PRODUCTION_STAGES.map((st) => {
          const cfg = draft.stageDeadlines[st];
          const status = isAssessmentOpen(draft.stageDeadlines, st);
          return (
            <div
              key={st}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    Penilaian Tahap {st}
                  </h3>
                  <p
                    className={`text-xs font-medium ${
                      status.isOpen
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {status.reason}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfg.assessmentEnabled !== false}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        stageDeadlines: {
                          ...draft.stageDeadlines,
                          [st]: { ...cfg, assessmentEnabled: e.target.checked },
                        },
                      })
                    }
                    className="rounded border-slate-300 text-amber-500"
                  />
                  Aktifkan Penilaian
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  type="date"
                  value={cfg.assessmentStartDate || cfg.startDate}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      stageDeadlines: {
                        ...draft.stageDeadlines,
                        [st]: { ...cfg, assessmentStartDate: e.target.value },
                      },
                    })
                  }
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
                <input
                  type="time"
                  value={cfg.assessmentStartTime || '00:00'}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      stageDeadlines: {
                        ...draft.stageDeadlines,
                        [st]: { ...cfg, assessmentStartTime: e.target.value },
                      },
                    })
                  }
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
                <input
                  type="date"
                  value={cfg.assessmentEndDate || cfg.endDate}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      stageDeadlines: {
                        ...draft.stageDeadlines,
                        [st]: { ...cfg, assessmentEndDate: e.target.value },
                      },
                    })
                  }
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
                <input
                  type="time"
                  value={cfg.assessmentEndTime || '23:59'}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      stageDeadlines: {
                        ...draft.stageDeadlines,
                        [st]: { ...cfg, assessmentEndTime: e.target.value },
                      },
                    })
                  }
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
