import {
  ASSESSMENT_MATRIX,
  DEFAULT_STAGE_WEIGHTS,
  NON_PEMERAN_CRITERIA,
  PEMERAN_CRITERIA,
  SCORE_SCALE,
  getAssessorWeights,
  isTeacherOrAdmin,
} from '../core/constants';
import {
  Assessment,
  AssessorCategory,
  AttendanceRecord,
  AttendanceSession,
  CriterionDef,
  DeadlineSubmission,
  DeadlineTask,
  ProductionStage,
  RoleName,
  StageDeadlineConfig,
  UserProfile,
} from '../core/types';

export function getTaskStage(task: Pick<DeadlineTask, 'stage' | 'stageId'>): ProductionStage {
  const raw = String(task.stage || task.stageId || 'PERSIAPAN').toUpperCase();
  if (raw.includes('LAKSANA') || raw === 'TAHAP_2') return 'PELAKSANAAN';
  if (raw.includes('TUNJUK') || raw.includes('PENTAS') || raw === 'TAHAP_3') return 'PERTUNJUKAN';
  if (raw.includes('PASCA') || raw === 'TAHAP_4') return 'PASCA';
  return 'PERSIAPAN';
}

export function isSubmissionDone(sub?: DeadlineSubmission | null): boolean {
  if (!sub) return false;
  if (sub.status === 'SELESAI' || sub.status === 'TERLAMBAT') return true;
  if (sub.completed === true) return true;
  if (typeof sub.progress === 'number' && sub.progress >= 100) return true;
  return false;
}

export function isTaskRelevantToUser(task: DeadlineTask, user: UserProfile): boolean {
  if (task.status === 'CANCELLED') return false;
  const userRole = (user.role as string) === 'Pemain' ? 'Pemeran' : user.role;
  const matchesRole = (r?: string) => {
    if (!r) return false;
    const norm = r === 'Pemain' ? 'Pemeran' : r === 'Guru Pembina' ? 'Guru Pengampu' : r;
    return norm === userRole || r === user.role;
  };
  switch (task.targetScope) {
    case 'SEMUA':
      return true;
    case 'PERAN':
      if (matchesRole(task.targetRole)) return true;
      if (task.targetRoles && task.targetRoles.some((r) => matchesRole(r))) return true;
      return false;
    case 'DIVISI':
      if (task.targetDivision && task.targetDivision === user.divisionName) return true;
      if (task.targetDivisions && task.targetDivisions.includes(user.divisionName)) return true;
      return false;
    case 'CUSTOM': {
      const hasTargets =
        Boolean(task.targetRoles?.length) ||
        Boolean(task.targetDivisions?.length) ||
        Boolean(task.targetUserIds?.length);
      if (!hasTargets) return true;
      if (task.targetRoles?.some((r) => matchesRole(r))) return true;
      if (task.targetDivisions?.includes(user.divisionName)) return true;
      if (task.targetUserIds?.includes(user.uid)) return true;
      return false;
    }
    default:
      return true;
  }
}

export function isSessionRelevantToUser(session: AttendanceSession, user: UserProfile): boolean {
  switch (session.targetScope) {
    case 'SEMUA':
      return true;
    case 'PEMAIN_MUSIK':
      return user.role === 'Pemeran' || user.divisionName === 'Tata Musik & Suara';
    case 'PENGURUS_INTI':
      return user.divisionName === 'Pengurus Inti' || user.role === 'Sutradara' || user.role === 'Asisten Sutradara';
    case 'DIVISI':
      if (session.targetDivision && session.targetDivision === user.divisionName) return true;
      if (session.targetDivisions && session.targetDivisions.includes(user.divisionName)) return true;
      return false;
    case 'PERAN':
      if (session.targetRole && session.targetRole === user.role) return true;
      if (session.targetRoles && session.targetRoles.includes(user.role)) return true;
      return false;
    case 'CUSTOM': {
      const hasTargets =
        Boolean(session.targetRoles?.length) ||
        Boolean(session.targetDivisions?.length) ||
        Boolean(session.targetUserIds?.length);
      if (!hasTargets) return true;
      if (session.targetRoles?.includes(user.role)) return true;
      if (session.targetDivisions?.includes(user.divisionName)) return true;
      if (session.targetUserIds?.includes(user.uid)) return true;
      return false;
    }
    default:
      return true;
  }
}

