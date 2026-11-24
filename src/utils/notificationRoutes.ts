import { ModuleId, NotificationItem } from '../core/types';

const KEYWORD_ROUTES: [string, ModuleId][] = [
  ['deadline', 'tugas'],
  ['tugas', 'tugas'],
  ['jadwal', 'jadwal'],
  ['presensi', 'absensi'],
  ['absensi', 'absensi'],
  ['kas', 'kas'],
  ['iuran', 'kas'],
  ['nilai', 'nilai-saya'],
  ['rapor', 'nilai-saya'],
  ['pengumuman', 'informasi'],
  ['notulen', 'notulensi'],
  ['booking', 'booking'],
  ['alat', 'booking'],
  ['aduan', 'aduan'],
];

const CATEGORY_ROUTES: Record<string, ModuleId> = {
  Tugas: 'tugas',
  Feedback: 'tugas',
  Reminder: 'jadwal',
  Pengumuman: 'informasi',
  Nilai: 'nilai-saya',
  Urgent: 'informasi',
  Keuangan: 'kas',
  Sistem: 'notifikasi',
};

export function resolveNotificationRoute(n: NotificationItem): ModuleId {
  if (n.link && n.link.trim().length > 0) {
    return n.link as ModuleId;
  }
  const hay = `${n.title} ${n.message}`.toLowerCase();
  for (const [kw, route] of KEYWORD_ROUTES) {
    if (hay.includes(kw)) return route;
  }
  if (n.category && CATEGORY_ROUTES[n.category]) {
    return CATEGORY_ROUTES[n.category];
  }
  return 'notifikasi';
}
