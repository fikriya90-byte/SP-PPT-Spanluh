import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Mic,
  Music,
  Play,
  Plus,
  Square,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import {
  DIALOG_PRACTICE_STEPS,
  containsForbiddenWords,
  isCoordinatorRole,
  isCoreCommitteeRole,
  isTeacherOrAdmin,
} from '../../core/constants';
import {
  MusicReference,
  PromptBookScene,
  SchoolClass,
  ScriptItem,
  UserProfile,
} from '../../core/types';
import {
  makeSafeId,
  recordAuditLog,
  removeDocument,
  upsertDocument,
} from '../../services/firestoreService';
import { useToast } from '../common/Toast';

interface StudioModuleProps {
  user: UserProfile;
  classId: string;
  classes: SchoolClass[];
  scripts: ScriptItem[];
  musicReferences: MusicReference[];
  promptBooks: PromptBookScene[];
}

export const StudioModule: React.FC<StudioModuleProps> = ({
  user,
  classId,
  classes,
  scripts,
  musicReferences,
  promptBooks,
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'naskah' | 'musik' | 'dialog'>('naskah');

  const canManageScript = isCoreCommitteeRole(user.role);
  const canManageMusic =
    isCoreCommitteeRole(user.role) || isCoordinatorRole(user.role) || user.divisionId === 'musik';

  // ---- TAB 1: NASKAH ----
  const [scriptTitle, setScriptTitle] = useState('');
  const [scriptUrl, setScriptUrl] = useState('');
  const [scriptNotes, setScriptNotes] = useState('');
  const [showScriptForm, setShowScriptForm] = useState(false);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);

  const handleSaveScript = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scriptTitle.trim() || !scriptUrl.trim()) {
      showToast('Judul dan tautan naskah wajib diisi', 'warning');
      return;
    }
    const id = makeSafeId('scr');
    try {
      await upsertDocument('scripts', id, {
        id,
        classId,
        title: scriptTitle.trim(),
        url: scriptUrl.trim(),
        notes: scriptNotes.trim(),
        uploadedBy: user.uid,
        uploaderName: user.name,
        createdAt: new Date().toISOString(),
      });
      setScriptTitle('');
      setScriptUrl('');
      setScriptNotes('');
      setShowScriptForm(false);
      showToast('Naskah berhasil ditambahkan', 'success');
    } catch (err) {
      showToast('Gagal menyimpan naskah', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  // ---- TAB 2: REFERENSI MUSIK + 3-STEP MUSIC COPY MODAL ----
  const [musicCatFilter, setMusicCatFilter] = useState('ALL');
  const [musicSourceFilter, setMusicSourceFilter] = useState('ALL');
  const [showMusicForm, setShowMusicForm] = useState(false);
  const [musicTitle, setMusicTitle] = useState('');
  const [musicUrl, setMusicUrl] = useState('');
  const [musicCategory, setMusicCategory] = useState<MusicReference['category']>('ILUSTRASI');
  const [musicSource, setMusicSource] = useState<MusicReference['source']>('SANDIMA');
  const [musicNotes, setMusicNotes] = useState('');

  // 3-step Copy Modal state
  const [copyItem, setCopyItem] = useState<MusicReference | null>(null);
  const [copyStep, setCopyStep] = useState<1 | 2 | 3>(1);
  const [copyTargetClassId, setCopyTargetClassId] = useState('');
  const [copyNewTitle, setCopyNewTitle] = useState('');
  const [copyBusy, setCopyBusy] = useState(false);

  const filteredMusic = useMemo(() => {
    return musicReferences
      .filter((m) => (musicCatFilter === 'ALL' ? true : m.category === musicCatFilter))
      .filter((m) => (musicSourceFilter === 'ALL' ? true : m.source === musicSourceFilter));
  }, [musicReferences, musicCatFilter, musicSourceFilter]);

  const handleSaveMusicRef = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!musicTitle.trim() || !musicUrl.trim()) {
      showToast('Judul dan tautan referensi musik wajib diisi', 'warning');
      return;
    }
    const id = makeSafeId('mref');
    try {
      await upsertDocument('musicReferences', id, {
        id,
        classId,
        title: musicTitle.trim(),
        url: musicUrl.trim(),
        category: musicCategory,
        source: musicSource,
        notes: musicNotes.trim(),
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
      });
      setMusicTitle('');
      setMusicUrl('');
      setMusicNotes('');
      setShowMusicForm(false);
      showToast('Referensi musik ditambahkan', 'success');
    } catch (err) {
      showToast('Gagal menyimpan referensi musik', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const openCopyModal = (m: MusicReference) => {
    const otherClass = classes.find((c) => c.id !== classId)?.id || classId;
    setCopyItem(m);
    setCopyTargetClassId(otherClass);
    setCopyNewTitle(m.title);
    setCopyStep(1);
  };

  const executeMusicCopy = async () => {
    if (!copyItem || !copyTargetClassId) return;
    setCopyBusy(true);
    try {
      const id = makeSafeId('mref');
      await upsertDocument('musicReferences', id, {
        id,
        classId: copyTargetClassId,
        title: copyNewTitle.trim() || copyItem.title,
        url: copyItem.url,
        category: copyItem.category,
        source: copyItem.source,
        notes: copyItem.notes || `Disalin dari kelas ${classId}`,
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
      });
      await recordAuditLog({
        user,
        action: 'CREATE',
        targetType: 'musicReference',
        targetId: id,
        details: `Menyalin referensi musik "${copyNewTitle}" ke kelas ${copyTargetClassId}.`,
      });
      showToast(`Referensi musik disalin ke ${copyTargetClassId}`, 'success');
      setCopyItem(null);
    } catch (err) {
      showToast('Gagal menyalin musik', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setCopyBusy(false);
    }
  };

  // ---- TAB 3: LATIHAN DIALOG + MEDIA RECORDER + PROMPT BOOK ----
  const [checkedSteps, setCheckedSteps] = useState<number[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recSeconds, setRecSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const [showPromptForm, setShowPromptForm] = useState(false);
  const [pbSceneNumber, setPbSceneNumber] = useState('');
  const [pbTitle, setPbTitle] = useState('');
  const [pbBlocking, setPbBlocking] = useState('');
  const [pbCues, setPbCues] = useState('');
  const [pbNotes, setPbNotes] = useState('');

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
      setRecSeconds(0);
      timerRef.current = window.setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch {
      showToast('Izin mikrofon diperlukan untuk merekam latihan vokal', 'warning');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handleSavePromptBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pbSceneNumber.trim() || !pbTitle.trim()) {
      showToast('Nomor adegan dan judul wajib diisi', 'warning');
      return;
    }
    const bad = containsForbiddenWords(`${pbTitle} ${pbBlocking} ${pbCues} ${pbNotes}`);
    if (bad) {
      showToast('Kata tidak pantas terdeteksi', 'error', bad);
      return;
    }
    const now = new Date().toISOString();
    const id = makeSafeId('pb');
    try {
      await upsertDocument('promptBooks', id, {
        id,
        classId,
        sceneNumber: pbSceneNumber.trim(),
        title: pbTitle.trim(),
        blocking: pbBlocking.trim(),
        cues: pbCues.trim(),
        notes: pbNotes.trim(),
        updatedBy: user.name,
        createdAt: now,
        updatedAt: now,
      });
      setPbSceneNumber('');
      setPbTitle('');
      setPbBlocking('');
      setPbCues('');
      setPbNotes('');
      setShowPromptForm(false);
      showToast('Adegan Prompt Book disimpan', 'success');
    } catch (err) {
      showToast('Gagal menyimpan Prompt Book', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const getEmbedDriveUrl = (rawUrl: string): string | null => {
    if (rawUrl.includes('drive.google.com/file/d/')) {
      const m = rawUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (m?.[1]) return `https://drive.google.com/file/d/${m[1]}/preview`;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Video className="w-6 h-6 text-amber-500" />
            Studio Latihan & Prompt Book
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Naskah lakon, pustaka referensi musik, rekaman vokal mandiri, dan catatan blocking adegan.
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {[
          { id: 'naskah' as const, label: 'Naskah Produksi', icon: FileText },
          { id: 'musik' as const, label: 'Referensi Musik', icon: Music },
          { id: 'dialog' as const, label: 'Latihan Dialog & Prompt Book', icon: Mic },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                active
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: NASKAH */}
      {activeTab === 'naskah' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
              Dokumen Naskah Teater ({scripts.length})
            </h2>
            {canManageScript && (
              <button
                type="button"
                onClick={() => setShowScriptForm(!showScriptForm)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
              >
                <Plus className="w-4 h-4" />
                Tambah Naskah
              </button>
            )}
          </div>

          {showScriptForm && (
            <form
              onSubmit={handleSaveScript}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={scriptTitle}
                  onChange={(e) => setScriptTitle(e.target.value)}
                  placeholder="Judul naskah & versi..."
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
                <input
                  type="url"
                  value={scriptUrl}
                  onChange={(e) => setScriptUrl(e.target.value)}
                  placeholder="Link Google Drive / PDF naskah..."
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <input
                type="text"
                value={scriptNotes}
                onChange={(e) => setScriptNotes(e.target.value)}
                placeholder="Catatan revisi atau keterangan babak..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowScriptForm(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-500"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold"
                >
                  Simpan Naskah
                </button>
              </div>
            </form>
          )}

          {scripts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500">
              Belum ada naskah diunggah untuk kelas {classId}.
            </div>
          ) : (
            <div className="space-y-4">
              {scripts.map((sc) => {
                const embed = getEmbedDriveUrl(sc.url);
                return (
                  <div
                    key={sc.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                          {sc.title}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Diunggah oleh {sc.uploaderName} ·{' '}
                          {new Date(sc.createdAt).toLocaleDateString('id-ID')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={sc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold"
                        >
                          Buka Naskah <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        {canManageScript &&
                          (confirmDeleteKey === `sc:${sc.id}` ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await removeDocument('scripts', sc.id);
                                    setConfirmDeleteKey(null);
                                    showToast('Naskah dihapus', 'info');
                                  } catch (err) {
                                    showToast('Gagal menghapus naskah', 'error', err instanceof Error ? err.message : undefined);
                                  }
                                }}
                                className="px-2 py-1 rounded bg-rose-600 text-white text-[11px] font-semibold"
                              >
                                Hapus
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteKey(null)}
                                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px]"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteKey(`sc:${sc.id}`)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ))}
                      </div>
                    </div>
                    {sc.notes && (
                      <p className="text-xs text-slate-600 dark:text-slate-300">{sc.notes}</p>
                    )}
                    {embed && (
                      <iframe
                        src={embed}
                        title={sc.title}
                        className="w-full h-96 rounded-xl border border-slate-200 dark:border-slate-800"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: REFERENSI MUSIK */}
      {activeTab === 'musik' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <select
                value={musicCatFilter}
                onChange={(e) => setMusicCatFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
              >
                <option value="ALL">Semua Kategori</option>
                {['PEMBUKA', 'PENUTUP', 'ILUSTRASI', 'TRANSISI', 'TARI', 'LAINNYA'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={musicSourceFilter}
                onChange={(e) => setMusicSourceFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
              >
                <option value="ALL">Semua Sumber</option>
                {['SANDIMA', 'TRADISIONAL', 'MODERN', 'EKSTERNAL', 'LAINNYA'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            {canManageMusic && (
              <button
                type="button"
                onClick={() => setShowMusicForm(!showMusicForm)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
              >
                <Plus className="w-4 h-4" />
                Tambah Referensi Musik
              </button>
            )}
          </div>

          {showMusicForm && (
            <form
              onSubmit={handleSaveMusicRef}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={musicTitle}
                  onChange={(e) => setMusicTitle(e.target.value)}
                  placeholder="Judul lagu / instrumen..."
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
                <input
                  type="url"
                  value={musicUrl}
                  onChange={(e) => setMusicUrl(e.target.value)}
                  placeholder="URL Audio / YouTube / Drive..."
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={musicCategory}
                  onChange={(e) => setMusicCategory(e.target.value as MusicReference['category'])}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  {['PEMBUKA', 'PENUTUP', 'ILUSTRASI', 'TRANSISI', 'TARI', 'LAINNYA'].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  value={musicSource}
                  onChange={(e) => setMusicSource(e.target.value as MusicReference['source'])}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  {['SANDIMA', 'TRADISIONAL', 'MODERN', 'EKSTERNAL', 'LAINNYA'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={musicNotes}
                  onChange={(e) => setMusicNotes(e.target.value)}
                  placeholder="Catatan penggunaan..."
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowMusicForm(false)}
                  className="px-3 py-1.5 text-xs text-slate-500"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold"
                >
                  Simpan Referensi
                </button>
              </div>
            </form>
          )}

          {filteredMusic.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500">
              Belum ada referensi musik pada filter ini.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMusic.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
                        {m.title}
                      </h3>
                      <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400">
                        {m.category} · {m.source}
                      </span>
                    </div>
                    {m.notes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{m.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                    >
                      Putar / Buka <ExternalLink className="w-3 h-3" />
                    </a>
                    <div className="flex items-center gap-2">
                      {(isTeacherOrAdmin(user.role) || canManageMusic) && classes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => openCopyModal(m)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-amber-500"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Salin ke Kelas
                        </button>
                      )}
                      {canManageMusic &&
                        (confirmDeleteKey === `mr:${m.id}` ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await removeDocument('musicReferences', m.id);
                                  setConfirmDeleteKey(null);
                                  showToast('Referensi musik dihapus', 'info');
                                } catch (err) {
                                  showToast('Gagal menghapus referensi musik', 'error', err instanceof Error ? err.message : undefined);
                                }
                              }}
                              className="px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] font-semibold"
                            >
                              Hapus
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteKey(null)}
                              className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-[11px]"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteKey(`mr:${m.id}`)}
                            className="text-rose-500 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: LATIHAN DIALOG & PROMPT BOOK */}
      {activeTab === 'dialog' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 10-step guide + recorder */}
          <div className="lg:col-span-6 space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Mic className="w-5 h-5 text-amber-500" />
                  Rekaman Latihan Vokal & Intonasi
                </h2>
                <span className="font-mono tabular-nums text-xs font-semibold text-slate-500">
                  {Math.floor(recSeconds / 60)
                    .toString()
                    .padStart(2, '0')}
                  :{(recSeconds % 60).toString().padStart(2, '0')}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {!recording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
                  >
                    <Mic className="w-4 h-4" />
                    Mulai Rekam Dialog
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-bold cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                    Hentikan Rekaman
                  </button>
                )}
                {recordedUrl && (
                  <audio controls src={recordedUrl} className="h-9 max-w-full" />
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Putar ulang rekaman Anda untuk mengecek artikulasi, intonasi, dan kejelasan suara tanpa perlu mengunggah file.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  10 Langkah Latihan Dialog Standar
                </h2>
                <span className="font-mono tabular-nums text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {checkedSteps.length}/10 selesai
                </span>
              </div>
              <div className="space-y-2">
                {DIALOG_PRACTICE_STEPS.map((st) => {
                  const done = checkedSteps.includes(st.step);
                  return (
                    <button
                      key={st.step}
                      type="button"
                      onClick={() =>
                        setCheckedSteps((prev) =>
                          prev.includes(st.step)
                            ? prev.filter((x) => x !== st.step)
                            : [...prev, st.step]
                        )
                      }
                      className={`w-full text-left p-3 rounded-xl border transition-colors flex items-start gap-3 cursor-pointer ${
                        done
                          ? 'border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/20'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <span
                        className={`w-6 h-6 rounded-lg text-xs font-mono font-bold flex items-center justify-center shrink-0 ${
                          done
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {done ? <Check className="w-3.5 h-3.5" /> : st.step}
                      </span>
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{st.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {st.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Prompt Book */}
          <div className="lg:col-span-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-500" />
                Prompt Book & Catatan Blocking ({promptBooks.length})
              </h2>
              {canManageScript && (
                <button
                  type="button"
                  onClick={() => setShowPromptForm(!showPromptForm)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Adegan
                </button>
              )}
            </div>

            {showPromptForm && (
              <form
                onSubmit={handleSavePromptBook}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={pbSceneNumber}
                    onChange={(e) => setPbSceneNumber(e.target.value)}
                    placeholder="Adegan 1"
                    className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                  <input
                    type="text"
                    value={pbTitle}
                    onChange={(e) => setPbTitle(e.target.value)}
                    placeholder="Judul adegan..."
                    className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
                <textarea
                  rows={2}
                  value={pbBlocking}
                  onChange={(e) => setPbBlocking(e.target.value)}
                  placeholder="Posisi & arah gerak aktor (Stage Left / Center / Right)..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
                <input
                  type="text"
                  value={pbCues}
                  onChange={(e) => setPbCues(e.target.value)}
                  placeholder="Cue lampu, suara, & pergantian properti..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
                <input
                  type="text"
                  value={pbNotes}
                  onChange={(e) => setPbNotes(e.target.value)}
                  placeholder="Catatan sutradara..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPromptForm(false)}
                    className="px-3 py-1.5 text-xs text-slate-500"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold"
                  >
                    Simpan Prompt Book
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-3">
              {promptBooks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500">
                  Belum ada catatan adegan di Prompt Book.
                </div>
              ) : (
                promptBooks.map((pb) => (
                  <div
                    key={pb.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                          {pb.sceneNumber}
                        </span>
                        <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
                          {pb.title}
                        </h3>
                      </div>
                      {canManageScript &&
                        (confirmDeleteKey === `pb:${pb.id}` ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await removeDocument('promptBooks', pb.id);
                                  setConfirmDeleteKey(null);
                                  showToast('Adegan dihapus', 'info');
                                } catch (err) {
                                  showToast('Gagal menghapus adegan', 'error', err instanceof Error ? err.message : undefined);
                                }
                              }}
                              className="px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] font-semibold"
                            >
                              Hapus
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteKey(null)}
                              className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-[11px]"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteKey(`pb:${pb.id}`)}
                            className="text-rose-500 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ))}
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300">
                      <span className="font-semibold">Blocking:</span> {pb.blocking || '-'}
                    </p>
                    <p className="text-xs text-slate-700 dark:text-slate-300">
                      <span className="font-semibold">Cue Teknis:</span> {pb.cues || '-'}
                    </p>
                    {pb.notes && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                        {pb.notes} (oleh {pb.updatedBy})
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3-Step Music Copy Modal */}
      {copyItem && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                Salin Referensi Musik (Langkah {copyStep}/3)
              </h3>
              <button type="button" onClick={() => setCopyItem(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {copyStep === 1 && (
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  1. Pilih Kelas Tujuan
                </label>
                <select
                  value={copyTargetClassId}
                  onChange={(e) => setCopyTargetClassId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setCopyStep(2)}
                    className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold"
                  >
                    Lanjut
                  </button>
                </div>
              </div>
            )}

            {copyStep === 2 && (
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  2. Sesuaikan Judul di Kelas Tujuan
                </label>
                <input
                  type="text"
                  value={copyNewTitle}
                  onChange={(e) => setCopyNewTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={() => setCopyStep(1)}
                    className="px-3 py-2 text-xs font-semibold text-slate-500"
                  >
                    Kembali
                  </button>
                  <button
                    type="button"
                    onClick={() => setCopyStep(3)}
                    className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold"
                  >
                    Pratinjau
                  </button>
                </div>
              </div>
            )}

            {copyStep === 3 && (
              <div className="space-y-3">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 text-xs space-y-1">
                  <p>
                    <span className="font-semibold">Judul:</span> {copyNewTitle}
                  </p>
                  <p>
                    <span className="font-semibold">Kelas Tujuan:</span> {copyTargetClassId}
                  </p>
                  <p>
                    <span className="font-semibold">Kategori:</span> {copyItem.category} ·{' '}
                    {copyItem.source}
                  </p>
                </div>
                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={() => setCopyStep(2)}
                    className="px-3 py-2 text-xs font-semibold text-slate-500"
                  >
                    Kembali
                  </button>
                  <button
                    type="button"
                    disabled={copyBusy}
                    onClick={executeMusicCopy}
                    className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {copyBusy ? 'Menyalin...' : 'Salin Sekarang'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
