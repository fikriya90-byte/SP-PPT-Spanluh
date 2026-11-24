import React, { useMemo, useState } from 'react';
import { Bell, CheckCheck, Search, Trash2 } from 'lucide-react';
import { ModuleId, NotificationItem } from '../../core/types';
import { removeDocument, updateDocumentFields } from '../../services/firestoreService';
import { formatRelativeTime } from '../../utils/imageCompress';
import { resolveNotificationRoute } from '../../utils/notificationRoutes';
import { useToast } from '../common/Toast';

interface Props {
  notifications: NotificationItem[];
  onNavigate: (moduleId: ModuleId) => void;
}

const CATEGORIES = ['ALL', 'UNREAD', 'Tugas', 'Reminder', 'Pengumuman', 'Nilai', 'Urgent', 'Keuangan'] as const;

export const NotificationModule: React.FC<Props> = ({ notifications, onNavigate }) => {
  const { showToast } = useToast();
  const [catFilter, setCatFilter] = useState<(typeof CATEGORIES)[number]>('ALL');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notifications.filter((n) => {
      if (catFilter === 'UNREAD' && n.read) return false;
      if (catFilter !== 'ALL' && catFilter !== 'UNREAD' && n.category !== catFilter) return false;
      if (!q) return true;
      return n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q);
    });
  }, [notifications, catFilter, search]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleOpen = async (n: NotificationItem) => {
    try {
      if (!n.read) {
        await updateDocumentFields('notifications', n.id, { read: true });
      }
      const target = resolveNotificationRoute(n);
      onNavigate(target);
    } catch (err) {
      showToast('Gagal membuka notifikasi', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const unread = notifications.filter((n) => !n.read);
      await Promise.all(unread.map((n) => updateDocumentFields('notifications', n.id, { read: true })));
      showToast(`${unread.length} notifikasi ditandai sudah dibaca`, 'success');
    } catch (err) {
      showToast('Gagal menandai semua dibaca', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Pusat Notifikasi
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {unreadCount} belum dibaca · {notifications.length} total notifikasi
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2 whitespace-nowrap self-start"
          >
            <CheckCheck className="w-4 h-4 text-emerald-500" />
            Tandai Semua Dibaca
          </button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari notifikasi..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCatFilter(c)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                catFilter === c
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {c === 'ALL' ? 'Semua' : c === 'UNREAD' ? 'Belum Dibaca' : c}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
          <Bell className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Tidak ada notifikasi yang cocok
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          {filtered.map((n) => (
            <div
              key={n.id}
              className={`p-4 flex items-start justify-between gap-3 transition-colors ${
                n.read ? 'opacity-80' : 'bg-amber-500/5'
              }`}
            >
              <button
                type="button"
                onClick={() => handleOpen(n)}
                className="flex-1 text-left min-w-0"
              >
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className={n.read ? 'font-medium' : 'font-bold text-amber-600 dark:text-amber-400'}>
                    {n.read ? 'Dibaca' : 'Baru'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{n.category}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{formatRelativeTime(n.createdAt)}</span>
                </div>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                  {n.title}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">
                  {n.message}
                </p>
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await removeDocument('notifications', n.id);
                  } catch (err) {
                    showToast('Gagal menghapus notifikasi', 'error', err instanceof Error ? err.message : undefined);
                  }
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 shrink-0"
                aria-label="Hapus notifikasi"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
