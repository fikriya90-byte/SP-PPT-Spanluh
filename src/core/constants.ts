import {
  AssessorCategory,
  CriterionDef,
  ModuleId,
  ProductionStage,
  RoleName,
} from './types';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'fikri.yassaar15@guru.smp.belajar.id';

export const SCHOOL_INFO = {
  appName: 'SP-PPT SAMARINDA',
  subtitle: 'Sistem Penilaian & Manajemen Proyek Produksi Teater Kelas IX',
  school: 'SMP Negeri 10 Samarinda',
  academicYear: 'T.A. 2025/2026',
  logoSchool: '/assets/aistudio/1000626431_4832d60c.png',
  logoMapel: '/assets/aistudio/1000626434_684c1e39.png',
};

export const APP_CONFIG = SCHOOL_INFO;

export const PRODUCTION_STAGES: ProductionStage[] = [
  'PERSIAPAN',
  'PELAKSANAAN',
  'PERTUNJUKAN',
  'PASCA',
];

export const STAGE_LABELS: Record<ProductionStage, { label: string; weight: number; summary: string }> = {
  PERSIAPAN: {
    label: 'Persiapan & Pra-Produksi',
    weight: 20,
    summary: 'Master timeline, perizinan, RAB final, konsep penyutradaraan, casting, sketsa panggung, cue awal.',
  },
  PELAKSANAAN: {
    label: 'Pelaksanaan & Latihan',
    weight: 35,
    summary: 'Latihan rutin, konstruksi set, pembuatan properti, potong-jahit-fitting kostum, uji rias, teaser.',
  },
  PERTUNJUKAN: {
    label: 'Pertunjukan & Pementasan',
    weight: 30,
    summary: 'Run-through penuh, technical rehearsal, gladi resik, dan pementasan hari-H.',
  },
  PASCA: {
    label: 'Pasca-Produksi & Evaluasi',
    weight: 15,
    summary: 'LPJ produksi, LPJ keuangan, pengembalian inventaris, arsip dokumentasi, dan refleksi.',
  },
};

export const STAGES = PRODUCTION_STAGES.map((id) => ({
  id,
  name: STAGE_LABELS[id].label,
  label: STAGE_LABELS[id].label,
  defaultWeight: STAGE_LABELS[id].weight,
  description: STAGE_LABELS[id].summary,
}));

export const DEFAULT_STAGE_WEIGHTS: Record<ProductionStage, number> = {
  PERSIAPAN: 20,
  PELAKSANAAN: 35,
  PERTUNJUKAN: 30,
  PASCA: 15,
};

export const DIVISIONS = [
  {
    id: 'inti',
    name: 'Pengurus Inti',
    color: 'amber',
    roles: ['Pimpinan Produksi', 'Sekretaris', 'Bendahara'] as RoleName[],
  },
  {
    id: 'pemeran',
    name: 'Pemeran & Penyutradaraan',
    color: 'rose',
    roles: ['Sutradara', 'Asisten Sutradara', 'Pemeran'] as RoleName[],
  },
  {
    id: 'perlengkapan',
    name: 'Perlengkapan',
    color: 'emerald',
    roles: ['Koordinator Perlengkapan', 'Anggota Perlengkapan'] as RoleName[],
  },
  {
    id: 'publikasi',
    name: 'Publikasi & Dokumentasi',
    color: 'blue',
    roles: ['Koordinator Publikasi', 'Anggota Publikasi'] as RoleName[],
  },
  {
    id: 'panggung',
    name: 'Tata Panggung',
    color: 'indigo',
    roles: ['Koordinator Tata Panggung', 'Anggota Tata Panggung'] as RoleName[],
  },
  {
    id: 'rias',
    name: 'Tata Rias',
    color: 'pink',
    roles: ['Koordinator Tata Rias', 'Anggota Tata Rias'] as RoleName[],
  },
  {
    id: 'busana',
    name: 'Tata Busana',
    color: 'purple',
    roles: ['Koordinator Tata Busana', 'Anggota Tata Busana'] as RoleName[],
  },
  {
    id: 'musik',
    name: 'Tata Musik & Suara',
    color: 'teal',
    roles: ['Koordinator Tata Musik', 'Anggota Tata Musik'] as RoleName[],
  },
];