export interface TaskAutoResult {
  score: 1 | 2 | 3 | 4;
  totalTasks: number;
  onTimeCount: number;
  lateCount: number;
  missedCount: number;
  criticalMissed: number;
  pctOnTime: number;
}

export function computeTaskResponsibility(
  student: UserProfile,
  tasks: DeadlineTask[],
  submissions: DeadlineSubmission[],
  stage: ProductionStage
): TaskAutoResult {
  const relevant = tasks.filter((t) => getTaskStage(t) === stage && isTaskRelevantToUser(t, student));
  if (relevant.length === 0) {
    return {
      score: 3,
      totalTasks: 0,
      onTimeCount: 0,
      lateCount: 0,
      missedCount: 0,
      criticalMissed: 0,
      pctOnTime: 100,
    };
  }

  let onTimeCount = 0;
  let lateCount = 0;
  let missedCount = 0;
  let criticalMissed = 0;
  let criticalLate = 0;

  for (const task of relevant) {
    const sub = submissions.find((s) => s.deadlineId === task.id && s.studentId === student.uid);
    if (!sub || !isSubmissionDone(sub)) {
      missedCount++;
      if (task.isCritical) criticalMissed++;
      continue;
    }
    if (sub.status === 'TERLAMBAT') {
      lateCount++;
      if (task.isCritical) criticalLate++;
      continue;
    }
    const dueMs = new Date(task.dueDate).getTime();
    const subMs = new Date(sub.submittedAt || '').getTime();
    if (Number.isNaN(dueMs) || Number.isNaN(subMs)) {
      onTimeCount++;
      continue;
    }
    const diffDays = (subMs - dueMs) / (1000 * 60 * 60 * 24);
    if (diffDays <= 0.5) {
      onTimeCount++;
    } else {
      lateCount++;
      if (task.isCritical && diffDays > 2) criticalLate++;
    }
  }

  const pctOnTime = Math.round((onTimeCount / relevant.length) * 100);
  let score: 1 | 2 | 3 | 4 = 1;
  if (criticalMissed > 0) {
    score = 1;
  } else if (pctOnTime >= 90 && criticalLate === 0) {
    score = 4;
  } else if (pctOnTime >= 75 && criticalLate === 0) {
    score = 3;
  } else if (pctOnTime >= 50) {
    score = 2;
  }

  return {
    score,
    totalTasks: relevant.length,
    onTimeCount,
    lateCount,
    missedCount,
    criticalMissed,
    pctOnTime,
  };
}

export interface AttendanceAutoResult {
  score: 1 | 2 | 3 | 4;
  totalSessions: number;
  hadir: number;
  izinSakit: number;
  alpa: number;
  fatalAlpa: boolean;
  pctAttendance: number;
}

export function computeAttendanceScore(
  student: UserProfile,
  sessions: AttendanceSession[],
  records: AttendanceRecord[],
  stage: ProductionStage
): AttendanceAutoResult {
  const relevant = sessions.filter((s) => {
    const stg = (s.stage || (s as unknown as { stageId?: string }).stageId || 'PERSIAPAN') as ProductionStage;
    return stg === stage && isSessionRelevantToUser(s, student);
  });
  if (relevant.length === 0) {
    return {
      score: 3,
      totalSessions: 0,
      hadir: 0,
      izinSakit: 0,
      alpa: 0,
      fatalAlpa: false,
      pctAttendance: 100,
    };
  }

  let hadir = 0;
  let izinSakit = 0;
  let alpa = 0;
  let fatalAlpa = false;

  for (const session of relevant) {
    const rec = records.find((r) => r.sessionId === session.id && r.studentId === student.uid);
    if (!rec) {
      if (!session.isOpen) {
        alpa++;
        if (session.activityType === 'Gladi' || session.activityType === 'Pementasan') {
          fatalAlpa = true;
        }
      }
      continue;
    }
    if (rec.status === 'Hadir') {
      hadir++;
    } else if (rec.status === 'Izin' || rec.status === 'Sakit') {
      izinSakit++;
    } else if (rec.status === 'Alpa') {
      alpa++;
      if (session.activityType === 'Gladi' || session.activityType === 'Pementasan') {
        fatalAlpa = true;
      }
    }
  }

  const pctAttendance = Math.round(((hadir + izinSakit) / relevant.length) * 100);
  let score: 1 | 2 | 3 | 4 = 1;
  if (pctAttendance >= 95) score = 4;
  else if (pctAttendance >= 85) score = 3;
  else if (pctAttendance >= 70) score = 2;
  else score = 1;

  if ((alpa >= 3 || fatalAlpa) && score > 2) {
    score = 2;
  }

  return {
    score,
    totalSessions: relevant.length,
    hadir,
    izinSakit,
    alpa,
    fatalAlpa,
    pctAttendance,
  };
}

