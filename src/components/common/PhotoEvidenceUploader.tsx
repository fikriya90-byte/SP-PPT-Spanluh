import React, { useState } from 'react';
import { Camera, Search, Trash2, Upload } from 'lucide-react';
import { containsForbiddenWords } from '../../core/constants';
import { PhotoEvidence } from '../../core/types';
import { compressImageToBase64 } from '../../utils/imageCompress';
import { useToast } from './Toast';

export type { PhotoEvidence };

export function checkPhotoContent(text: string): { ok: boolean; reason?: string } {
  const bad = containsForbiddenWords(text || '');
  if (bad) {
    return {
      ok: false,
      reason: `Keterangan atau nama file mengandung kata tidak pantas ("${bad}").`,
    };
  }
  return { ok: true };
}

interface Props {
  photos: PhotoEvidence[];
  onChange: (photos: PhotoEvidence[]) => void;
  verifiedAuthentic?: boolean;
  onVerifiedChange?: (v: boolean) => void;
  requirePhoto?: boolean;
  required?: boolean;
  maxPhotos?: number;
  hint?: string;
  searchQuery?: string;
}

export const PhotoEvidenceUploader: React.FC<Props> = ({
  photos,
  onChange,
  verifiedAuthentic,
  onVerifiedChange,
  requirePhoto = false,
  required = false,
  maxPhotos = 3,
  hint,
  searchQuery,
}) => {
  const { showToast } = useToast();
  const [caption, setCaption] = useState('');
  const [compressing, setCompressing] = useState(false);

  const isReq = requirePhoto || required;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (photos.length >= maxPhotos) {
      showToast(`Maksimal ${maxPhotos} foto bukti diperbolehkan`, 'warning');
      return;
    }

    const checkName = checkPhotoContent(file.name);
    const checkCaption = checkPhotoContent(caption);
    if (!checkName.ok || !checkCaption.ok) {
      showToast(
        'Kata tidak pantas terdeteksi',
        'error',
        checkName.reason || checkCaption.reason
      );
      return;
    }

    setCompressing(true);
    try {
      const dataUrl = await compressImageToBase64(file, 260);
      const item: PhotoEvidence = {
        id: `ph_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        dataUrl,
        caption: caption.trim() || file.name,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
      };
      onChange([...photos, item]);
      setCaption('');
      showToast('Foto bukti berhasil dikompres dan dilampirkan', 'success');
    } catch (err) {
      showToast('Gagal memproses foto', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setCompressing(false);
    }
  };

  const removePhoto = (id: string) => {
    onChange(photos.filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Foto Bukti Pelaksanaan {isReq ? '(Wajib)' : '(Opsional)'}
          </span>
        </div>
        <span className="text-xs font-mono tabular-nums text-slate-500">
          {photos.length}/{maxPhotos} foto
        </span>
      </div>

      {hint && (
        <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800/50">
          {hint}
        </p>
      )}

      {searchQuery && (
        <a
          href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchQuery)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
        >
          <Search className="w-3 h-3" />
          Cari contoh referensi foto: &ldquo;{searchQuery}&rdquo;
        </a>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <input
          type="text"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Keterangan singkat foto..."
          className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <label className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer transition-colors">
          <Upload className="w-4 h-4" />
          {compressing ? 'Mengompres...' : 'Pilih Foto'}
          <input
            type="file"
            accept="image/*"
            disabled={compressing || photos.length >= maxPhotos}
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {photos.map((p) => (
            <div
              key={p.id}
              className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
            >
              <img
                src={p.dataUrl}
                alt={p.caption}
                className="w-full h-28 object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="p-2 flex items-center justify-between gap-2">
                <p className="text-xs text-slate-700 dark:text-slate-300 truncate">{p.caption}</p>
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  className="text-rose-500 hover:text-rose-600 p-1 shrink-0"
                  aria-label="Hapus foto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {onVerifiedChange && (
        <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(verifiedAuthentic)}
            onChange={(e) => onVerifiedChange(e.target.checked)}
            className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-amber-500 focus:ring-amber-500"
          />
          <span className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Saya menyatakan bahwa foto bukti ini adalah dokumentasi asli hasil kerja pribadi/divisi pada produksi teater kelas ini.
          </span>
        </label>
      )}
    </div>
  );
};
