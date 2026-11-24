import React from 'react';
import {
  Activity,
  AlertOctagon,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  CalendarDays,
  CalendarRange,
  CheckSquare,
  Clapperboard,
  ClipboardCheck,
  ClipboardList,
  Database,
  DollarSign,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  HelpCircle,
  Home,
  Layers,
  LayoutGrid,
  Megaphone,
  MessageSquareWarning,
  Music,
  Palette,
  Package,
  Radio,
  Settings,
  Share2,
  Shield,
  Shirt,
  Sparkles,
  Users,
  Video,
  Wrench,
  X,
} from 'lucide-react';
import { SCHOOL_INFO, canAccessModule } from '../../core/constants';
import { ModuleId, UserProfile } from '../../core/types';

export interface NavItem {
  id: ModuleId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Utama',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: Home },
      { id: 'informasi', label: 'Papan Info', icon: Megaphone },
      { id: 'notifikasi', label: 'Notifikasi', icon: Bell },
      { id: 'panduan', label: 'Panduan', icon: HelpCircle },
    ],
  },
  {
    title: 'Produksi & Jadwal',
    items: [
      { id: 'jadwal', label: 'Jadwal', icon: Calendar },
      { id: 'master-timeline', label: 'Master Timeline', icon: CalendarRange },
      { id: 'director-timeline', label: 'Timeline Sutradara', icon: Clapperboard },
      { id: 'division-schedule', label: 'Jadwal Divisi', icon: Users },
      { id: 'content-schedule', label: 'Jadwal Konten', icon: Share2 },
      { id: 'absensi', label: 'Presensi', icon: ClipboardCheck },
      { id: 'tugas', label: 'Tugas & Deadline', icon: CheckSquare },
      { id: 'template-hub', label: 'Template Hub', icon: LayoutGrid },
      { id: 'kelola-tahapan', label: 'Kelola Tahapan', icon: Layers },
    ],
  },
  {
    title: 'Penilaian 360',
    items: [
      { id: 'nilai-saya', label: 'Rapor Saya', icon: Award },
      { id: 'nilai', label: 'Penilaian 360', icon: ClipboardList },
      { id: 'jadwal-penilaian', label: 'Jadwal Penilaian', icon: CalendarDays },
      { id: 'rekap-nilai', label: 'Rekap Nilai', icon: BarChart3 },
      { id: 'moderasi', label: 'Moderasi Nilai', icon: AlertOctagon },
    ],
  },
  {
    title: 'Divisi & Artistik',
    items: [
      { id: 'studio', label: 'Studio Latihan', icon: Video },
      { id: 'properti', label: 'Properti', icon: Package },
      { id: 'musik-cue', label: 'Musik Cue', icon: Music },
      { id: 'face-chart', label: 'Face Chart', icon: Palette },
      { id: 'kostum', label: 'Kostum', icon: Shirt },
    ],
  },
  {
    title: 'Keuangan & Arsip',
    items: [
      { id: 'kas', label: 'Kas & Iuran', icon: DollarSign },
      { id: 'rab', label: 'RAB Produksi', icon: FileSpreadsheet },
      { id: 'booking', label: 'Booking Alat', icon: Wrench },
      { id: 'booking-calendar', label: 'Kalender Booking', icon: CalendarDays },
      { id: 'notulensi', label: 'Notulensi', icon: FileText },
      { id: 'broadcast', label: 'Broadcast', icon: Radio },
      { id: 'dokumen', label: 'Dokumen Drive', icon: FolderOpen },
    ],
  },
  {
    title: 'Organisasi & Sistem',
    items: [
      { id: 'struktur', label: 'Kerabat Kerja', icon: Users },
      { id: 'aduan', label: 'Aduan Siswa', icon: MessageSquareWarning },
      { id: 'activity-calendar', label: 'Kalender Terpadu', icon: CalendarDays },
      { id: 'activity-log', label: 'Activity Log', icon: Activity },
      { id: 'kelola-kelas', label: 'Kelola Kelas', icon: BookOpen },
      { id: 'kelola-siswa', label: 'Kelola Siswa', icon: Users },
      { id: 'statistik-absensi', label: 'Statistik Absensi', icon: BarChart3 },
      { id: 'inter-class', label: 'Koordinasi Lintas Kelas', icon: Sparkles },
      { id: 'welcome-broadcast', label: 'Broadcast Global', icon: Radio },
      { id: 'backup', label: 'Backup & Restore', icon: Database },
      { id: 'debug-users', label: 'Audit Akun', icon: Shield },
      { id: 'admin', label: 'Admin Panel', icon: Shield },
      { id: 'settings', label: 'Pengaturan', icon: Settings },
    ],
  },
];

interface SidebarProps {
  user: UserProfile;
  activeModule: ModuleId;
  unreadNotifications: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onNavigate: (moduleId: ModuleId) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  activeModule,
  unreadNotifications,
  mobileOpen,
  onCloseMobile,
  onNavigate,
}) => {
  const navContent = (
    <div className="flex flex-col h-full bg-white/92 dark:bg-slate-900/92 backdrop-blur-md border-r border-slate-200 dark:border-slate-800">
      <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={SCHOOL_INFO.logoSchool}
            alt="Logo SMPN 10 Samarinda"
            className="w-8 h-8 object-contain shrink-0"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0">
            <p className="font-display font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
              SP-PPT Samarinda
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              SMPN 10 Samarinda
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Tutup menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) => canAccessModule(user.role, item.id));
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.title}>
              <p className="px-2.5 mb-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 tracking-wide">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeModule === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onNavigate(item.id);
                        onCloseMobile();
                      }}
                      className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-amber-500 text-slate-950 font-semibold'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.id === 'notifikasi' && unreadNotifications > 0 && (
                        <span
                          className={`font-mono tabular-nums text-[11px] font-bold ${
                            active ? 'text-slate-950' : 'text-rose-500 dark:text-rose-400'
                          }`}
                        >
                          {unreadNotifications}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0 no-print">
        {navContent}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
};
