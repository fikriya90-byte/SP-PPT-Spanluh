import React, { useMemo, useState } from 'react';
import { BookOpen, CheckSquare, MessageCircle, Search, UserCheck } from 'lucide-react';
import {
  DIVISIONS,
  STAGE_LABELS,
  getAssessmentMatrix,
  getRoleMeta,
  isCoordinatorRole,
  isCoreCommitteeRole,
  isTeacherOrAdmin,
} from '../../core/constants';
import { UserProfile } from '../../core/types';
import { buildWhatsAppUrl } from '../../utils/imageCompress';

const FAQ_ITEMS = [
  {
    cat: 'Login & Akun',
    q: 'Bagaimana cara mendaftar sebagai siswa baru?',
    a: 'Klik "Daftar Siswa" pada halaman masuk, masukkan Kode Kelas Resmi dari Guru Pengampu (contoh: TEATER-IXA-2026), lalu pilih peran produksi Anda. Anda juga dapat langsung masuk menggunakan akun Google.',
  },
  {
    cat: 'Presensi',
    q: 'Apa yang terjadi jika saya lupa mengisi presensi sebelum sesi ditutup?',
    a: 'Ketika Sekretaris atau Guru menutup sesi presensi, sistem otomatis mencatat status Alpa bagi anggota yang belum mengisi. Ketidakhadiran pada Gladi atau Pementasan akan membatasi skor kehadiran maksimal 2.',
  },
  {
    cat: 'Tugas & Deadline',
    q: 'Mengapa saya wajib mengunggah foto saat tahap PELAKSANAAN?',
    a: 'Pada tahap Pelaksanaan, bukti foto latihan, pembuatan properti, fitting kostum, atau uji rias diperlukan sebagai verifikasi otentik progres lapangan sebelum nilai tanggung jawab dihitung.',
  },
  {
    cat: 'Nilai & Rapor 360°',
    q: 'Mengapa halaman Rapor Saya terkunci?',
    a: 'Terdapat 2 gerbang (gate): (1) Anda harus menyelesaikan seluruh penilaian rekan/atasan pada tahap aktif di menu Penilaian 360, dan (2) Jadwal Rapor sedang dibuka oleh Guru Pengampu.',
  },
  {
    cat: 'Kas & RAB',
    q: 'Bagaimana alur pembayaran kas produksi dan pengajuan RAB?',
    a: 'Bendahara membuka periode kas. Setelah Anda membayar, Bendahara mencentang status lunas. Untuk RAB, Bendahara menginput item per divisi -> disetujui Pimpinan Produksi/Guru -> dibayar -> realisasi nota.',
  },
  {
    cat: 'Booking Alat',
    q: 'Kapan saya boleh mengajukan peminjaman alat sekolah?',
    a: 'Pengajuan dilakukan melalui modul Booking Alat minimal H-2 sebelum jadwal pakai, disertai foto serah terima saat mengambil (Check-out) dan mengembalikan (Return).',
  },
];

const GLOSSARY = [
  { term: 'Penilaian 360°', def: 'Evaluasi multi-arah dari Guru Pengampu, Atasan langsung, Rekan sejawat, dan Anggota bawahan.' },
  { term: 'Auto-Score', def: 'Komponen nilai Tanggung Jawab, Kehadiran, dan Kedisiplinan yang dihitung otomatis dari ketepatan tugas dan rekap absensi.' },
  { term: 'Peer Gate', def: 'Syarat wajib mengisi seluruh penilaian rekan sebelum siswa dapat melihat Rapor Nilai pribadi.' },
  { term: 'Cue Sheet', def: 'Daftar urutan masuknya musik, efek suara, atau tata cahaya berdasarkan nomor adegan.' },
  { term: 'Face Chart', def: 'Peta desain tata rias wajah per karakter sebelum diterapkan pada pemeran.' },
  { term: 'Prompt Book', def: 'Buku panduan utama Sutradara dan Asisten Sutradara berisi catatan blocking dan cue adegan.' },
];

function getRoleChecklist(role: string): string[] {
  if (isTeacherOrAdmin(role)) {
    return [
      'Tetapkan tanggal aktif dan jadwal penilaian pada menu Kelola Tahapan & Jadwal Penilaian.',
      'Distribusikan template tugas sesuai tahap aktif melalui Template Hub.',
      'Pantau progres pengumpulan tugas, presensi, serta moderasi nilai 360°.',
    ];
  }
  if (role === 'Pimpinan Produksi') {
    return [
      'Susun Master Timeline lintas tahap produksi bersama Sekretaris dan Sutradara.',
      'Pantau progres tugas semua divisi dan validasi pengajuan RAB.',
      'Lengkapi penilaian 360° untuk seluruh koordinator divisi, Sekretaris, Bendahara, dan Sutradara.',
    ];
  }
  if (role === 'Sekretaris') {
    return [
      'Kelola notulensi rapat produksi dan arsip dokumen kelas di Google Drive.',
      'Bantu membuka/menutup sesi presensi serta mencatat kehadiran anggota yang berhalangan.',
      'Perbarui jadwal latihan kelas pada menu Jadwal dan Master Timeline.',
    ];
  }
  if (role === 'Bendahara') {
    return [
      'Buat periode tagihan kas dan catat status pelunasan tiap anggota kelas.',
      'Catat pemasukan dan pengeluaran di Buku Kas Produksi lengkap dengan bukti nota.',
      'Susun RAB Produksi per divisi dan ekspor laporan keuangan.',
    ];
  }
  if (role === 'Sutradara' || role === 'Asisten Sutradara') {
    return [
      'Susun Timeline Sutradara untuk target blocking, latihan adegan, hingga gladi.',
      'Lengkapi Prompt Book dan unggah referensi naskah di Studio Latihan.',
      'Lakukan penilaian 360° terhadap pemeran dan koordinator divisi artistik.',
    ];
  }
  if (isCoordinatorRole(role)) {
    return [
      'Buat jadwal kerja internal divisi di menu Jadwal Divisi.',
      'Pantau progres kerja anggota dan ajukan booking alat minimal H-2.',
      'Isi penilaian 360° terhadap anggota divisi, koordinator rekan, dan atasan.',
    ];
  }
  return [
    'Cek Tugas & Deadline setiap hari dan unggah bukti foto sesuai instruksi tahap.',
    'Isi presensi sebelum sesi latihan/rapat ditutup agar tidak tercatat Alpa.',
    'Selesaikan seluruh target di Penilaian 360° agar Rapor Saya dapat dibuka.',
  ];
}