export interface RoleMeta {
  role: RoleName;
  divisionId: string;
  divisionName: string;
  level: 'ADMIN' | 'GURU' | 'INTI' | 'SUTRADARA' | 'KOORDINATOR' | 'ANGGOTA' | 'PEMERAN';
  label: string;
}

export const ROLE_DEFINITIONS: RoleMeta[] = [
  { role: 'Super Admin', divisionId: 'admin', divisionName: 'Administrator', level: 'ADMIN', label: 'Super Admin' },
  { role: 'Admin', divisionId: 'admin', divisionName: 'Administrator', level: 'ADMIN', label: 'Admin' },
  { role: 'Guru Pengampu', divisionId: 'guru', divisionName: 'Pembimbing', level: 'GURU', label: 'Guru Pengampu' },
  { role: 'Pimpinan Produksi', divisionId: 'inti', divisionName: 'Pengurus Inti', level: 'INTI', label: 'Pimpinan Produksi' },
  { role: 'Sekretaris', divisionId: 'inti', divisionName: 'Pengurus Inti', level: 'INTI', label: 'Sekretaris' },
  { role: 'Bendahara', divisionId: 'inti', divisionName: 'Pengurus Inti', level: 'INTI', label: 'Bendahara' },
  { role: 'Sutradara', divisionId: 'pemeran', divisionName: 'Pemeran & Penyutradaraan', level: 'SUTRADARA', label: 'Sutradara' },
  { role: 'Asisten Sutradara', divisionId: 'pemeran', divisionName: 'Pemeran & Penyutradaraan', level: 'SUTRADARA', label: 'Asisten Sutradara' },
  { role: 'Koordinator Perlengkapan', divisionId: 'perlengkapan', divisionName: 'Perlengkapan', level: 'KOORDINATOR', label: 'Koordinator Perlengkapan' },
  { role: 'Koordinator Publikasi', divisionId: 'publikasi', divisionName: 'Publikasi & Dokumentasi', level: 'KOORDINATOR', label: 'Koordinator Publikasi' },
  { role: 'Koordinator Tata Panggung', divisionId: 'panggung', divisionName: 'Tata Panggung', level: 'KOORDINATOR', label: 'Koordinator Tata Panggung' },
  { role: 'Koordinator Tata Rias', divisionId: 'rias', divisionName: 'Tata Rias', level: 'KOORDINATOR', label: 'Koordinator Tata Rias' },
  { role: 'Koordinator Tata Busana', divisionId: 'busana', divisionName: 'Tata Busana', level: 'KOORDINATOR', label: 'Koordinator Tata Busana' },
  { role: 'Koordinator Tata Musik', divisionId: 'musik', divisionName: 'Tata Musik & Suara', level: 'KOORDINATOR', label: 'Koordinator Tata Musik' },
  { role: 'Anggota Perlengkapan', divisionId: 'perlengkapan', divisionName: 'Perlengkapan', level: 'ANGGOTA', label: 'Anggota Perlengkapan' },
  { role: 'Anggota Publikasi', divisionId: 'publikasi', divisionName: 'Publikasi & Dokumentasi', level: 'ANGGOTA', label: 'Anggota Publikasi' },
  { role: 'Anggota Tata Panggung', divisionId: 'panggung', divisionName: 'Tata Panggung', level: 'ANGGOTA', label: 'Anggota Tata Panggung' },
  { role: 'Anggota Tata Rias', divisionId: 'rias', divisionName: 'Tata Rias', level: 'ANGGOTA', label: 'Anggota Tata Rias' },
  { role: 'Anggota Tata Busana', divisionId: 'busana', divisionName: 'Tata Busana', level: 'ANGGOTA', label: 'Anggota Tata Busana' },
  { role: 'Anggota Tata Musik', divisionId: 'musik', divisionName: 'Tata Musik & Suara', level: 'ANGGOTA', label: 'Anggota Tata Musik' },
  { role: 'Pemeran', divisionId: 'pemeran', divisionName: 'Pemeran & Penyutradaraan', level: 'PEMERAN', label: 'Pemeran (Aktor / Aktris)' },
];