export function computePemeranDiscipline(taskScore: number, attendScore: number): 1 | 2 | 3 | 4 {
  const avg = Math.floor((taskScore + attendScore) / 2);
  return Math.max(1, Math.min(4, avg)) as 1 | 2 | 3 | 4;
}

export function getCriteriaForRole(role: string): CriterionDef[] {
  return role === 'Pemeran' ? PEMERAN_CRITERIA : NON_PEMERAN_CRITERIA;
}

export function computeTotalScore(
  role: string,
  manualScores: Record<string, number>,
  autoScores: { tanggung_jawab?: number; kehadiran?: number; kedisiplinan?: number }
): number {
  const criteria = getCriteriaForRole(role);
  let weightedSum = 0;
  let totalWeight = 0;

  for (const c of criteria) {
    let raw = 3;
    if (c.source === 'MANUAL') {
      raw = manualScores[c.key] ?? 3;
    } else if (c.source === 'AUTO_TASK') {
      raw = autoScores.tanggung_jawab ?? 3;
    } else if (c.source === 'AUTO_ATTENDANCE') {
      raw = autoScores.kehadiran ?? 3;
    } else if (c.source === 'AUTO_DISCIPLINE') {
      raw = autoScores.kedisiplinan ?? 3;
    }
    const clamped = Math.max(1, Math.min(4, Math.round(raw)));
    const scaled = SCORE_SCALE[clamped] ?? 80;
    weightedSum += scaled * c.weight;
    totalWeight += c.weight;
  }

  let total = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 0;

  // Safety nets from Blueprint
  if (role !== 'Pemeran' && autoScores.tanggung_jawab === 1 && total > 70) {
    total = 70;
  }
  if (role === 'Pemeran' && (autoScores.kedisiplinan ?? 3) <= 2 && total > 75) {
    total = 75;
  }

  return total;
}

export function getPredicate(score: number): {
  grade: 'A' | 'B' | 'C' | 'D' | 'E';
  label: string;
  tone: 'emerald' | 'blue' | 'amber' | 'rose';
} {
  if (score >= 90) return { grade: 'A', label: 'Sangat Baik', tone: 'emerald' };
  if (score >= 80) return { grade: 'B', label: 'Baik', tone: 'blue' };
  if (score >= 70) return { grade: 'C', label: 'Cukup', tone: 'amber' };
  if (score >= 60) return { grade: 'D', label: 'Perlu Pembinaan', tone: 'rose' };
  return { grade: 'E', label: 'Kurang', tone: 'rose' };
}

export interface PeerTarget {
  student: UserProfile;
  category: AssessorCategory;
  alreadyAssessed: boolean;
}

export function getAssessmentTargetsForUser(
  assessor: UserProfile,
  classmates: UserProfile[],
  existingAssessments: Assessment[],
  stage: ProductionStage
): PeerTarget[] {
  const targets: PeerTarget[] = [];
  const students = classmates.filter(
    (u) => u.uid !== assessor.uid && !isTeacherOrAdmin(u.role) && u.isActive !== false
  );

  if (isTeacherOrAdmin(assessor.role)) {
    for (const student of students) {
      const done = existingAssessments.some(
        (a) => a.assessorId === assessor.uid && a.studentId === student.uid && a.stage === stage
      );
      targets.push({ student, category: 'GURU', alreadyAssessed: done });
    }
    return targets;
  }

  const matrix = ASSESSMENT_MATRIX[assessor.role as RoleName];
  if (!matrix) return targets;

  const pushMatched = (roles: RoleName[] | undefined, category: AssessorCategory) => {
    if (!roles || roles.length === 0) return;
    for (const student of students) {
      if (roles.includes(student.role)) {
        const done = existingAssessments.some(
          (a) => a.assessorId === assessor.uid && a.studentId === student.uid && a.stage === stage
        );
        if (!targets.some((t) => t.student.uid === student.uid)) {
          targets.push({ student, category, alreadyAssessed: done });
        }
      }
    }
  };

  pushMatched(matrix.ATASAN, 'ATASAN');
  pushMatched(matrix.REKAN, 'REKAN');
  pushMatched(matrix.BAWAHAN, 'BAWAHAN');
  return targets;
}

