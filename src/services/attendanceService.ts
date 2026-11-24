import { isCoreCommitteeRole, isCoordinatorRole, isTeacherOrAdmin } from '../core/constants';
import { AttendanceRecord, AttendanceSession, UserProfile } from '../core/types';
import { isSessionRelevantToUser } from './autoScoreService';

export function canCreateGeneralSession(role?: string): boolean {
  return isCoreCommitteeRole(role);
}

export function canCreateRehearsalSession(role?: string): boolean {
  return (
    isTeacherOrAdmin(role) ||
    role === 'Pimpinan Produksi' ||
    role === 'Sekretaris' ||
    role === 'Sutradara' ||
    role === 'Asisten Sutradara' ||
    role === 'Koordinator Tata Musik'
  );
}

export function canCreateDivisionSession(role?: string): boolean {
  return isCoreCommitteeRole(role) || isCoordinatorRole(role);
}

export function canFillOnBehalf(role?: string): boolean {
  return isCoreCommitteeRole(role) || isCoordinatorRole(role);
}

export function filterSessionsForUser(
  sessions: AttendanceSession[],
  user: UserProfile | null
): AttendanceSession[] {
  if (!user) return [];
  if (isCoreCommitteeRole(user.role)) return sessions;
  return sessions.filter((s) => isSessionRelevantToUser(s, user));
}

export interface RosterEntry {
  student: UserProfile;
  record?: AttendanceRecord;
}

export function getAttendanceRoster(
  session: AttendanceSession,
  users: UserProfile[],
  records: AttendanceRecord[]
): RosterEntry[] {
  const students = users.filter(
    (u) =>
      u.isActive !== false &&
      !isTeacherOrAdmin(u.role) &&
      isSessionRelevantToUser(session, u)
  );
  const recordByStudent = new Map<string, AttendanceRecord>();
  for (const r of records) {
    if (r.sessionId === session.id) {
      recordByStudent.set(r.studentId, r);
    }
  }
  return students
    .sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name))
    .map((student) => ({
      student,
      record: recordByStudent.get(student.uid),
    }));
}

export function summarizeAttendance(
  session: AttendanceSession,
  users: UserProfile[],
  records: AttendanceRecord[]
): {
  total: number;
  expected: number;
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
  belum: number;
  percentage: number;
} {
  const roster = getAttendanceRoster(session, users, records);
  let hadir = 0;
  let izin = 0;
  let sakit = 0;
  let alpa = 0;
  let belum = 0;

  for (const item of roster) {
    if (!item.record) {
      belum++;
    } else if (item.record.status === 'Hadir') {
      hadir++;
    } else if (item.record.status === 'Izin') {
      izin++;
    } else if (item.record.status === 'Sakit') {
      sakit++;
    } else if (item.record.status === 'Alpa') {
      alpa++;
    }
  }

  const expected = roster.length;
  const percentage = expected > 0 ? Math.round((hadir / expected) * 100) : 0;

  return {
    total: expected,
    expected,
    hadir,
    izin,
    sakit,
    alpa,
    belum,
    percentage,
  };
}
