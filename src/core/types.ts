export type ProductionStage = 'PERSIAPAN' | 'PELAKSANAAN' | 'PERTUNJUKAN' | 'PASCA';

export type AssessorCategory = 'GURU' | 'ATASAN' | 'REKAN' | 'BAWAHAN';

export type RoleName =
  | 'Super Admin'
  | 'Admin'
  | 'Guru Pengampu'
  | 'Pimpinan Produksi'
  | 'Sekretaris'
  | 'Bendahara'
  | 'Sutradara'
  | 'Asisten Sutradara'
  | 'Koordinator Perlengkapan'
  | 'Koordinator Publikasi'
  | 'Koordinator Tata Panggung'
  | 'Koordinator Tata Rias'
  | 'Koordinator Tata Busana'
  | 'Koordinator Tata Musik'
  | 'Anggota Perlengkapan'
  | 'Anggota Publikasi'
  | 'Anggota Tata Panggung'
  | 'Anggota Tata Rias'
  | 'Anggota Tata Busana'
  | 'Anggota Tata Musik'
  | 'Pemeran';

export type UserRole = RoleName;

export type DivisionType =
  | 'Pengurus Inti'
  | 'Pemeran'
  | 'Pemeran & Penyutradaraan'
  | 'Perlengkapan'
  | 'Publikasi & Dokumentasi'
  | 'Tata Panggung'
  | 'Tata Rias'
  | 'Tata Busana'
  | 'Tata Musik & Suara'
  | 'Pembimbing'
  | 'Administrator';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ModuleId =
  | 'dashboard'
  | 'informasi'
  | 'notifikasi'
  | 'absensi'
  | 'jadwal'
  | 'master-timeline'
  | 'director-timeline'
  | 'division-schedule'
  | 'content-schedule'
  | 'tugas'
  | 'kas'
  | 'nilai-saya'
  | 'nilai'
  | 'moderasi'
  | 'rekap-nilai'
  | 'kelola-siswa'
  | 'kelola-kelas'
  | 'kelola-tahapan'
  | 'jadwal-penilaian'
  | 'statistik-absensi'
  | 'properti'
  | 'musik-cue'
  | 'face-chart'
  | 'kostum'
  | 'rab'
  | 'booking'
  | 'booking-calendar'
  | 'studio'
  | 'struktur'
  | 'notulensi'
  | 'broadcast'
  | 'dokumen'
  | 'aduan'
  | 'activity-calendar'
  | 'activity-log'
  | 'backup'
  | 'template-hub'
  | 'panduan'
  | 'settings'
  | 'admin'
  | 'welcome-broadcast'
  | 'inter-class'
  | 'debug-users';