export const STUDENT_ROLES: RoleName[] = ROLE_DEFINITIONS
  .filter((r) => !['ADMIN', 'GURU'].includes(r.level))
  .map((r) => r.role);

export function normalizeUserRole(role?: string): RoleName {
  if (!role) return 'Pemeran';
  if (role === 'Guru Pembina') return 'Guru Pengampu';
  if (role === 'Pemain') return 'Pemeran';
  const found = ROLE_DEFINITIONS.find((r) => r.role === role);
  return found ? found.role : 'Pemeran';
}

export function isPemeranRole(role?: string): boolean {
  const norm = normalizeUserRole(role);
  return norm === 'Pemeran';
}

export function getRoleMeta(role: string): RoleMeta {
  const normalized = normalizeUserRole(role);
  return (
    ROLE_DEFINITIONS.find((r) => r.role === normalized) || {
      role: 'Pemeran',
      divisionId: 'pemeran',
      divisionName: 'Pemeran & Penyutradaraan',
      level: 'PEMERAN',
      label: role,
    }
  );
}

export function getDivisionFromRole(role: string): { id: string; name: string } {
  const meta = getRoleMeta(role);
  return { id: meta.divisionId, name: meta.divisionName };
}

export function isAdminRole(role?: string): boolean {
  return role === 'Super Admin' || role === 'Admin';
}

export function isTeacherOrAdmin(role?: string): boolean {
  return isAdminRole(role) || role === 'Guru Pengampu' || role === 'Guru Pembina';
}

export function isCoreCommitteeRole(role?: string): boolean {
  return (
    isTeacherOrAdmin(role) ||
    role === 'Pimpinan Produksi' ||
    role === 'Sekretaris' ||
    role === 'Bendahara' ||
    role === 'Sutradara' ||
    role === 'Asisten Sutradara'
  );
}

export function isCoordinatorRole(role?: string): boolean {
  return Boolean(role && role.startsWith('Koordinator '));
}

export function isCoordinatorOrAbove(role?: string): boolean {
  return isCoreCommitteeRole(role) || isCoordinatorRole(role);
}

export const SCORE_SCALE: Record<number, number> = {
  1: 40,
  2: 60,
  3: 80,
  4: 100,
};

export const SCORE_LABELS: Record<number, string> = {
  1: 'Kurang',
  2: 'Cukup',
  3: 'Baik',
  4: 'Sangat Baik',
};

export const AUTO_SCORE_THRESHOLDS = {
  attendanceFull: 90,
  attendanceGood: 75,
  taskOnTimeWeight: 0.7,
  taskLateWeight: 0.3,
  disciplineDefault: 85,
};

export const PEMERAN_CRITERIA: CriterionDef[] = [
  { key: 'hafalan_dialog', label: 'Hafalan Dialog', weight: 20, source: 'MANUAL', description: 'Ketepatan penguasaan naskah dan cue dialog.' },
  { key: 'penjiwaan', label: 'Penjiwaan Karakter', weight: 25, source: 'MANUAL', description: 'Ekspresi emosi, gestur, dan kedalaman tokoh.' },
  { key: 'proyeksi_suara', label: 'Proyeksi Suara', weight: 15, source: 'MANUAL', description: 'Artikulasi, intonasi, dan kekuatan vokal di panggung.' },
  { key: 'blocking', label: 'Blocking & Movement', weight: 15, source: 'MANUAL', description: 'Kesesuaian posisi panggung dan dinamika gerak.' },
  { key: 'interaksi', label: 'Interaksi Panggung', weight: 15, source: 'MANUAL', description: 'Chemistry dan responsivitas terhadap lawan main.' },
  { key: 'kedisiplinan', label: 'Kedisiplinan', weight: 10, source: 'AUTO_DISCIPLINE', description: 'Dihitung otomatis dari rata-rata tugas & presensi.' },
];

