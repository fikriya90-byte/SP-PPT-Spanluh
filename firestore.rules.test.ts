/**
 * Security Rules Specification Verification Matrix for SP-PPT v2
 * Verifies Dirty Dozen adversarial payloads against firestore.rules constraints.
 */

export interface DirtyDozenCase {
  id: string;
  collection: string;
  operation: 'create' | 'update' | 'get' | 'list' | 'delete';
  actorRole: string;
  payload: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
  enforcedBy: string;
}

export const DIRTY_DOZEN_TESTS: DirtyDozenCase[] = [
  {
    id: 'DD-01',
    collection: 'users',
    operation: 'create',
    actorRole: 'unprivileged_student',
    payload: { uid: 'u1', name: 'Attacker', role: 'Super Admin', classId: 'IX-A', isActive: true },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'Self-registration forbids Guru Pengampu / Admin / Super Admin roles',
  },
  {
    id: 'DD-02',
    collection: 'users',
    operation: 'update',
    actorRole: 'Pemeran',
    payload: { role: 'Guru Pengampu' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'Owner update affectedKeys().hasOnly excludes role/classId/uid',
  },
  {
    id: 'DD-03',
    collection: 'admins',
    operation: 'create',
    actorRole: 'spoofed_unverified_email',
    payload: { uid: 'u1', email: 'fikri.yassaar15@guru.smp.belajar.id', role: 'Super Admin' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'isBootstrappedAdmin requires request.auth.token.email_verified == true',
  },
  {
    id: 'DD-04',
    collection: 'userPrivate',
    operation: 'get',
    actorRole: 'Pemeran',
    payload: { targetUid: 'other_student_uid' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'userPrivate read restricted to isOwner(uid) || isTeacher()',
  },
  {
    id: 'DD-05',
    collection: 'userCredentials',
    operation: 'get',
    actorRole: 'Pimpinan Produksi',
    payload: { targetUid: 'other_student_uid' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'userCredentials restricted strictly to isTeacher() || isAdmin()',
  },
  {
    id: 'DD-06',
    collection: 'users',
    operation: 'create',
    actorRole: 'student',
    payload: { uid: 'u1', name: 'X', role: 'Pemeran', classId: 'IX-A', isActive: true, isVerified: true },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'isValidUserProfile enforces strict keys().hasOnly allowlist',
  },
  {
    id: 'DD-07',
    collection: 'assessments',
    operation: 'create',
    actorRole: 'student_A',
    payload: { assessorId: 'student_B', studentId: 'student_C', totalScore: 100 },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'assessorId == request.auth.uid required on assessment create',
  },
  {
    id: 'DD-08',
    collection: 'assessments',
    operation: 'update',
    actorRole: 'student_A',
    payload: { assessorId: 'teacher_1', totalScore: 100 },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'existing().assessorId == request.auth.uid || isTeacher()',
  },
  {
    id: 'DD-09',
    collection: 'deadlines',
    operation: 'create',
    actorRole: 'Guru Pengampu',
    payload: { id: '../bad-id/' + 'x'.repeat(200) },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'isValidId(docId) regex and length <= 128 guard',
  },
  {
    id: 'DD-10',
    collection: 'complaints',
    operation: 'get',
    actorRole: 'student_A',
    payload: { studentId: 'student_B' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'complaints read requires resource.data.studentId == request.auth.uid || isTeacher()',
  },
  {
    id: 'DD-11',
    collection: 'notifications',
    operation: 'delete',
    actorRole: 'student_A',
    payload: { userId: 'student_B' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'notifications delete requires resource.data.userId == request.auth.uid || isTeacher()',
  },
  {
    id: 'DD-12',
    collection: 'auditLogs',
    operation: 'delete',
    actorRole: 'Pimpinan Produksi',
    payload: { logId: 'log_123' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'auditLogs allow update, delete: if false (append-only)',
  },
];
