import React, { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Download, Lock, Plus, UserCheck } from 'lucide-react';
import { PRODUCTION_STAGES, ROLE_DEFINITIONS, isTeacherOrAdmin } from '../../core/constants';
import {
  AttendanceRecord,
  AttendanceSession,
  AttendanceStatus,
  ProductionStage,
  TargetScope,
  UserProfile,
} from '../../core/types';
import { isSessionRelevantToUser } from '../../services/autoScoreService';
import {
  closeAttendanceSession,
  makeSafeId,
  recordAuditLog,
  upsertDocument,
} from '../../services/firestoreService';
import { exportXLSX } from '../../utils/exportXLSX';
import { CleanBarChart } from '../common/Charts';
import { useToast } from '../common/Toast';

interface AttendanceProps {
  user: UserProfile;
  classId: string;
  currentStage: ProductionStage;
  sessions: AttendanceSession[];
  records: AttendanceRecord[];
  classMembers: UserProfile[];
}

export const AttendanceModule: React.FC<AttendanceProps> = ({
  user,
  classId,
  currentStage,
  sessions,
  records,
  classMembers,
}) => {
  const { showToast } = useToast();
  const canManage =
    isTeacherOrAdmin(user.role) || ['Sekretaris', 'Sutradara', 'Pimpinan Produksi'].includes(user.role);

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [activityType, setActivityType] = useState<AttendanceSession['activityType']>('Latihan');
  const [targetScope, setTargetScope] = useState<TargetScope>('SEMUA');
  const [targetDivision, setTargetDivision] = useState('Tata Panggung');
  const [onBehalfSessionId, setOnBehalfSessionId] = useState<string | null>(null);
  const [onBehalfStudentId, setOnBehalfStudentId] = useState('');
  const [onBehalfStatus, setOnBehalfStatus] = useState<AttendanceStatus>('Hadir');
  const [busy, setBusy] = useState(false);

  const students = useMemo(
    () => classMembers.filter((m) => !isTeacherOrAdmin(m.role) && m.isActive !== false),
    [classMembers]
  );

  const divisions = useMemo(
    () => Array.from(new Set(ROLE_DEFINITIONS.map((r) => r.divisionName))),
    []
  );

  const visibleSessions = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (canManage) return sorted;
    return sorted.filter((s) => isSessionRelevantToUser(s, user));
  }, [sessions, canManage, user]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('Judul sesi presensi wajib diisi', 'warning');
      return;
    }
    setBusy(true);
    try {
      const id = makeSafeId('att');
      const payload: AttendanceSession = {
        id,
        classId,
        stage: currentStage,
        date,
        title: title.trim(),
        activityType,
        targetScope,
        ...(targetScope === 'DIVISI' ? { targetDivision } : {}),
        isOpen: true,
        createdBy: user.uid,
        creatorName: user.name,
        creatorRole: user.role,
        createdAt: new Date().toISOString(),
      };
      await upsertDocument('attendanceSessions', id, payload as unknown as Record<string, unknown>);
      await recordAuditLog({
        user,
        action: 'CREATE',
        targetType: 'attendanceSession',
        targetId: id,
        details: `Membuka sesi presensi "${title.trim()}" (${targetScope}).`,
      });
      setTitle('');
      setShowCreate(false);
      showToast('Sesi presensi dibuka', 'success');
    } catch (err) {
      showToast('Gagal membuka sesi presensi', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleCheckIn = async (session: AttendanceSession, status: AttendanceStatus) => {
    setBusy(true);
    try {
      const recId = `${session.id}_${user.uid}`;
      const record: AttendanceRecord = {
        id: recId,
        sessionId: session.id,
        studentId: user.uid,
        studentName: user.name,
        classId,
        status,
        timestamp: new Date().toISOString(),
      };
      await upsertDocument('attendanceRecords', recId, record as unknown as Record<string, unknown>);
      await recordAuditLog({
        user,
        action: 'SUBMIT',
        targetType: 'attendanceRecord',
        targetId: recId,
        details: `Presensi ${status} pada "${session.title}".`,
      });
      showToast(`Presensi tercatat: ${status}`, 'success');
    } catch (err) {
      showToast('Gagal mencatat presensi', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleOnBehalfSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onBehalfSessionId || !onBehalfStudentId) return;
    const student = students.find((s) => s.uid === onBehalfStudentId);
    if (!student) return;
    setBusy(true);
    try {
      const recId = `${onBehalfSessionId}_${student.uid}`;
      const record: AttendanceRecord = {
        id: recId,
        sessionId: onBehalfSessionId,
        studentId: student.uid,
        studentName: student.name,
        classId,
        status: onBehalfStatus,
        timestamp: new Date().toISOString(),
        isOnBehalf: true,
        filledBy: user.uid,
        filledByName: user.name,
        filledByRole: user.role,
      };
      await upsertDocument('attendanceRecords', recId, record as unknown as Record<string, unknown>);
      showToast(`Presensi ${student.name} dicatat (${onBehalfStatus})`, 'success');
      setOnBehalfSessionId(null);
    } catch (err) {
      showToast('Gagal mencatat presensi siswa', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleCloseSession = async (session: AttendanceSession) => {
    setBusy(true);
    try {
      const autoCount = await closeAttendanceSession({
        session,
        classMembers,
        existingRecords: records,
        actor: user,
      });
      showToast('Sesi presensi ditutup', 'info', `${autoCount} anggota otomatis ditandai Alpa.`);
    } catch (err) {
      showToast('Gagal menutup sesi presensi', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Presensi Kegiatan Produksi
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tahap aktif: {currentStage} · Kehadiran memengaruhi skor otomatis penilaian 360°.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs inline-flex items-center gap-2 whitespace-nowrap self-start"
          >
            <Plus className="w-4 h-4" />
            Buka Sesi Presensi
          </button>
        )}
      </div>

      {showCreate && canManage && (
        <form
          onSubmit={handleCreateSession}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nama Kegiatan / Sesi *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Latihan Blocking Babak 1"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tanggal
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Jenis Kegiatan
              </label>
              <select
                value={activityType}
                onChange={(e) => setActivityType(e.target.value as AttendanceSession['activityType'])}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
              >
                {['Rapat', 'Latihan', 'Gladi', 'Pementasan', 'Lainnya'].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Target Peserta
              </label>
              <select
                value={targetScope}
                onChange={(e) => setTargetScope(e.target.value as TargetScope)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="SEMUA">Semua Anggota Kelas</option>
                <option value="PEMAIN_MUSIK">Pemeran & Tata Musik</option>
                <option value="PENGURUS_INTI">Pengurus Inti & Sutradara</option>
                <option value="DIVISI">Per Divisi Tertentu</option>
              </select>
            </div>
            {targetScope === 'DIVISI' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Pilih Divisi
                </label>
                <select
                  value={targetDivision}
                  onChange={(e) => setTargetDivision(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                >
                  {divisions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs"
            >
              {busy ? 'Membuka...' : 'Buka Sesi'}
            </button>
          </div>
        </form>
      )}

      {visibleSessions.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
          <ClipboardCheck className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Belum ada sesi presensi
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleSessions.map((session) => {
            const sessionRecords = records.filter((r) => r.sessionId === session.id);
            const myRecord = sessionRecords.find((r) => r.studentId === user.uid);
            const isStudent = !isTeacherOrAdmin(user.role);

            return (
              <div
                key={session.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span
                        className={`font-bold ${
                          session.isOpen ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'
                        }`}
                      >
                        {session.isOpen ? 'Terbuka' : 'Ditutup'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{session.date}</span>
                      <span aria-hidden="true">·</span>
                      <span>{session.activityType}</span>
                      <span aria-hidden="true">·</span>
                      <span>{session.stage}</span>
                    </div>
                    <h3 className="font-display font-bold text-base text-slate-900 dark:text-white mt-0.5">
                      {session.title}
                    </h3>
                  </div>

                  {canManage && (
                    <div className="flex flex-wrap items-center gap-2">
                      {session.isOpen && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setOnBehalfSessionId(
                                onBehalfSessionId === session.id ? null : session.id
                              );
                              setOnBehalfStudentId(students[0]?.uid || '');
                            }}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            Isi Perwakilan
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleCloseSession(session)}
                            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            Tutup & Auto-Alpa
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Student self check-in */}
                {isStudent && isSessionRelevantToUser(session, user) && (
                  <div className="pt-1">
                    {myRecord ? (
                      <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" />
                        Status Anda: {myRecord.status} ·{' '}
                        <span className="font-mono tabular-nums text-slate-500">
                          {new Date(myRecord.timestamp).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {myRecord.autoMarked && ' (Otomatis Sistem)'}
                      </div>
                    ) : session.isOpen ? (
                      <div className="flex flex-wrap gap-2">
                        {(['Hadir', 'Izin', 'Sakit'] as AttendanceStatus[]).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleCheckIn(session, st)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                              st === 'Hadir'
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            Tandai {st}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                        Anda Alpa (tidak mengisi presensi sebelum sesi ditutup).
                      </p>
                    )}
                  </div>
                )}

                {/* On-behalf form */}
                {canManage && onBehalfSessionId === session.id && (
                  <form
                    onSubmit={handleOnBehalfSubmit}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 flex flex-col sm:flex-row gap-2.5"
                  >
                    <select
                      value={onBehalfStudentId}
                      onChange={(e) => setOnBehalfStudentId(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs"
                    >
                      {students.map((s) => (
                        <option key={s.uid} value={s.uid}>
                          {s.name} ({s.role})
                        </option>
                      ))}
                    </select>
                    <select
                      value={onBehalfStatus}
                      onChange={(e) => setOnBehalfStatus(e.target.value as AttendanceStatus)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs"
                    >
                      {(['Hadir', 'Izin', 'Sakit', 'Alpa'] as AttendanceStatus[]).map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold"
                    >
                      Simpan
                    </button>
                  </form>
                )}

                {/* Summary count */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-4 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  <span>Hadir: {sessionRecords.filter((r) => r.status === 'Hadir').length}</span>
                  <span>Izin: {sessionRecords.filter((r) => r.status === 'Izin').length}</span>
                  <span>Sakit: {sessionRecords.filter((r) => r.status === 'Sakit').length}</span>
                  <span>Alpa: {sessionRecords.filter((r) => r.status === 'Alpa').length}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const AttendanceStatsModule: React.FC<{
  classId: string;
  sessions: AttendanceSession[];
  records: AttendanceRecord[];
  classMembers: UserProfile[];
}> = ({ classId, sessions, records, classMembers }) => {
  const [stageFilter, setStageFilter] = useState<'ALL' | ProductionStage>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | AttendanceSession['activityType']>('ALL');

  const students = useMemo(
    () => classMembers.filter((m) => !isTeacherOrAdmin(m.role) && m.isActive !== false),
    [classMembers]
  );

  const filteredSessions = useMemo(() => {
    return sessions
      .filter((s) => (stageFilter === 'ALL' ? true : s.stage === stageFilter))
      .filter((s) => (typeFilter === 'ALL' ? true : s.activityType === typeFilter))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [sessions, stageFilter, typeFilter]);

  const rows = useMemo(() => {
    return students.map((stu) => {
      let hadir = 0;
      let izin = 0;
      let sakit = 0;
      let alpa = 0;
      const perSession = filteredSessions.map((ses) => {
        const rec = records.find((r) => r.sessionId === ses.id && r.studentId === stu.uid);
        if (rec?.status === 'Hadir') hadir++;
        else if (rec?.status === 'Izin') izin++;
        else if (rec?.status === 'Sakit') sakit++;
        else if (rec?.status === 'Alpa') alpa++;
        return rec?.status || (ses.isOpen ? '-' : 'Alpa');
      });
      const total = filteredSessions.length || 1;
      return {
        student: stu,
        hadir,
        izin,
        sakit,
        alpa,
        pctHadir: Math.round((hadir / total) * 100),
        perSession,
      };
    });
  }, [students, filteredSessions, records]);

  const divisionChart = useMemo(() => {
    const groups = new Map<string, number[]>();
    for (const r of rows) {
      const list = groups.get(r.student.divisionName) || [];
      list.push(r.pctHadir);
      groups.set(r.student.divisionName, list);
    }
    return Array.from(groups.entries()).map(([div, vals]) => ({
      label: div,
      value: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
      colorClass: 'bg-emerald-500',
    }));
  }, [rows]);

  const handleExport = () => {
    exportXLSX(`statistik_absensi_${classId}`, [
      {
        name: 'Statistik Absensi',
        headers: ['Nama', 'Peran', 'Divisi', 'Hadir', 'Izin', 'Sakit', 'Alpa', '% Hadir'],
        rows: rows.map((r) => [
          r.student.name,
          r.student.role,
          r.student.divisionName,
          r.hadir,
          r.izin,
          r.sakit,
          r.alpa,
          `${r.pctHadir}%`,
        ]),
      },
    ]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Statistik Absensi Kelas
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Rekap kehadiran per sesi dan peringatan siswa dengan Alpa ≥ 3.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs inline-flex items-center gap-2 self-start"
        >
          <Download className="w-4 h-4" />
          Ekspor XLSX
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as 'ALL' | ProductionStage)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold"
        >
          <option value="ALL">Semua Tahap</option>
          {PRODUCTION_STAGES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'ALL' | AttendanceSession['activityType'])}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold"
        >
          <option value="ALL">Semua Jenis Kegiatan</option>
          {['Rapat', 'Latihan', 'Gladi', 'Pementasan', 'Lainnya'].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white mb-3">
          Rata-rata Kehadiran per Divisi (%)
        </h3>
        <CleanBarChart data={divisionChart} unit="%" />
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-300">
              <th className="py-3 px-4 font-semibold">Nama Siswa</th>
              <th className="py-3 px-4 font-semibold">Peran</th>
              {filteredSessions.slice(0, 6).map((s) => (
                <th key={s.id} className="py-3 px-3 font-semibold text-center font-mono tabular-nums">
                  {s.date.slice(5)}
                </th>
              ))}
              <th className="py-3 px-3 font-semibold text-right font-mono">Hadir</th>
              <th className="py-3 px-3 font-semibold text-right font-mono">Izin/Sakit</th>
              <th className="py-3 px-3 font-semibold text-right font-mono">Alpa</th>
              <th className="py-3 px-4 font-semibold text-right font-mono">% Hadir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => (
              <tr
                key={r.student.uid}
                className={
                  r.alpa >= 3 ? 'bg-rose-500/10 text-rose-900 dark:text-rose-200' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }
              >
                <td className="py-2.5 px-4 font-semibold">{r.student.name}</td>
                <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400">{r.student.role}</td>
                {r.perSession.slice(0, 6).map((st, idx) => (
                  <td key={idx} className="py-2.5 px-3 text-center font-mono">
                    {st === 'Hadir' ? '✓' : st === 'Alpa' ? '✗' : st}
                  </td>
                ))}
                <td className="py-2.5 px-3 text-right font-mono tabular-nums">{r.hadir}</td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums">{r.izin + r.sakit}</td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold">{r.alpa}</td>
                <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold">{r.pctHadir}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
