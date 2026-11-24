import React, { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, Check, List, MapPin, Plus, X } from 'lucide-react';
import { isCoordinatorRole, isCoreCommitteeRole, isTeacherOrAdmin } from '../../core/constants';
import {
  BookingItem,
  DeadlineTask,
  ScheduleConfirmation,
  ScheduleItem,
  TimelineWeek,
  UserProfile,
} from '../../core/types';
import {
  makeSafeId,
  recordAuditLog,
  removeDocument,
  upsertDocument,
} from '../../services/firestoreService';
import { useToast } from '../common/Toast';

export const ScheduleModule: React.FC<{
  user: UserProfile;
  classId: string;
  schedules: ScheduleItem[];
  confirmations: ScheduleConfirmation[];
}> = ({ user, classId, schedules, confirmations }) => {
  const { showToast } = useToast();
  const canCreate = isCoreCommitteeRole(user.role) || isCoordinatorRole(user.role);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('16:00');
  const [location, setLocation] = useState('Aula SMP Negeri 10 Samarinda');
  const [type, setType] = useState<ScheduleItem['type']>('Latihan');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return [...schedules]
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .filter((s) => (typeFilter === 'ALL' ? true : s.type === typeFilter));
  }, [schedules, typeFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('Judul agenda wajib diisi', 'warning');
      return;
    }
    try {
      const id = makeSafeId('sch');
      const item: ScheduleItem = {
        id,
        classId,
        title: title.trim(),
        startAt: `${date}T${startTime}:00`,
        endAt: `${date}T${endTime}:00`,
        location: location.trim() || 'Ruang Seni Budaya',
        type,
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
      };
      await upsertDocument('schedules', id, item as unknown as Record<string, unknown>);
      await recordAuditLog({
        user,
        action: 'CREATE',
        targetType: 'schedule',
        targetId: id,
        details: `Menambahkan jadwal "${title.trim()}".`,
      });
      setTitle('');
      setShowForm(false);
      showToast('Agenda jadwal berhasil ditambahkan', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan jadwal', 'error');
    }
  };

  const handleRsvp = async (schedule: ScheduleItem, status: 'HADIR' | 'BERHALANGAN') => {
    try {
      const confId = `${schedule.id}_${user.uid}`;
      const now = new Date().toISOString();
      const payload: ScheduleConfirmation = {
        id: confId,
        scheduleId: schedule.id,
        classId,
        userId: user.uid,
        userName: user.name,
        status,
        updatedAt: now,
        createdAt: now,
      };
      await upsertDocument('scheduleConfirmations', confId, payload as unknown as Record<string, unknown>);
      showToast(`Konfirmasi RSVP: ${status}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan konfirmasi RSVP', 'error');
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    try {
      await removeDocument('schedules', id);
      setConfirmDeleteId(null);
      showToast('Jadwal berhasil dihapus', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus jadwal', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Jadwal & Agenda Produksi
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Agenda rapat pleno, latihan, gladi, dan pementasan beserta konfirmasi kehadiran (RSVP).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setView('list')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 ${
                view === 'list' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white' : 'text-slate-500'
              }`}
            >
              <List className="w-3.5 h-3.5" /> Daftar
            </button>
            <button
              type="button"
              onClick={() => setView('calendar')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 ${
                view === 'calendar' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white' : 'text-slate-500'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" /> Ringkasan Tanggal
            </button>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowForm(!showForm)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Tambah Agenda
            </button>
          )}
        </div>
      </div>

      {showForm && canCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Judul agenda..."
              className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ScheduleItem['type'])}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            >
              {['Rapat Pleno', 'Latihan', 'Gladi', 'Pementasan', 'Divisi', 'Lainnya'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono"
            />
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono"
              />
              <span className="text-xs text-slate-400">s.d.</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono"
              />
            </div>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Lokasi kegiatan..."
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
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
              className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-semibold"
            >
              Simpan Jadwal
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-1.5">
        {['ALL', 'Rapat Pleno', 'Latihan', 'Gladi', 'Pementasan', 'Divisi'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              typeFilter === t
                ? 'bg-amber-500 text-slate-950'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {t === 'ALL' ? 'Semua Agenda' : t}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-xs text-slate-500">
          Belum ada jadwal kegiatan tercatat.
        </div>
      ) : view === 'list' ? (
        <div className="space-y-3">
          {filtered.map((s) => {
            const schedConfs = confirmations.filter((c) => c.scheduleId === s.id);
            const myConf = schedConfs.find((c) => c.userId === user.uid);
            const hadirCount = schedConfs.filter((c) => c.status === 'HADIR').length;

            return (
              <div
                key={s.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    <span className="font-semibold text-amber-600 dark:text-amber-400 font-sans">
                      {s.type}
                    </span>
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    {new Date(s.startAt).toLocaleDateString('id-ID', {
                      weekday: 'short',
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    {s.startAt.slice(11, 16)}–{s.endAt.slice(11, 16)}
                  </p>
                  <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    {s.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {s.location}
                    <span className="mx-1" aria-hidden="true">·</span>
                    RSVP Hadir: <span className="font-mono tabular-nums font-semibold">{hadirCount}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRsvp(s, 'HADIR')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1 ${
                      myConf?.status === 'HADIR'
                        ? 'bg-emerald-600 text-white'
                        : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" /> Hadir
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRsvp(s, 'BERHALANGAN')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1 ${
                      myConf?.status === 'BERHALANGAN'
                        ? 'bg-rose-600 text-white'
                        : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <X className="w-3.5 h-3.5" /> Berhalangan
                  </button>
                  {canCreate && (
                    confirmDeleteId === s.id ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleDeleteSchedule(s.id)}
                          className="px-2.5 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold"
                        >
                          Yakin
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(s.id)}
                        className="px-2.5 py-1.5 rounded-xl text-xs text-rose-500 hover:bg-rose-500/10"
                      >
                        Hapus
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <div
              key={s.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-1.5"
            >
              <p className="text-xs font-mono tabular-nums text-amber-600 dark:text-amber-400 font-semibold">
                {s.startAt.slice(0, 10)} · {s.startAt.slice(11, 16)}
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{s.title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{s.location}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface CalEvent {
  id: string;
  date: string;
  title: string;
  kind: 'TIMELINE' | 'SCHEDULE' | 'BOOKING' | 'DEADLINE';
  meta: string;
}

export const ActivityCalendarModule: React.FC<{
  user: UserProfile;
  timelineWeeks: TimelineWeek[];
  schedules: ScheduleItem[];
  bookings: BookingItem[];
  deadlines: DeadlineTask[];
}> = ({ user, timelineWeeks, schedules, bookings, deadlines }) => {
  const [monthStr, setMonthStr] = useState(() => new Date().toISOString().slice(0, 7));
  const [kindFilter, setKindFilter] = useState<'ALL' | CalEvent['kind']>('ALL');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const events = useMemo(() => {
    const all: CalEvent[] = [];
    for (const tw of timelineWeeks) {
      const dateVal = (tw.date || tw.startDate || '').slice(0, 10);
      if (!dateVal) continue;
      const lbl = tw.weekLabel || tw.label || `Minggu ${tw.weekNumber || '-'}`;
      const stg = tw.stage || tw.phase || 'PERSIAPAN';
      all.push({ id: `tw_${tw.id}`, date: dateVal, title: tw.title, kind: 'TIMELINE', meta: `${lbl} · ${stg}` });
    }
    for (const sc of schedules) {
      if (!sc.startAt) continue;
      all.push({ id: `sc_${sc.id}`, date: sc.startAt.slice(0, 10), title: sc.title, kind: 'SCHEDULE', meta: sc.location });
    }
    for (const bk of bookings) {
      if (!bk.date) continue;
      all.push({ id: `bk_${bk.id}`, date: bk.date.slice(0, 10), title: `Pinjam: ${bk.equipmentName}`, kind: 'BOOKING', meta: `${bk.bookerName} · ${bk.status}` });
    }
    for (const dl of deadlines) {
      if (!dl.dueDate) continue;
      all.push({ id: `dl_${dl.id}`, date: dl.dueDate.slice(0, 10), title: `Deadline: ${dl.title}`, kind: 'DEADLINE', meta: `${dl.priority} · ${dl.stage}` });
    }
    return all.filter(
      (e) => e.date.startsWith(monthStr) && (kindFilter === 'ALL' ? true : e.kind === kindFilter)
    );
  }, [timelineWeeks, schedules, bookings, deadlines, monthStr, kindFilter]);

  const daysInMonth = useMemo(() => {
    const [y, m] = monthStr.split('-').map(Number);
    const total = new Date(y, m, 0).getDate();
    return Array.from({ length: total }, (_, i) => `${monthStr}-${String(i + 1).padStart(2, '0')}`);
  }, [monthStr]);

  if (!isTeacherOrAdmin(user.role)) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-6 text-sm text-slate-500">
        Modul Kalender Terpadu hanya tersedia untuk Guru Pengampu dan Administrator.
      </div>
    );
  }

  const kindColor: Record<CalEvent['kind'], string> = {
    TIMELINE: 'bg-indigo-500',
    SCHEDULE: 'bg-blue-500',
    BOOKING: 'bg-purple-500',
    DEADLINE: 'bg-amber-500',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Kalender Aktivitas Terpadu
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Gabungan timeline produksi, jadwal latihan, booking alat, dan tenggat tugas.
          </p>
        </div>
        <input
          type="month"
          value={monthStr}
          onChange={(e) => setMonthStr(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-mono"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(['ALL', 'TIMELINE', 'SCHEDULE', 'BOOKING', 'DEADLINE'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKindFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                kindFilter === k
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {k} ({k === 'ALL' ? events.length : events.filter((e) => e.kind === k).length})
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
        {daysInMonth.map((d) => {
          const dayEvents = events.filter((e) => e.date === d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => setSelectedDay(d)}
              className={`min-h-[82px] p-2.5 rounded-xl border text-left transition-colors ${
                selectedDay === d
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-600'
              }`}
            >
              <p className="text-xs font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                {d.slice(8)}
              </p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {dayEvents.map((ev) => (
                  <span
                    key={ev.id}
                    className={`w-2 h-2 rounded-full ${kindColor[ev.kind]}`}
                    title={ev.title}
                  />
                ))}
              </div>
              {dayEvents.length > 0 && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                  {dayEvents[0].title}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white font-mono">
              Kegiatan Tanggal {selectedDay}
            </h3>
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Tutup
            </button>
          </div>
          {events.filter((e) => e.date === selectedDay).length === 0 ? (
            <p className="text-xs text-slate-500">Tidak ada kegiatan pada tanggal ini.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {events
                .filter((e) => e.date === selectedDay)
                .map((ev) => (
                  <div key={ev.id} className="py-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        {ev.kind}
                      </p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{ev.title}</p>
                      <p className="text-xs text-slate-500">{ev.meta}</p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