export const NON_PEMERAN_CRITERIA: CriterionDef[] = [
  { key: 'kerja_sama', label: 'Kerja Sama Tim', weight: 25, source: 'MANUAL', description: 'Kolaborasi aktif antaranggota dan lintas divisi.' },
  { key: 'tanggung_jawab', label: 'Tanggung Jawab', weight: 25, source: 'AUTO_TASK', description: 'Dihitung otomatis dari ketepatan pengumpulan tugas.' },
  { key: 'kehadiran', label: 'Kehadiran & Disiplin', weight: 20, source: 'AUTO_ATTENDANCE', description: 'Dihitung otomatis dari rekap presensi latihan & rapat.' },
  { key: 'kreativitas', label: 'Kreativitas', weight: 15, source: 'MANUAL', description: 'Inisiatif solusi dan orisinalitas karya artistik.' },
  { key: 'keahlian_teknis', label: 'Keahlian Teknis', weight: 15, source: 'MANUAL', description: 'Penguasaan teknis alat, bahan, atau manajerial divisi.' },
];

export const GENERAL_CRITERIA = NON_PEMERAN_CRITERIA;

export function getCriteriaForRole(role?: string): CriterionDef[] {
  return isPemeranRole(role) ? PEMERAN_CRITERIA : NON_PEMERAN_CRITERIA;
}

export const DEFAULT_ASSESSOR_WEIGHTS: Record<string, Record<AssessorCategory, number>> = {
  DEFAULT: { GURU: 40, ATASAN: 30, REKAN: 20, BAWAHAN: 10 },
  'Pimpinan Produksi': { GURU: 45, ATASAN: 0, REKAN: 30, BAWAHAN: 25 },
  Sutradara: { GURU: 45, ATASAN: 0, REKAN: 30, BAWAHAN: 25 },
  Sekretaris: { GURU: 40, ATASAN: 35, REKAN: 25, BAWAHAN: 0 },
  Bendahara: { GURU: 40, ATASAN: 35, REKAN: 25, BAWAHAN: 0 },
  'Asisten Sutradara': { GURU: 40, ATASAN: 35, REKAN: 15, BAWAHAN: 10 },
  Pemeran: { GURU: 40, ATASAN: 35, REKAN: 25, BAWAHAN: 0 },
};

export function getAssessorWeights(role: string): Record<AssessorCategory, number> {
  const norm = normalizeUserRole(role);
  return DEFAULT_ASSESSOR_WEIGHTS[norm] || DEFAULT_ASSESSOR_WEIGHTS.DEFAULT;
}

export interface AssessorMatrixEntry {
  ATASAN?: RoleName[];
  REKAN?: RoleName[];
  BAWAHAN?: RoleName[];
}

