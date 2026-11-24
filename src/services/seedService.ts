import { collection, doc, getDoc, getDocs, limit, query, writeBatch } from 'firebase/firestore';
import { DEFAULT_ASSESSOR_WEIGHTS, DEFAULT_STAGE_WEIGHTS, getRoleMeta } from '../core/constants';
import { DEFAULT_DRIVE_FOLDERS } from '../core/driveFolders';
import { RoleName, UserProfile } from '../core/types';
import { db } from './firebase';
import { createDefaultStageManager } from './firestoreService';

const DEMO_DOC_PATHS: [string, string][] = [
  ['productions', 'prod_ix_a'],
  ['broadcasts', 'bc_welcome_ixa'],
  ['attendanceSessions', 'att_rapat_perdana'],
  ['schedules', 'sch_reading_1'],
  ['deadlines', 'dl_master_timeline'],
  ['deadlines', 'dl_hafal_babak1'],
  ['kasSettings', 'kas_bulan_1'],
  ['properties', 'prop_perahu_kayu'],
  ['musicCues', 'cue_overture_mahakam'],
  ['faceCharts', 'fc_tokoh_ibu'],
  ['costumes', 'cos_tokoh_ayah'],
  ['rabItems', 'rab_kain_backdrop'],
  ['scripts', 'scr_pesut_mahakam'],
  ['promptBooks', 'pb_adegan_1'],
  ['notulensi', 'not_rapat_1'],
  ['documents', 'doc_proposal_produksi'],
  ['timelineWeeks', 'tw_minggu_1'],
];

const SEED_STUDENTS: { uid: string; name: string; role: RoleName; nis: string; phone: string; email: string }[] = [
  { uid: 'demo_stu_pimpro', name: 'Nadia Safira', role: 'Pimpinan Produksi', nis: '20250901', phone: '081254001001', email: 'nadia.safira@siswa.smpn10smd.sch.id' },
  { uid: 'demo_stu_sekre', name: 'Raka Pratama', role: 'Sekretaris', nis: '20250902', phone: '081254001002', email: 'raka.pratama@siswa.smpn10smd.sch.id' },
  { uid: 'demo_stu_bend', name: 'Siti Aulia Rahma', role: 'Bendahara', nis: '20250903', phone: '081254001003', email: 'siti.aulia@siswa.smpn10smd.sch.id' },
  { uid: 'demo_stu_sutra', name: 'Dimas Aditya Putra', role: 'Sutradara', nis: '20250904', phone: '081254001004', email: 'dimas.aditya@siswa.smpn10smd.sch.id' },
  { uid: 'demo_stu_assut', name: 'Kayla Maharani', role: 'Asisten Sutradara', nis: '20250905', phone: '081254001005', email: 'kayla.maharani@siswa.smpn10smd.sch.id' },
  { uid: 'demo_stu_koor_per', name: 'Bagas Kurniawan', role: 'Koordinator Perlengkapan', nis: '20250906', phone: '081254001006', email: 'bagas.kurniawan@siswa.smpn10smd.sch.id' },
  { uid: 'demo_stu_koor_pub', name: 'Zahra Putri', role: 'Koordinator Publikasi', nis: '20250907', phone: '081254001007', email: 'zahra.putri@siswa.smpn10smd.sch.id' },
  { uid: 'demo_stu_koor_pang', name: 'Fajar Ramadhan', role: 'Koordinator Tata Panggung', nis: '20250908', phone: '081254001008', email: 'fajar.ramadhan@siswa.smpn10smd.sch.id' },
  { uid: 'demo_stu_koor_rias', name: 'Intan Permata', role: 'Koordinator Tata Rias', nis: '20250909', phone: '081254001009', email: 'intan.permata@siswa.smpn10smd.sch.id' },
  { uid: 'demo_stu_koor_bus', name: 'Cinta Larasati', role: 'Koordinator Tata Busana', nis: '20250910', phone: '081254001010', email: 'cinta.larasati@siswa.smpn10smd.sch.id' },
  { uid: 'demo_stu_koor_mus', name: 'Gilang Mahendra', role: 'Koordinator Tata Musik', nis: '20250911', phone: '081254001011', email: 'gilang.mahendra@siswa.smpn10smd.sch.id' },
  { uid: 'demo_stu_pem_1', name: 'Alifia Nurul', role: 'Pemeran', nis: '20250912', phone: '081254001012', email: 'alifia.nurul@siswa.smpn10smd.sch.id' },
  { uid: 'demo_stu_pem_2', name: 'Reza Alfarizi', role: 'Pemeran', nis: '20250913', phone: '081254001013', email: 'reza.alfarizi@siswa.smpn10smd.sch.id' },
  { uid: 'demo_stu_ang_per', name: 'Teguh Wijaya', role: 'Anggota Perlengkapan', nis: '20250914', phone: '081254001014', email: 'teguh.wijaya@siswa.smpn10smd.sch.id' },
];

