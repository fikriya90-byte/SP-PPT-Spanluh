import React, { useState } from 'react';
import { Camera, Link2, Loader2, Upload, X } from 'lucide-react';
import { compressImageToBase64 } from '../../utils/imageCompress';
import { useToast } from './Toast';

interface PhotoUploadModalProps {
  currentPhotoUrl?: string;
  userName?: string;
  onSave: (photoUrl: string) => Promise<void> | void;
  onClose: () => void;
}

export const PhotoUploadModal: React.FC<PhotoUploadModalProps> = ({
  currentPhotoUrl = '',
  userName = 'Pengguna',
  onSave,
  onClose,
}) => {
  const { showToast } = useToast();
  const [previewUrl, setPreviewUrl] = useState(currentPhotoUrl);
  const [urlInput, setUrlInput] = useState(
    currentPhotoUrl.startsWith('http') ? currentPhotoUrl : ''
  );
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('File harus berupa gambar.', 'warning');
      return;
    }
    setProcessing(true);
    try {
      const base64 = await compressImageToBase64(file, 240);
      setPreviewUrl(base64);
      setUrlInput('');
    } catch (err) {
      showToast('Gagal memproses foto', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setProcessing(false);
    }
  };

  const handleApplyUrl = () => {
    if (!urlInput.trim().startsWith('http')) {
      showToast('URL harus diawali http:// atau https://', 'warning');
      return;
    }
    setPreviewUrl(urlInput.trim());
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onSave(previewUrl);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Unggah Foto — {userName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex flex-col items-center gap-3">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={userName}
                className="w-28 h-28 rounded-2xl object-cover border-2 border-amber-400 shadow-md"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-28 h-28 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 border border-dashed border-slate-300 dark:border-slate-700">
                <Camera className="w-8 h-8" />
              </div>
            )}

            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs cursor-pointer transition">
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span>{processing ? 'Mengompres...' : 'Pilih dari Galeri / Kamera'}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={processing}
                className="hidden"
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Atau gunakan URL gambar langsung
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
              <button
                type="button"
                onClick={handleApplyUrl}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Pratinjau
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={saving || processing}
            onClick={handleConfirm}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50"
          >
            {saving ? 'Menyimpan...' : 'Simpan Foto'}
          </button>
        </div>
      </div>
    </div>
  );
};