export const ASSESSMENT_MATRIX: Partial<Record<RoleName, AssessorMatrixEntry>> = {
  'Pimpinan Produksi': {
    ATASAN: [
      'Sekretaris',
      'Bendahara',
      'Koordinator Perlengkapan',
      'Koordinator Publikasi',
      'Koordinator Tata Panggung',
      'Koordinator Tata Rias',
      'Koordinator Tata Busana',
      'Koordinator Tata Musik',
    ],
    REKAN: ['Sutradara'],
  },
  Sutradara: {
    ATASAN: [
      'Asisten Sutradara',
      'Pemeran',
      'Koordinator Tata Panggung',
      'Koordinator Tata Rias',
      'Koordinator Tata Busana',
      'Koordinator Tata Musik',
    ],
    REKAN: ['Pimpinan Produksi'],
  },
  Sekretaris: {
    REKAN: ['Bendahara'],
    BAWAHAN: ['Pimpinan Produksi'],
  },
  Bendahara: {
    REKAN: ['Sekretaris'],
    BAWAHAN: ['Pimpinan Produksi'],
  },
  'Asisten Sutradara': {
    ATASAN: ['Pemeran'],
    BAWAHAN: ['Sutradara'],
  },
  'Koordinator Perlengkapan': {
    ATASAN: ['Anggota Perlengkapan'],
    REKAN: ['Koordinator Publikasi', 'Koordinator Tata Panggung'],
    BAWAHAN: ['Pimpinan Produksi'],
  },
  'Koordinator Publikasi': {
    ATASAN: ['Anggota Publikasi'],
    REKAN: ['Koordinator Perlengkapan', 'Koordinator Tata Musik'],
    BAWAHAN: ['Pimpinan Produksi'],
  },
  'Koordinator Tata Panggung': {
    ATASAN: ['Anggota Tata Panggung'],
    REKAN: ['Koordinator Perlengkapan', 'Koordinator Tata Musik'],
    BAWAHAN: ['Sutradara'],
  },
  'Koordinator Tata Rias': {
    ATASAN: ['Anggota Tata Rias'],
    REKAN: ['Koordinator Tata Busana'],
    BAWAHAN: ['Sutradara'],
  },
  'Koordinator Tata Busana': {
    ATASAN: ['Anggota Tata Busana'],
    REKAN: ['Koordinator Tata Rias'],
    BAWAHAN: ['Sutradara'],
  },
  'Koordinator Tata Musik': {
    ATASAN: ['Anggota Tata Musik'],
    REKAN: ['Koordinator Tata Panggung', 'Koordinator Publikasi'],
    BAWAHAN: ['Sutradara'],
  },
  'Anggota Perlengkapan': {
    REKAN: ['Anggota Perlengkapan'],
    BAWAHAN: ['Koordinator Perlengkapan'],
  },
  'Anggota Publikasi': {
    REKAN: ['Anggota Publikasi'],
    BAWAHAN: ['Koordinator Publikasi'],
  },
  'Anggota Tata Panggung': {
    REKAN: ['Anggota Tata Panggung'],
    BAWAHAN: ['Koordinator Tata Panggung'],
  },
  'Anggota Tata Rias': {
    REKAN: ['Anggota Tata Rias'],
    BAWAHAN: ['Koordinator Tata Rias'],
  },
  'Anggota Tata Busana': {
    REKAN: ['Anggota Tata Busana'],
    BAWAHAN: ['Koordinator Tata Busana'],
  },
  'Anggota Tata Musik': {
    REKAN: ['Anggota Tata Musik'],
    BAWAHAN: ['Koordinator Tata Musik'],
  },
  Pemeran: {
    REKAN: ['Pemeran'],
    BAWAHAN: ['Sutradara', 'Asisten Sutradara'],
  },
};

export function getAssessmentMatrix(role: string): AssessorMatrixEntry {
  const norm = normalizeUserRole(role);
  return ASSESSMENT_MATRIX[norm] || {};
}

export function getAssessorCategoryFor(
  assessorRole: string,
  targetRole: string
): AssessorCategory | null {
  if (isTeacherOrAdmin(assessorRole)) return 'GURU';
  const entry = getAssessmentMatrix(assessorRole);
  const normTarget = normalizeUserRole(targetRole);
  if (entry.ATASAN?.includes(normTarget)) return 'ATASAN';
  if (entry.REKAN?.includes(normTarget)) return 'REKAN';
  if (entry.BAWAHAN?.includes(normTarget)) return 'BAWAHAN';
  return null;
}

export function getPredikat(score: number): {
  predikat: string;
  label: string;
  color: string;
  badgeClass: string;
} {
  if (score >= 90) {
    return {
      predikat: 'A',
      label: 'Sangat Baik (SB)',
      color: 'text-emerald-600 dark:text-emerald-400',
      badgeClass: 'bg-emerald-500 text-white',
    };
  }
  if (score >= 80) {
    return {
      predikat: 'B',
      label: 'Baik (B)',
      color: 'text-blue-600 dark:text-blue-400',
      badgeClass: 'bg-blue-500 text-white',
    };
  }
  if (score >= 70) {
    return {
      predikat: 'C',
      label: 'Cukup (C)',
      color: 'text-amber-600 dark:text-amber-400',
      badgeClass: 'bg-amber-500 text-slate-950',
    };
  }
  return {
    predikat: 'D',
    label: 'Perlu Bimbingan (D)',
    color: 'text-rose-600 dark:text-rose-400',
    badgeClass: 'bg-rose-500 text-white',
  };
}