export function checkPeerAssessmentGate(
  user: UserProfile,
  classmates: UserProfile[],
  assessments: Assessment[],
  stage: ProductionStage
): {
  isComplete: boolean;
  filled: number;
  total: number;
  pendingTargets: PeerTarget[];
} {
  if (isTeacherOrAdmin(user.role)) {
    return { isComplete: true, filled: 0, total: 0, pendingTargets: [] };
  }
  const targets = getAssessmentTargetsForUser(user, classmates, assessments, stage);
  const filled = targets.filter((t) => t.alreadyAssessed).length;
  const pendingTargets = targets.filter((t) => !t.alreadyAssessed);
  return {
    isComplete: targets.length === 0 || filled >= targets.length,
    filled,
    total: targets.length,
    pendingTargets,
  };
}

export type WindowStatus = 'off' | 'not-started' | 'ongoing' | 'ended' | 'incomplete' | 'open';

export function getStageStatus(cfg?: StageDeadlineConfig): {
  status: WindowStatus;
  label: string;
  startMs?: number;
  endMs?: number;
} {
  if (!cfg || !cfg.enabled) {
    return { status: 'off', label: 'Nonaktif' };
  }
  if (!cfg.startDate && !cfg.endDate) {
    return { status: 'open', label: 'Terbuka' };
  }
  const startStr = `${cfg.startDate || ''}T${cfg.startTime || '00:00'}:00`;
  const endStr = `${cfg.endDate || ''}T${cfg.endTime || '23:59'}:00`;
  const startMs = new Date(startStr).getTime();
  const endMs = new Date(endStr).getTime();

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return { status: 'open', label: 'Terbuka' };
  }
  if (startMs >= endMs) {
    return { status: 'incomplete', label: 'Jadwal Tidak Valid', startMs, endMs };
  }
  const now = Date.now();
  if (now < startMs) {
    return { status: 'not-started', label: 'Belum Dimulai', startMs, endMs };
  }
  if (now > endMs) {
    return { status: 'ended', label: 'Sudah Selesai', startMs, endMs };
  }
  return { status: 'ongoing', label: 'Sedang Berjalan', startMs, endMs };
}

export function isAssessmentOpen(
  stageDeadlines: Record<ProductionStage, StageDeadlineConfig> | undefined,
  stage: ProductionStage
): {
  isOpen: boolean;
  status: WindowStatus;
  reason: string;
  startMs?: number;
  endMs?: number;
} {
  const cfg = stageDeadlines?.[stage];
  if (!cfg || cfg.assessmentEnabled === false) {
    return {
      isOpen: false,
      status: 'off',
      reason: 'Jendela penilaian untuk tahap ini sedang dinonaktifkan oleh Guru Pengampu.',
    };
  }
  if (!cfg.assessmentStartDate || !cfg.assessmentEndDate) {
    return { isOpen: true, status: 'open', reason: 'Penilaian terbuka.' };
  }
  const startMs = new Date(`${cfg.assessmentStartDate}T${cfg.assessmentStartTime || '00:00'}:00`).getTime();
  const endMs = new Date(`${cfg.assessmentEndDate}T${cfg.assessmentEndTime || '23:59'}:00`).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return { isOpen: true, status: 'open', reason: 'Penilaian terbuka.' };
  }
  if (startMs >= endMs) {
    return { isOpen: false, status: 'incomplete', reason: 'Rentang waktu penilaian belum valid.', startMs, endMs };
  }
  const now = Date.now();
  if (now < startMs) {
    return {
      isOpen: false,
      status: 'not-started',
      reason: `Penilaian dibuka pada ${cfg.assessmentStartDate} pukul ${cfg.assessmentStartTime || '00:00'}.`,
      startMs,
      endMs,
    };
  }
  if (now > endMs) {
    return {
      isOpen: false,
      status: 'ended',
      reason: `Penilaian tahap ${stage} telah ditutup pada ${cfg.assessmentEndDate} pukul ${cfg.assessmentEndTime || '23:59'}.`,
      startMs,
      endMs,
    };
  }
  return { isOpen: true, status: 'ongoing', reason: 'Penilaian sedang berlangsung.', startMs, endMs };
}

export interface AnomalyFlag {
  assessment: Assessment;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  reasons: string[];
}