export interface UserProfile {
  uid: string;
  name: string;
  displayName?: string;
  role: RoleName;
  divisionId: string;
  divisionName: string;
  classId: string;
  className?: string;
  classIds?: string[];
  photoUrl?: string;
  photoURL?: string;
  email?: string;
  phone?: string;
  nis?: string;
  isActive: boolean;
  isPasswordReset?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserPrivate {
  uid: string;
  email: string;
  phone?: string;
  nis?: string;
  classId: string;
  updatedAt: string;
}

export interface UserCredential {
  uid: string;
  email: string;
  tempPassword?: string;
  classId: string;
  className?: string;
  createdBy?: string;
  updatedAt: string;
}

export interface SchoolClass {
  id: string;
  name: string;
  code: string;
  troupeName?: string;
  kerabatKerja?: string;
  troupeLogo?: string;
  teacherId?: string;
  academicYear?: string;
  theme?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ClassRoom = SchoolClass;

export interface StageDeadlineConfig {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  enabled: boolean;
  notes?: string;
  assessmentEnabled?: boolean;
  assessmentStartDate?: string;
  assessmentStartTime?: string;
  assessmentEndDate?: string;
  assessmentEndTime?: string;
}

export interface StageManagerConfig {
  id?: string;
  currentStage: ProductionStage;
  stageDeadlines: Record<ProductionStage, StageDeadlineConfig>;
  updatedAt: string;
  updatedBy?: string;
  updatedByName?: string;
}

export interface AssessorWeightsConfig {
  id?: string;
  stageWeights: Record<ProductionStage, number>;
  roleWeights: Record<string, Record<AssessorCategory, number>>;
  updatedAt: string;
}

export interface DriveFolderItem {
  id: string;
  name: string;
  url: string;
  access: 'EDITOR' | 'VIEWER';
  picRole: string;
  description: string;
}

export interface Production {
  id: string;
  classId: string;
  title: string;
  synopsis?: string;
  stage: ProductionStage;
  performanceDate?: string;
  venue?: string;
  createdAt: string;
}

export interface BroadcastItem {
  id: string;
  classId: string;
  title: string;
  message: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  priority: 'NORMAL' | 'HIGH' | 'URGENT';
  isGlobal?: boolean;
  createdAt: string;
}

export interface InformationItem {
  id: string;
  classId: string;
  batchId?: string;
  title: string;
  content: string;
  category: 'PENGUMUMAN' | 'INFO' | 'URGENT' | 'JADWAL' | 'KEUANGAN';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  isPinned: boolean;
  photoUrls?: string[];
  photoUrl?: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  createdAt: string;
  updatedAt?: string;
}

export type NotificationCategory =
  | 'Tugas'
  | 'Feedback'
  | 'Reminder'
  | 'Pengumuman'
  | 'Nilai'
  | 'Urgent'
  | 'Sistem'
  | 'Keuangan';

export interface NotificationItem {
  id: string;
  userId: string;
  classId: string;
  title: string;
  message: string;
  category: NotificationCategory;
  read: boolean;
  link: string;
  createdAt: string;
}

export type TargetScope = 'SEMUA' | 'PEMAIN_MUSIK' | 'PENGURUS_INTI' | 'DIVISI' | 'PERAN' | 'CUSTOM';

export interface AttendanceSession {
  id: string;
  classId: string;
  stage: ProductionStage;
  date: string;
  title: string;
  activityType: 'Rapat' | 'Latihan' | 'Gladi' | 'Pementasan' | 'Briefing' | 'Evaluasi' | 'Lainnya';
  targetScope: TargetScope;
  targetDivision?: string;
  targetRole?: string;
  targetRoles?: string[];
  targetDivisions?: string[];
  targetUserIds?: string[];
  isOpen: boolean;
  createdBy: string;
  creatorName: string;
  creatorRole: string;
  createdAt: string;
  closedAt?: string;
  autoMarkedCount?: number;
  expectedCount?: number;
}

export type AttendanceStatus = 'Hadir' | 'Izin' | 'Sakit' | 'Alpa';

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  classId: string;
  status: AttendanceStatus;
  timestamp: string;
  isOnBehalf?: boolean;
  filledBy?: string;
  filledByName?: string;
  filledByRole?: string;
  autoMarked?: boolean;
  autoMarkedAt?: string;
}

export interface ScheduleItem {
  id: string;
  classId: string;
  title: string;
  startAt: string;
  endAt: string;
  location: string;
  type: 'Rapat Pleno' | 'Latihan' | 'Gladi' | 'Pementasan' | 'Divisi' | 'Lainnya';
  divisionName?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export type ScheduleEvent = ScheduleItem;

export interface ScheduleConfirmation {
  id: string;
  scheduleId: string;
  classId: string;
  userId: string;
  userName: string;
  status: 'HADIR' | 'BERHALANGAN';
  updatedAt: string;
  createdAt: string;
}

export interface PhotoEvidence {
  id: string;
  dataUrl: string;
  caption: string;
  fileName?: string;
  uploadedAt: string;
}

export interface DeadlineTask {
  id: string;
  classId: string;
  stage: ProductionStage;
  stageId?: ProductionStage;
  title: string;
  description: string;
  dueDate: string;
  priority: TaskPriority;
  targetScope: 'SEMUA' | 'PERAN' | 'DIVISI' | 'CUSTOM';
  targetRole?: string;
  targetDivision?: string;
  targetRoles?: string[];
  targetDivisions?: string[];
  targetUserIds?: string[];
  isCritical: boolean;
  isManual?: boolean;
  status: 'PENDING' | 'HOLD' | 'CANCELLED' | string;
  holdReason?: string;
  heldAt?: string;
  heldBy?: string;
  cancelReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  reference?: string;
  deadlineRef?: string;
  photoHint?: string;
  photoSearchQuery?: string;
  carriedOverFrom?: ProductionStage;
  createdBy: string;
  creatorName?: string;
  creatorRole?: string;
  createdAt: string;
}

export type DeadlineItem = DeadlineTask;

export interface TaskItem {
  id: string;
  classId: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'PENDING' | 'COMPLETED';
  progress?: number;
  dueDate?: string;
  divisionName?: string;
  role?: string;
  assigneeId?: string;
  isCritical?: boolean;
  stageId?: ProductionStage;
  createdBy?: string;
  creatorName?: string;
  createdAt?: string;
}

export interface DeadlineSubmission {
  id: string;
  deadlineId: string;
  studentId: string;
  studentName: string;
  classId: string;
  status: 'BELUM' | 'SELESAI' | 'TERLAMBAT';
  submittedAt: string;
  feedback?: string;
  feedbackScore?: number;
  feedbackBy?: string;
  notes?: string;
  linkUrl?: string;
  photos?: PhotoEvidence[];
  verifiedAuthentic?: boolean;
  // Legacy compatibility fields
  completed?: boolean;
  progress?: number;
  evidencePhotos?: PhotoEvidence[];
  proofUrl?: string;
  proofNote?: string;
  rating?: number;
  reviewNote?: string;
}

export interface KasSetting {
  id: string;
  classId: string;
  title: string;
  amount: number;
  period: string;
  periodType?: 'WEEKLY' | 'MONTHLY' | 'ONCE';
  active: boolean;
  deadline: string;
  createdBy: string;
  createdAt: string;
}

export interface KasPeriod {
  id: string;
  kasId?: string;
  classId: string;
  periodNumber?: number;
  title?: string;
  label?: string;
  amount?: number;
  periodType?: 'WEEKLY' | 'BIWEEKLY' | 'TEN_DAYS' | 'MONTHLY' | 'MANUAL' | 'ONCE';
  startDate?: string;
  endDate?: string;
  dueDate?: string;
  deadline?: string;
  active?: boolean;
  createdBy?: string;
  createdAt: string;
}

export interface KasPayment {
  id: string;
  kasId: string;
  periodId?: string;
  studentId: string;
  studentName: string;
  classId: string;
  paid: boolean;
  paidAt?: string;
  amount?: number;
  notes?: string;
  recordedBy?: string;
  verifiedBy?: string;
  recordedAt?: string;
  createdAt: string;
}

export interface CashEntry {
  id: string;
  classId: string;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  category: string;
  targetName?: string;
  itemName?: string;
  qty?: number;
  unit?: string;
  description?: string;
  notes?: string;
  date: string;
  receiptUrl?: string;
  recordedBy?: string;
  recorderName?: string;
  createdBy?: string;
  creatorName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CriterionDef {
  key: string;
  label: string;
  weight: number;
  source: 'MANUAL' | 'AUTO_TASK' | 'AUTO_ATTENDANCE' | 'AUTO_DISCIPLINE';
  description: string;
}

export interface Assessment {
  id: string;
  classId: string;
  productionId: string;
  studentId: string;
  studentName: string;
  studentRole: string;
  studentDivision: string;
  assessorId: string;
  assessorName: string;
  assessorRole: string;
  assessorCategory: AssessorCategory;
  stage: ProductionStage;
  scores: Record<string, number>;
  autoScores: {
    tanggung_jawab?: number;
    kehadiran?: number;
    kedisiplinan?: number;
  };
  totalScore: number;
  comment: string;
  isFinal: boolean;
  version: number;
  validatedBy?: string;
  validatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type AssessmentRecord = Assessment;

export interface AssessmentHistory {
  id: string;
  classId: string;
  assessmentId: string;
  studentId: string;
  studentName: string;
  editedBy: string;
  editedByName: string;
  action: 'UPDATE' | 'DELETE' | 'VALIDATE';
  previousScore?: number;
  newScore?: number;
  reason?: string;
  createdAt: string;
}

export interface PropertyItem {
  id: string;
  classId: string;
  name: string;
  scene: string;
  description: string;
  status: 'BELUM' | 'PROSES' | 'SELESAI';
  assignedTo?: string;
  notes?: string;
  photoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MusicCue {
  id: string;
  classId: string;
  scene: string;
  cueType: string;
  title: string;
  audioUrl: string;
  volume: number;
  duration: string;
  notes?: string;
  createdAt: string;
}

export interface FaceChart {
  id: string;
  classId: string;
  characterName: string;
  actorName: string;
  moodboard: string[];
  designNotes: string;
  products: string;
  status: 'DRAFT' | 'APPROVED' | 'APPLIED';
  createdAt: string;
  updatedAt: string;
}

export interface CostumeItem {
  id: string;
  classId: string;
  actorName: string;
  characterName: string;
  design: string[];
  measurements: {
    LD?: string;
    LP?: string;
    tinggi?: string;
    ukuranSepatu?: string;
    catatan?: string;
  };
  status: 'BELUM' | 'DESAIN' | 'POTONG' | 'JAHIT' | 'FITTING' | 'SELESAI';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScriptItem {
  id: string;
  classId: string;
  title: string;
  url: string;
  notes?: string;
  uploadedBy: string;
  uploaderName: string;
  createdAt: string;
}

export interface MusicReference {
  id: string;
  classId: string;
  title: string;
  url: string;
  category: 'PEMBUKA' | 'PENUTUP' | 'ILUSTRASI' | 'TRANSISI' | 'TARI' | 'LAINNYA';
  source: 'SANDIMA' | 'TRADISIONAL' | 'MODERN' | 'EKSTERNAL' | 'LAINNYA';
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface PromptBookScene {
  id: string;
  classId: string;
  sceneNumber: string;
  title: string;
  blocking: string;
  cues: string;
  notes?: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RabItem {
  id: string;
  classId: string;
  division: string;
  category: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status: 'ESTIMASI' | 'DISETUJUI' | 'DIBAYAR' | 'REALISASI';
  notes?: string;
  createdAt: string;
  updatedAt: string;
  // Legacy compatibility fields
  targetName?: string;
  qty?: number;
  unit?: string;
}

export interface RabDocument {
  id: string;
  classId: string;
  title: string;
  url: string;
  notes?: string;
  uploadedBy?: string;
  uploaderName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface EquipmentItem {
  id: string;
  classId: string;
  name: string;
  category: string;
  quantity: number;
  condition: 'BAIK' | 'RUSAK_RINGAN' | 'RUSAK_BERAT';
  notes: string;
  isCustom?: boolean;
  isSchoolWide?: boolean;
  addedByName?: string;
  createdAt?: string;
}

export interface BookingItem {
  id: string;
  sessionId?: string;
  classId: string;
  className?: string;
  equipmentId?: string;
  equipmentName: string;
  equipmentCategory?: string;
  purpose: string;
  bookerName: string;
  bookerId: string;
  bookedBy?: string;
  bookerRole?: string;
  bookerDivision?: string;
  bookerPhone?: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'CHECKED_OUT' | 'RETURNED' | 'OVERDUE';
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  rejectionGuidance?: string;
  recommendedDate?: string;
  recommendedStartTime?: string;
  recommendedEndTime?: string;
  checkedOutAt?: string;
  checkoutPhotoUrl?: string;
  checkoutNote?: string;
  returnedAt?: string;
  returnPhotoUrl?: string;
  returnCondition?: 'BAIK' | 'RUSAK_RINGAN' | 'RUSAK_BERAT';
  returnNote?: string;
  isLateReturn?: boolean;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelledReason?: string;
  verifierNote?: string;
  wasRescheduledByVerifier?: boolean;
  originalStartTime?: string;
  originalEndTime?: string;
  photoOut?: string;
  photoIn?: string;
  notes?: string;
  createdAt: string;
}

export interface NotulensiItem {
  id: string;
  classId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  agenda: string;
  discussion: string;
  decisions: string;
  attendees: string[];
  attachmentUrl?: string;
  attachmentName?: string;
  createdBy: string;
  creatorName: string;
  creatorRole: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentItem {
  id: string;
  classId: string;
  title: string;
  url?: string;
  fileUrl?: string;
  fileSize?: number;
  fileType?: string;
  category: 'Naskah' | 'Proposal' | 'RAB' | 'LPJ' | 'Notulen' | 'Foto/Video' | 'Lainnya' | string;
  uploadedBy: string;
  uploaderName: string;
  uploaderRole?: string;
  createdAt: string;
}

export type ProductionDocument = DocumentItem;

export interface ComplaintItem {
  id: string;
  classId: string;
  studentId: string;
  studentName: string;
  subject?: string;
  title?: string;
  message?: string;
  description?: string;
  category?: string;
  evidenceUrl?: string;
  isAnonymous: boolean;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  teacherResponse?: string;
  respondedBy?: string;
  respondedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export type StudentComplaint = ComplaintItem;

export interface TimelineConfig {
  id: string;
  classId: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  createdBy: string;
  creatorName: string;
  createdAt: string;
  updatedAt?: string;
}

export interface TimelineWeek {
  id: string;
  classId: string;
  timelineId?: string;
  weekNumber?: number;
  startDate?: string;
  endDate?: string;
  label?: string;
  weekLabel?: string;
  title: string;
  description?: string;
  phase?: ProductionStage;
  stage?: ProductionStage;
  status?: 'PLANNED' | 'ONGOING' | 'DONE';
  date?: string;
  division?: string;
  notes?: string;
  createdBy?: string;
  creatorName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface DirectorTimelineItem {
  id: string;
  classId: string;
  title: string;
  date: string;
  phase: 'Latihan' | 'Gladi' | 'Pementasan' | 'Evaluasi' | string;
  notes?: string;
  authorId?: string;
  authorName: string;
  authorRole: string;
  createdAt: string;
}

export interface DivisionScheduleItem {
  id: string;
  classId: string;
  divisionName: string;
  title: string;
  description?: string;
  date: string;
  time?: string;
  location?: string;
  authorId?: string;
  authorName: string;
  authorRole: string;
  createdAt: string;
}

export type ContentScheduleStatus = 'DRAFT' | 'APPROVED' | 'POSTED';

export interface ContentScheduleItem {
  id: string;
  classId: string;
  category: string;
  title: string;
  platform: string;
  date: string;
  status: ContentScheduleStatus;
  pic: string;
  notes: string;
  authorName: string;
  authorId: string;
  createdAt: string;
  updatedAt?: string;
}

export interface InterClassEvent {
  id: string;
  classId: string;
  title: string;
  date: string;
  location: string;
  involvedClassIds: string[];
  waGroupUrl?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface CrossClassBroadcast {
  id: string;
  title: string;
  content: string;
  priority?: 'NORMAL' | 'HIGH' | 'URGENT';
  senderId: string;
  senderName: string;
  targetClassIds?: string[];
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  userId: string;
  userName: string;
  role: string;
  action: 'LOGIN' | 'LOGOUT' | 'CREATE' | 'UPDATE' | 'DELETE' | 'ASSESS' | 'SUBMIT';
  targetType: string;
  targetId: string;
  details: string;
  timestamp: string;
}