export const MUSIC_CUE_TYPES = [
  'Musik Pembuka (Overture)',
  'Musik Penutup',
  'Musik Pergantian Babak',
  'Musik Ilustrasi',
  'Musik Sound Track',
  'Musik Theme Song',
  'Musik Penokohan',
  'Musik Aksentuasi',
  'Musik Setting',
  'Musik Pelebur Emosi',
];

export const DIALOG_PRACTICE_STEPS = [
  { step: 1, title: 'Bedah Naskah & Subteks', desc: 'Identifikasi motivasi tokoh, konflik utama, dan perubahan emosi tiap adegan.' },
  { step: 2, title: 'Olahan Pernapasan Diafragma', desc: 'Tarik napas 4 detik, tahan 4 detik, embuskan dengan desis konsisten 12 detik.' },
  { step: 3, title: 'Senam Artikulasi & Vokal', desc: 'Latih kejelasan konsonan dan vokal (A-I-U-E-O) dengan pelafalan tegas.' },
  { step: 4, title: 'Tempo & Jeda Dramatik', desc: 'Atur ritme cepat-lambat serta jeda hening untuk membangun ketegangan adegan.' },
  { step: 5, title: 'Intonasi & Penekanan Kata Kunci', desc: 'Tandai kata kerja dan kata sifat utama pada setiap baris dialog.' },
  { step: 6, title: 'Proyeksi Jarak Panggung', desc: 'Uji keterdengaran suara dari jarak 10–15 meter tanpa berteriak.' },
  { step: 7, title: 'Sinkronisasi Gestur & Blocking', desc: 'Padukan kalimat dengan arah pandang, langkah kaki, dan sikap tubuh tokoh.' },
  { step: 8, title: 'Cue & Respons Lawan Main', desc: 'Masuk tepat pada akhir baris lawan main agar ritme panggung tidak kendur.' },
  { step: 9, title: 'Rekam & Evaluasi Mandiri', desc: 'Rekam suara Anda pada panel studio di bawah lalu dengarkan kembali kejernihannya.' },
  { step: 10, title: 'Uji Run-Through Tanpa Naskah', desc: 'Jalankan adegan utuh dari awal hingga akhir tanpa melihat skrip.' },
];

export const FORBIDDEN_WORDS = [
  'anjing', 'bangsat', 'tolol', 'goblok', 'bego', 'kampret', 'bajingan', 'asu', 'kontol', 'memek',
];

export function containsForbiddenWords(text: string): string | null {
  const lower = text.toLowerCase();
  for (const word of FORBIDDEN_WORDS) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(lower)) {
      return word;
    }
  }
  return null;
}

export function canAccessModule(role: RoleName, moduleId: ModuleId): boolean {
  if (role === 'Super Admin' || role === 'Admin') return true;
  if (role === 'Guru Pengampu' || (role as string) === 'Guru Pembina') {
    return !['admin', 'welcome-broadcast', 'debug-users'].includes(moduleId);
  }
  const teacherOnly: ModuleId[] = [
    'moderasi',
    'rekap-nilai',
    'kelola-siswa',
    'kelola-kelas',
    'kelola-tahapan',
    'jadwal-penilaian',
    'statistik-absensi',
    'activity-calendar',
    'backup',
    'template-hub',
    'inter-class',
    'admin',
    'welcome-broadcast',
    'debug-users',
  ];
  if (teacherOnly.includes(moduleId)) return false;

  if (moduleId === 'rab') {
    return ['Pimpinan Produksi', 'Bendahara', 'Sekretaris', 'Sutradara'].includes(role);
  }
  if (moduleId === 'director-timeline') {
    return [
      'Pimpinan Produksi',
      'Sekretaris',
      'Sutradara',
      'Asisten Sutradara',
      'Pemeran',
      'Koordinator Tata Panggung',
      'Koordinator Tata Rias',
      'Koordinator Tata Busana',
      'Koordinator Tata Musik',
    ].includes(role);
  }
  if (moduleId === 'content-schedule') {
    return [
      'Pimpinan Produksi',
      'Sekretaris',
      'Sutradara',
      'Koordinator Publikasi',
      'Anggota Publikasi',
    ].includes(role);
  }
  return true;
}