export function detectAnomalies(
  assessments: Assessment[],
  allClassAssessments?: Assessment[]
): AnomalyFlag[] {
  const pool = allClassAssessments || assessments;
  const flags: AnomalyFlag[] = [];

  for (const a of assessments) {
    const reasons: string[] = [];
    let severity: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    const values = Object.values(a.scores || {});

    if (values.length > 0) {
      const allOne = values.every((v) => v === 1);
      const allFour = values.every((v) => v === 4);
      const allSame = values.every((v) => v === values[0]);

      if (allOne) {
        reasons.push('Semua kriteria manual diberi nilai 1 (ekstrem rendah)');
        severity = 'HIGH';
      } else if (allFour) {
        reasons.push('Semua kriteria manual diberi nilai 4 (ekstrem tinggi)');
        severity = 'MEDIUM';
      } else if (allSame) {
        reasons.push(`Pola seragam: seluruh nilai sama (${values[0]})`);
      }

      if (values.some((v) => v <= 2) && (!a.comment || a.comment.trim().length < 5)) {
        reasons.push('Ada skor <= 2 tanpa catatan alasan yang jelas');
        severity = 'HIGH';
      }

      if (allOne && (!a.comment || a.comment.trim().length < 20)) {
        reasons.push('Nilai ekstrem rendah dengan komentar < 20 karakter');
        severity = 'HIGH';
      }

      const manualAvg = values.reduce((acc, v) => acc + v, 0) / values.length;
      const autoVals = [
        a.autoScores?.tanggung_jawab,
        a.autoScores?.kehadiran,
        a.autoScores?.kedisiplinan,
      ].filter((v): v is number => typeof v === 'number');

      if (autoVals.length > 0) {
        const autoAvg = autoVals.reduce((acc, v) => acc + v, 0) / autoVals.length;
        if (Math.abs(manualAvg - autoAvg) >= 2) {
          reasons.push(`Gap skor manual (${manualAvg.toFixed(1)}) vs sistem (${autoAvg.toFixed(1)}) >= 2 poin`);
          if (severity !== 'HIGH') severity = 'MEDIUM';
        }
      }
    }

    const peerSameStudent = pool.filter(
      (other) => other.studentId === a.studentId && other.stage === a.stage && other.id !== a.id
    );
    if (peerSameStudent.length >= 2) {
      const avgOthers =
        peerSameStudent.reduce((acc, x) => acc + x.totalScore, 0) / peerSameStudent.length;
      const diff = Math.abs(a.totalScore - avgOthers);
      if (diff >= 25) {
        reasons.push(`Outlier ${diff.toFixed(1)} poin dibanding rata-rata penilai lain (${avgOthers.toFixed(1)})`);
        severity = diff >= 35 ? 'HIGH' : severity === 'HIGH' ? 'HIGH' : 'MEDIUM';
      }
    }

    if (reasons.length > 0) {
      flags.push({ assessment: a, severity, reasons });
    }
  }

  return flags.sort((x, y) => {
    const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return rank[x.severity] - rank[y.severity];
  });
}

export interface StudentStageSummary {
  stage: ProductionStage;
  score: number | null;
  categoryAverages: Partial<Record<AssessorCategory, { avg: number; count: number }>>;
}

export interface StudentFinalReport {
  student: UserProfile;
  finalScore: number;
  predicate: ReturnType<typeof getPredicate>;
  stageSummaries: StudentStageSummary[];
  categoryTotals: Record<AssessorCategory, { count: number; avg: number | null }>;
  criteriaBreakdown: {
    key: string;
    label: string;
    weight: number;
    source: CriterionDef['source'];
    avgRaw: number | null;
    converted: number | null;
  }[];
  comments: {
    id: string;
    stage: ProductionStage;
    category: AssessorCategory;
    authorDisplay: string;
    score: number;
    comment: string;
    createdAt: string;
  }[];
}

