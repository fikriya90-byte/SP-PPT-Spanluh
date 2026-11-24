import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || 'Terjadi kesalahan sistem.' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isQuotaError =
      this.state.message.includes('Quota exceeded') ||
      this.state.message.includes('resource-exhausted');

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="max-w-lg w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm">
          <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 mb-4">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {isQuotaError ? 'Kuota Harian Database Tercapai' : 'Terjadi Kendala Aplikasi'}
            </h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
            {isQuotaError
              ? 'Batas baca/tulis harian Firestore Free Tier telah tercapai dan akan reset pada hari berikutnya. Anda dapat memeriksa detail kuota pada konsol Firebase.'
              : 'Aplikasi mendeteksi gangguan tak terduga saat memuat data. Silakan muat ulang halaman untuk melanjutkan.'}
          </p>
          <pre className="text-xs font-mono bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-slate-700 dark:text-slate-300 overflow-x-auto mb-6 max-h-40">
            {this.state.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Muat Ulang Halaman
          </button>
        </div>
      </div>
    );
  }
}