export const GuideModule: React.FC<{ classMembers: UserProfile[]; user?: UserProfile }> = ({
  classMembers,
  user,
}) => {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('Semua');

  const teachers = classMembers.filter((m) =>
    ['Guru Pengampu', 'Admin', 'Super Admin'].includes(m.role)
  );

  const roleGuide = useMemo(() => {
    if (!user) return null;
    const meta = getRoleMeta(user.role);
    const division = DIVISIONS.find((d) => d.id === meta.divisionId);
    const matrix = getAssessmentMatrix(user.role);
    const checklist = getRoleChecklist(user.role);
    return { meta, division, matrix, checklist };
  }, [user]);

  const filteredFaq = useMemo(() => {
    const q = search.trim().toLowerCase();
    return FAQ_ITEMS.filter((item) => {
      if (cat !== 'Semua' && item.cat !== cat) return false;
      if (!q) return true;
      return item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q);
    });
  }, [search, cat]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
          Panduan & Dokumentasi SP-PPT
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Alur kerja 4 tahap produksi teater, glosarium istilah, dan tanya jawab penggunaan aplikasi.
        </p>
      </div>

      {/* Panduan Peran Saya */}
      {user && roleGuide && (
        <div className="rounded-2xl border border-amber-300/70 dark:border-amber-800/60 bg-white/95 dark:bg-slate-900/95 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Panduan Peran Saya: {user.role}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Divisi: <span className="font-semibold text-slate-700 dark:text-slate-200">{roleGuide.meta.divisionName}</span>
                  {isCoreCommitteeRole(user.role) && ' · Pengurus Inti / Pimpinan'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-2">
              <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5 text-amber-500" />
                Checklist Tanggung Jawab Utama
              </p>
              <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
                {roleGuide.checklist.map((item) => (
                  <li key={item} className="leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-2">
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                Peta Penilaian 360° untuk Peran Ini
              </p>
              {isTeacherOrAdmin(user.role) ? (
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Sebagai pembimbing, Anda menilai seluruh peran produksi pada kategori <strong className="text-amber-600 dark:text-amber-400">GURU</strong> dan memiliki kewenangan penuh melakukan moderasi serta membuka jadwal rapor.
                </p>
              ) : (
                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <p>
                    <strong className="text-slate-800 dark:text-slate-200">Dinilai oleh Guru:</strong> Seluruh peran mendapat evaluasi bobot utama dari Guru Pengampu.
                  </p>
                  <p>
                    <strong className="text-slate-800 dark:text-slate-200">Target Menilai Atasan/Bawahan:</strong>{' '}
                    {[
                      ...(roleGuide.matrix.ATASAN || []),
                      ...(roleGuide.matrix.BAWAHAN || []),
                    ].join(', ') || 'Tidak ada'}
                  </p>
                  <p>
                    <strong className="text-slate-800 dark:text-slate-200">Target Menilai Rekan Sejawat:</strong>{' '}
                    {(roleGuide.matrix.REKAN || []).join(', ') || 'Tidak ada'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4 Production Stages */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(Object.keys(STAGE_LABELS) as (keyof typeof STAGE_LABELS)[]).map((st, idx) => (
          <div
            key={st}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4"
          >
            <p className="text-xs font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
              0{idx + 1}. {st} · Bobot {STAGE_LABELS[st].weight}%
            </p>
            <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
              {STAGE_LABELS[st].label}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
              {STAGE_LABELS[st].summary}
            </p>
          </div>
        ))}
      </div>

      {/* Search & FAQ */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-500" />
            Pertanyaan Umum (FAQ)
          </h3>
          <div className="relative sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari topik bantuan..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {['Semua', 'Login & Akun', 'Presensi', 'Tugas & Deadline', 'Nilai & Rapor 360°', 'Kas & RAB', 'Booking Alat'].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                cat === c
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filteredFaq.map((f) => (
            <div key={f.q} className="py-3">
              <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">{f.cat}</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{f.q}</p>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Glossary + Teacher Support */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <h3 className="font-display font-bold text-base text-slate-900 dark:text-white mb-3">
            Glosarium Istilah Produksi
          </h3>
          <div className="space-y-3">
            {GLOSSARY.map((g) => (
              <div key={g.term}>
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{g.term}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{g.def}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
            Kontak Bantuan Guru Pengampu
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Jika mengalami kendala akun, perubahan peran, atau jadwal produksi, hubungi pembimbing kelas melalui WhatsApp.
          </p>
          <div className="space-y-2 pt-1">
            {teachers.length === 0 ? (
              <p className="text-xs text-slate-500">Belum ada kontak guru terdaftar.</p>
            ) : (
              teachers.map((t) => (
                <div
                  key={t.uid}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.role}</p>
                  </div>
                  <a
                    href={buildWhatsAppUrl(t.phone, `Halo ${t.name}, saya butuh bantuan terkait SP-PPT.`)}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Hubungi WA
                  </a>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