export async function ensureSeededForClass(adminUser: UserProfile, force = false): Promise<boolean> {
  if (!force) {
    const [seedStatusSnap, anyClassSnap] = await Promise.all([
      getDoc(doc(db, 'systemConfig', 'seedStatus')).catch(() => null),
      getDocs(query(collection(db, 'classes'), limit(1))).catch(() => null),
    ]);
    if (seedStatusSnap?.exists() && seedStatusSnap.data()?.skipAutoSeed === true) {
      return false;
    }
    if (anyClassSnap && !anyClassSnap.empty) {
      return false;
    }
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const in2Days = new Date(Date.now() + 2 * 86400000).toISOString();
  const in5Days = new Date(Date.now() + 5 * 86400000).toISOString();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const batch = writeBatch(db);

  // 1. Classes IX-A & IX-B
  batch.set(doc(db, 'classes', 'IX-A'), {
    id: 'IX-A',
    name: 'Kelas IX-A',
    code: 'TEATER-IXA-2026',
    troupeName: 'Sanggar Mahakam IX-A',
    troupeLogo: '',
    teacherId: adminUser.uid,
    academicYear: '2025/2026',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'classes', 'IX-B'), {
    id: 'IX-B',
    name: 'Kelas IX-B',
    code: 'TEATER-IXB-2026',
    troupeName: 'Teater Pesut IX-B',
    troupeLogo: '',
    teacherId: adminUser.uid,
    academicYear: '2025/2026',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  // 2. Configs for IX-A & IX-B
  const stageCfg = createDefaultStageManager();
  batch.set(doc(db, 'classes', 'IX-A', 'config', 'stageManager'), {
    ...stageCfg,
    updatedBy: adminUser.uid,
    updatedByName: adminUser.name,
  });
  batch.set(doc(db, 'classes', 'IX-B', 'config', 'stageManager'), {
    ...stageCfg,
    updatedBy: adminUser.uid,
    updatedByName: adminUser.name,
  });

  batch.set(doc(db, 'classes', 'IX-A', 'config', 'assessorWeights'), {
    id: 'assessorWeights',
    stageWeights: DEFAULT_STAGE_WEIGHTS,
    roleWeights: DEFAULT_ASSESSOR_WEIGHTS,
    updatedAt: now,
  });

  batch.set(doc(db, 'systemConfig', 'driveFolders'), {
    id: 'driveFolders',
    folders: DEFAULT_DRIVE_FOLDERS,
    updatedAt: now,
  });

  // 3. Production
  batch.set(doc(db, 'productions', 'prod_ix_a'), {
    id: 'prod_ix_a',
    classId: 'IX-A',
    title: 'Legenda Pesut Mahakam',
    synopsis: 'Kisah rakyat Kalimantan Timur tentang keluarga di tepian Sungai Mahakam yang mengajarkan kejujuran, kerja keras, dan harmoni dengan alam.',
    stage: 'PERSIAPAN',
    performanceDate: new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10),
    venue: 'Aula Utama SMP Negeri 10 Samarinda',
    createdAt: now,
  });

  // 4. Demo students (non-PII + isolated PII)
  for (const s of SEED_STUDENTS) {
    const meta = getRoleMeta(s.role);
    batch.set(doc(db, 'users', s.uid), {
      uid: s.uid,
      name: s.name,
      role: s.role,
      divisionId: meta.divisionId,
      divisionName: meta.divisionName,
      classId: 'IX-A',
      classIds: ['IX-A'],
      photoUrl: '',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    batch.set(doc(db, 'userPrivate', s.uid), {
      uid: s.uid,
      email: s.email,
      phone: s.phone,
      nis: s.nis,
      classId: 'IX-A',
      updatedAt: now,
    });
  }

  // 5. Broadcasts
  batch.set(doc(db, 'broadcasts', 'bc_welcome_ixa'), {
    id: 'bc_welcome_ixa',
    classId: 'IX-A',
    title: 'Pembukaan Proyek Produksi Teater T.A. 2025/2026',
    message: 'Selamat datang di SP-PPT SMP Negeri 10 Samarinda. Seluruh pengurus inti dan koordinator divisi harap melengkapi dokumen tahap PERSIAPAN serta melakukan presensi pada setiap sesi latihan.',
    senderId: adminUser.uid,
    senderName: adminUser.name,
    senderRole: adminUser.role,
    priority: 'HIGH',
    createdAt: now,
  });

  // 6. Attendance session
  batch.set(doc(db, 'attendanceSessions', 'att_rapat_perdana'), {
    id: 'att_rapat_perdana',
    classId: 'IX-A',
    stage: 'PERSIAPAN',
    date: today,
    title: 'Rapat Pleno Pembagian Divisi & Bedah Naskah',
    activityType: 'Rapat',
    targetScope: 'SEMUA',
    isOpen: true,
    createdBy: adminUser.uid,
    creatorName: adminUser.name,
    creatorRole: adminUser.role,
    createdAt: now,
  });

  // 7. Schedules
  batch.set(doc(db, 'schedules', 'sch_reading_1'), {
    id: 'sch_reading_1',
    classId: 'IX-A',
    title: 'Reading Naskah Babak 1 & Casting Final',
    startAt: `${tomorrow}T14:00:00`,
    endAt: `${tomorrow}T16:00:00`,
    location: 'Ruang Seni Budaya SMPN 10 Samarinda',
    type: 'Latihan',
    notes: 'Bawa naskah cetak dan alat tulis untuk menandai blocking awal.',
    createdBy: adminUser.uid,
    createdAt: now,
  });

  // 8. Deadlines
  batch.set(doc(db, 'deadlines', 'dl_master_timeline'), {
    id: 'dl_master_timeline',
    classId: 'IX-A',
    stage: 'PERSIAPAN',
    title: 'Finalisasi Master Timeline & Pembagian Kerja Divisi',
    description: 'Unggah ringkasan jadwal target tiap divisi selama 4 minggu ke depan.',
    dueDate: in2Days,
    priority: 'CRITICAL',
    targetScope: 'SEMUA',
    isCritical: true,
    status: 'PENDING',
    reference: 'Panduan Produksi Bab 1',
    deadlineRef: 'TPL-PREP-01',
    createdBy: adminUser.uid,
    createdAt: now,
  });

  batch.set(doc(db, 'deadlines', 'dl_hafal_babak1'), {
    id: 'dl_hafal_babak1',
    classId: 'IX-A',
    stage: 'PERSIAPAN',
    title: 'Hafalan Dialog Babak 1 Pemeran Utama',
    description: 'Pemeran wajib menguasai dialog pembuka tanpa melihat teks naskah.',
    dueDate: in5Days,
    priority: 'HIGH',
    targetScope: 'PERAN',
    targetRole: 'Pemeran',
    isCritical: true,
    status: 'PENDING',
    reference: 'Naskah Babak 1',
    deadlineRef: 'TPL-PREP-06',
    createdBy: adminUser.uid,
    createdAt: now,
  });

  // 9. Kas period
  batch.set(doc(db, 'kasSettings', 'kas_bulan_1'), {
    id: 'kas_bulan_1',
    classId: 'IX-A',
    title: 'Iuran Produksi Tahap Persiapan',
    amount: 15000,
    period: 'Bulan 1',
    active: true,
    deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    createdBy: adminUser.uid,
    createdAt: now,
  });

  // 10. Artistic division items
  batch.set(doc(db, 'properties', 'prop_perahu_kayu'), {
    id: 'prop_perahu_kayu',
    classId: 'IX-A',
    name: 'Dayung Kayu & Jala Nelayan Mahakam',
    scene: 'Adegan 1 - Tepian Sungai',
    description: '2 buah dayung bambu/kayu ringan dan jala rajut warna cokelat alami.',
    status: 'PROSES',
    assignedTo: 'Bagas Kurniawan',
    notes: 'Cat finishing doff agar tidak memantulkan lampu panggung.',
    createdAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'musicCues', 'cue_overture_mahakam'), {
    id: 'cue_overture_mahakam',
    classId: 'IX-A',
    scene: 'Prolog & Pembukaan',
    cueType: 'Musik Pembuka (Overture)',
    title: 'Sape Mahakam Ambient & Gemericik Air',
    audioUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    volume: 75,
    duration: '02:15',
    notes: 'Fade in perlahan saat lampu panggung mulai menyala.',
    createdAt: now,
  });

  batch.set(doc(db, 'faceCharts', 'fc_tokoh_ibu'), {
    id: 'fc_tokoh_ibu',
    classId: 'IX-A',
    characterName: 'Ibu Halimah',
    actorName: 'Alifia Nurul',
    moodboard: [],
    designNotes: 'Rias karakter ibu desa pesisir: bedak natural matte, garis ekspresi halus, sanggul tradisional sederhana.',
    products: 'Foundation natural, contour cokelat hangat, lip tint nude matte',
    status: 'APPROVED',
    createdAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'costumes', 'cos_tokoh_ayah'), {
    id: 'cos_tokoh_ayah',
    classId: 'IX-A',
    actorName: 'Reza Alfarizi',
    characterName: 'Pak Rahman (Nelayan)',
    design: [],
    measurements: { LD: '92 cm', LP: '78 cm', tinggi: '168 cm' },
    status: 'DESAIN',
    notes: 'Kemeja tenun hitam-merah khas Samarinda + celana komprang gelap.',
    createdAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'rabItems', 'rab_kain_backdrop'), {
    id: 'rab_kain_backdrop',
    classId: 'IX-A',
    division: 'Tata Panggung',
    category: 'Material Set',
    itemName: 'Kain Belacu & Cat Akrilik Backdrop Sungai',
    quantity: 4,
    unitPrice: 35000,
    totalPrice: 140000,
    status: 'DISETUJUI',
    notes: 'Untuk backdrop utama 4x3 meter.',
    createdAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'scripts', 'scr_pesut_mahakam'), {
    id: 'scr_pesut_mahakam',
    classId: 'IX-A',
    title: 'Naskah Final — Legenda Pesut Mahakam (Rev 1)',
    url: 'https://drive.google.com/',
    notes: 'Naskah standar 4 babak untuk durasi pementasan 35 menit.',
    uploadedBy: adminUser.uid,
    uploaderName: adminUser.name,
    createdAt: now,
  });

  batch.set(doc(db, 'promptBooks', 'pb_adegan_1'), {
    id: 'pb_adegan_1',
    classId: 'IX-A',
    sceneNumber: 'Adegan 1',
    title: 'Pagi di Tepian Sungai Mahakam',
    blocking: 'Pak Rahman masuk dari Stage Left membawa jala; Ibu Halimah berada di Center Stage menampi beras.',
    cues: 'Sound Cue #1 (Sape Ambient fade in 5s) -> Lampu Warm Amber 70%.',
    notes: 'Jaga jarak antar aktor minimal 1,5 meter agar komposisi panggung seimbang.',
    updatedBy: adminUser.name,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'notulensi', 'not_rapat_1'), {
    id: 'not_rapat_1',
    classId: 'IX-A',
    title: 'Notulen Rapat Perdana Panitia Produksi IX-A',
    date: today,
    startTime: '14:00',
    endTime: '15:30',
    location: 'Ruang Kelas IX-A SMPN 10 Samarinda',
    agenda: 'Penetapan naskah, struktur kerabat kerja, dan jadwal latihan rutin.',
    discussion: 'Seluruh divisi menyepakati lakon Legenda Pesut Mahakam dan latihan rutin setiap Selasa & Kamis sepulang sekolah.',
    decisions: '1. Kas produksi ditetapkan Rp15.000/siswa.\n2. Target reading naskah selesai dalam 5 hari.',
    attendees: SEED_STUDENTS.slice(0, 6).map((s) => s.uid),
    createdBy: adminUser.uid,
    creatorName: adminUser.name,
    creatorRole: adminUser.role,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'documents', 'doc_proposal_produksi'), {
    id: 'doc_proposal_produksi',
    classId: 'IX-A',
    title: 'Proposal Pementasan Teater Kelas IX-A',
    url: 'https://drive.google.com/',
    category: 'Proposal',
    uploadedBy: adminUser.uid,
    uploaderName: adminUser.name,
    createdAt: now,
  });

  batch.set(doc(db, 'timelineWeeks', 'tw_minggu_1'), {
    id: 'tw_minggu_1',
    classId: 'IX-A',
    weekLabel: 'Minggu 1',
    title: 'Pra-Produksi, Casting & Desain Divisi',
    date: today,
    stage: 'PERSIAPAN',
    division: 'Semua Divisi',
    notes: 'Penetapan konsep artistik dan pengumpulan RAB awal.',
    createdAt: now,
  });

  batch.set(doc(db, 'systemConfig', 'seedStatus'), {
    skipAutoSeed: false,
    seededAt: now,
    updatedAt: now,
  });

  await batch.commit();
  return true;
}

export async function clearDemoSeedData(actor: UserProfile): Promise<number> {
  const batch = writeBatch(db);
  let deleted = 0;

  for (const s of SEED_STUDENTS) {
    batch.delete(doc(db, 'users', s.uid));
    batch.delete(doc(db, 'userPrivate', s.uid));
    deleted += 2;
  }

  for (const [col, docId] of DEMO_DOC_PATHS) {
    batch.delete(doc(db, col, docId));
    deleted++;
  }

  batch.set(doc(db, 'systemConfig', 'seedStatus'), {
    skipAutoSeed: true,
    clearedBy: actor.uid,
    updatedAt: new Date().toISOString(),
  });

  await batch.commit();
  return deleted;
}