export function computeFinalStudentReport(
  student: UserProfile,
  assessments: Assessment[],
  stageWeights: Record<ProductionStage, number> = DEFAULT_STAGE_WEIGHTS,
  roleWeightsOverride?: Record<AssessorCategory, number>,
  anonymizePeerAndSubordinate = true
): StudentFinalReport {
  const mine = assessments.filter((a) => a.studentId === student.uid);
  const weights = roleWeightsOverride || getAssessorWeights(student.role);
  const stages: ProductionStage[] = ['PERSIAPAN', 'PELAKSANAAN', 'PERTUNJUKAN', 'PASCA'];

  const stageSummaries: StudentStageSummary[] = stages.map((stage) => {
    const inStage = mine.filter((a) => a.stage === stage);
    const cats: AssessorCategory[] = ['GURU', 'ATASAN', 'REKAN', 'BAWAHAN'];
    const categoryAverages: Partial<Record<AssessorCategory, { avg: number; count: number }>> = {};
    let weightedSum = 0;
    let totalWeight = 0;

    for (const cat of cats) {
      const list = inStage.filter((a) => a.assessorCategory === cat);
      if (list.length > 0) {
        const avg = list.reduce((s, x) => s + x.totalScore, 0) / list.length;
        categoryAverages[cat] = { avg: Math.round(avg * 10) / 10, count: list.length };
        const w = weights[cat] ?? 0;
        if (w > 0) {
          weightedSum += avg * w;
          totalWeight += w;
        }
      }
    }

    let stageScore: number | null = null;
    if (totalWeight > 0) {
      stageScore = Math.round((weightedSum / totalWeight) * 10) / 10;
    } else if (inStage.length > 0) {
      stageScore = Math.round((inStage.reduce((s, x) => s + x.totalScore, 0) / inStage.length) * 10) / 10;
    }

    return { stage, score: stageScore, categoryAverages };
  });

  let finalWeighted = 0;
  let finalWeightDenom = 0;
  for (const s of stageSummaries) {
    if (s.score !== null) {
      const sw = stageWeights[s.stage] ?? 0;
      finalWeighted += s.score * sw;
      finalWeightDenom += sw;
    }
  }
  const finalScore = finalWeightDenom > 0 ? Math.round((finalWeighted / finalWeightDenom) * 10) / 10 : 0;

  const categoryTotals: Record<AssessorCategory, { count: number; avg: number | null }> = {
    GURU: { count: 0, avg: null },
    ATASAN: { count: 0, avg: null },
    REKAN: { count: 0, avg: null },
    BAWAHAN: { count: 0, avg: null },
  };
  for (const cat of ['GURU', 'ATASAN', 'REKAN', 'BAWAHAN'] as AssessorCategory[]) {
    const list = mine.filter((a) => a.assessorCategory === cat);
    categoryTotals[cat] = {
      count: list.length,
      avg: list.length > 0 ? Math.round((list.reduce((s, x) => s + x.totalScore, 0) / list.length) * 10) / 10 : null,
    };
  }

  const criteria = getCriteriaForRole(student.role);
  const criteriaBreakdown = criteria.map((c) => {
    const vals: number[] = [];
    for (const a of mine) {
      if (c.source === 'MANUAL' && typeof a.scores?.[c.key] === 'number') {
        vals.push(a.scores[c.key]);
      } else if (c.source === 'AUTO_TASK' && typeof a.autoScores?.tanggung_jawab === 'number') {
        vals.push(a.autoScores.tanggung_jawab);
      } else if (c.source === 'AUTO_ATTENDANCE' && typeof a.autoScores?.kehadiran === 'number') {
        vals.push(a.autoScores.kehadiran);
      } else if (c.source === 'AUTO_DISCIPLINE' && typeof a.autoScores?.kedisiplinan === 'number') {
        vals.push(a.autoScores.kedisiplinan);
      }
    }
    const avgRaw = vals.length > 0 ? Math.round((vals.reduce((s, x) => s + x, 0) / vals.length) * 100) / 100 : null;
    const converted = avgRaw !== null ? Math.round((20 + avgRaw * 20) * 10) / 10 : null;
    return {
      key: c.key,
      label: c.label,
      weight: c.weight,
      source: c.source,
      avgRaw,
      converted,
    };
  });

  const comments = mine
    .filter((a) => a.comment && a.comment.trim().length > 0)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((a) => ({
      id: a.id,
      stage: a.stage,
      category: a.assessorCategory,
      authorDisplay:
        anonymizePeerAndSubordinate && (a.assessorCategory === 'REKAN' || a.assessorCategory === 'BAWAHAN')
          ? `Anonim (${a.assessorCategory === 'REKAN' ? 'Rekan Sejawat' : 'Anggota'})`
          : `${a.assessorName} (${a.assessorRole})`,
      score: a.totalScore,
      comment: a.comment,
      createdAt: a.createdAt,
    }));

  return {
    student,
    finalScore,
    predicate: getPredicate(finalScore),
    stageSummaries,
    categoryTotals,
    criteriaBreakdown,
    comments,
  };
}
