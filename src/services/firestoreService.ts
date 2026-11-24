import {
  Unsubscribe,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  DEFAULT_ASSESSOR_WEIGHTS,
  DEFAULT_STAGE_WEIGHTS,
  getRoleMeta,
  isTeacherOrAdmin,
} from '../core/constants';
import { DEFAULT_DRIVE_FOLDERS } from '../core/driveFolders';
import {
  Assessment,
  AssessmentHistory,
  AssessorWeightsConfig,
  AttendanceRecord,
  AttendanceSession,
  AttendanceStatus,
  AuditLogItem,
  ComplaintItem,
  DeadlineSubmission,
  DeadlineTask,
  DocumentItem,
  DriveFolderItem,
  EquipmentItem,
  NotificationCategory,
  ProductionStage,
  RoleName,
  ScheduleItem,
  SchoolClass,
  StageManagerConfig,
  UserCredential,
  UserPrivate,
  UserProfile,
} from '../core/types';
import { isSessionRelevantToUser } from './autoScoreService';
import {
  OperationType,
  db,
  handleFirestoreError,
  isFirestoreQuotaExceeded,
  isQuotaExceededError,
  markFirestoreQuotaExceeded,
} from './firebase';

export function makeSafeId(prefix = 'id'): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24);
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${cleanPrefix}_${ts}_${rand}`;
}

export function enrichUser(
  raw: Partial<UserProfile>,
  priv?: Partial<UserPrivate> | null
): UserProfile {
  const rawRole = raw.role as string | undefined;
  const normalizedRole = (
    rawRole === 'Guru Pembina'
      ? 'Guru Pengampu'
      : rawRole === 'Pemain'
      ? 'Pemeran'
      : rawRole || 'Pemeran'
  ) as RoleName;
  const meta = getRoleMeta(normalizedRole);
  const resolvedName = raw.name || raw.displayName || 'Pengguna';
  const resolvedPhoto = raw.photoUrl || raw.photoURL || '';

  return {
    uid: raw.uid || '',
    name: resolvedName,
    displayName: raw.displayName || resolvedName,
    role: normalizedRole,
    divisionId: raw.divisionId || meta.divisionId,
    divisionName: raw.divisionName || meta.divisionName,
    classId: raw.classId || 'IX-A',
    className: raw.className || raw.classId || 'IX-A',
    classIds: raw.classIds && raw.classIds.length > 0 ? raw.classIds : [raw.classId || 'IX-A'],
    photoUrl: resolvedPhoto,
    photoURL: resolvedPhoto,
    email: priv?.email || raw.email || '',
    phone: priv?.phone || raw.phone || '',
    nis: priv?.nis || raw.nis || '',
    isActive: raw.isActive !== false,
    isPasswordReset: raw.isPasswordReset,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

export function subscribeClassCollection<T extends { id: string }>(
  collectionName: string,
  classId: string,
  callback: (items: T[]) => void,
  maxItems = 500
): Unsubscribe {
  const colRef = collection(db, collectionName);
  const q = query(colRef, where('classId', '==', classId), limit(maxItems));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
      callback(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, collectionName)
  );
}

export function subscribeEquipmentList(
  classId: string,
  callback: (items: EquipmentItem[]) => void
): Unsubscribe {
  let classList: EquipmentItem[] = [];
  let schoolList: EquipmentItem[] = [];
  const emit = () => {
    const map = new Map<string, EquipmentItem>();
    [...schoolList, ...classList].forEach((item) => map.set(item.id, item));
    callback(Array.from(map.values()));
  };
  const unsubClass = subscribeClassCollection<EquipmentItem>('equipment', classId, (items) => {
    classList = items;
    emit();
  });
  const unsubSchool = subscribeClassCollection<EquipmentItem>('equipment', 'SCHOOL_WIDE', (items) => {
    schoolList = items;
    emit();
  });
  return () => {
    unsubClass();
    unsubSchool();
  };
}

export function subscribeAllActiveClasses(callback: (items: SchoolClass[]) => void): Unsubscribe {
  const q = query(collection(db, 'classes'), where('isActive', '==', true), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ ...(d.data() as SchoolClass), id: d.id })));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'classes')
  );
}

export async function fetchUsersByClass(classId: string): Promise<UserProfile[]> {
  const snap = await getDocs(query(collection(db, 'users'), where('isActive', '==', true), limit(400)));
  const rawUsers = snap.docs
    .map((d) => ({ ...(d.data() as UserProfile), uid: d.id }))
    .filter((u) => u.classId === classId || u.classIds?.includes(classId));

  const privMap = new Map<string, UserPrivate>();
  try {
    const privSnap = await getDocs(query(collection(db, 'userPrivate'), limit(400)));
    for (const pd of privSnap.docs) {
      privMap.set(pd.id, pd.data() as UserPrivate);
    }
  } catch {
    // Non-teacher accounts can only read their own userPrivate doc; try fetching self if needed
  }

  return rawUsers.map((u) => enrichUser(u, privMap.get(u.uid)));
}

export async function fetchAllUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(query(collection(db, 'users'), where('isActive', '==', true), limit(600)));
  const privMap = new Map<string, UserPrivate>();
  try {
    const privSnap = await getDocs(query(collection(db, 'userPrivate'), limit(600)));
    for (const pd of privSnap.docs) {
      privMap.set(pd.id, pd.data() as UserPrivate);
    }
  } catch {
    // ignore for non-teachers
  }
  return snap.docs.map((d) =>
    enrichUser({ ...(d.data() as UserProfile), uid: d.id }, privMap.get(d.id))
  );
}

export function subscribeClassUsers(
  classId: string,
  includePrivateForTeacher: boolean,
  currentUid: string,
  callback: (users: UserProfile[]) => void
): Unsubscribe {
  let rawUsers: UserProfile[] = [];
  const privateMap = new Map<string, UserPrivate>();

  const emit = () => {
    callback(
      rawUsers
        .filter((u) => u.classId === classId || u.classIds?.includes(classId))
        .map((u) => enrichUser(u, privateMap.get(u.uid)))
    );
  };

  if (!includePrivateForTeacher && currentUid) {
    getDoc(doc(db, 'userPrivate', currentUid))
      .then((ownPriv) => {
        if (ownPriv.exists()) {
          privateMap.set(currentUid, ownPriv.data() as UserPrivate);
          if (rawUsers.length > 0) emit();
        }
      })
      .catch(() => undefined);
  }

  const unsubUsers = onSnapshot(
    query(collection(db, 'users'), where('isActive', '==', true), limit(300)),
    (snap) => {
      rawUsers = snap.docs.map((d) => ({ ...(d.data() as UserProfile), uid: d.id }));
      emit();
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'users')
  );

  let unsubPrivate: Unsubscribe | null = null;
  if (includePrivateForTeacher) {
    unsubPrivate = onSnapshot(
      query(collection(db, 'userPrivate'), limit(300)),
      (privSnap) => {
        privateMap.clear();
        for (const pd of privSnap.docs) {
          privateMap.set(pd.id, pd.data() as UserPrivate);
        }
        if (rawUsers.length > 0) emit();
      },
      () => undefined
    );
  }

  return () => {
    unsubUsers();
    unsubPrivate?.();
  };
}

export function subscribeAllUsersForAdmin(callback: (users: UserProfile[]) => void): Unsubscribe {
  let rawUsers: UserProfile[] = [];
  const privMap = new Map<string, UserPrivate>();

  const emit = () => {
    callback(rawUsers.map((raw) => enrichUser(raw, privMap.get(raw.uid))));
  };

  const unsubUsers = onSnapshot(
    query(collection(db, 'users'), where('isActive', '==', true), limit(400)),
    (snap) => {
      rawUsers = snap.docs.map((d) => ({ ...(d.data() as UserProfile), uid: d.id }));
      emit();
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'users')
  );

  const unsubPriv = onSnapshot(
    query(collection(db, 'userPrivate'), limit(400)),
    (privSnap) => {
      privMap.clear();
      for (const pd of privSnap.docs) {
        privMap.set(pd.id, pd.data() as UserPrivate);
      }
      if (rawUsers.length > 0) emit();
    },
    () => undefined
  );

  return () => {
    unsubUsers();
    unsubPriv();
  };
}

export function subscribeUserNotifications(
  userId: string,
  callback: (items: import('../core/types').NotificationItem[]) => void
): Unsubscribe {
  const q = query(collection(db, 'notifications'), where('userId', '==', userId), limit(200));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ ...(d.data() as import('../core/types').NotificationItem), id: d.id }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callback(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
  );
}

export function createDefaultStageManager(): StageManagerConfig {
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const mk = (enabled: boolean) => ({
    startDate: today,
    startTime: '07:00',
    endDate: nextMonth,
    endTime: '23:59',
    enabled,
    notes: '',
    assessmentEnabled: true,
    assessmentStartDate: today,
    assessmentStartTime: '00:00',
    assessmentEndDate: nextMonth,
    assessmentEndTime: '23:59',
  });
  return {
    id: 'stageManager',
    currentStage: 'PERSIAPAN',
    stageDeadlines: {
      PERSIAPAN: mk(true),
      PELAKSANAAN: mk(true),
      PERTUNJUKAN: mk(true),
      PASCA: mk(true),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function subscribeStageManager(
  classId: string,
  callback: (cfg: StageManagerConfig) => void
): Unsubscribe {
  const ref = doc(db, 'classes', classId, 'config', 'stageManager');
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        callback(snap.data() as StageManagerConfig);
      } else {
        callback(createDefaultStageManager());
      }
    },
    (err) => handleFirestoreError(err, OperationType.GET, `classes/${classId}/config/stageManager`)
  );
}

export function subscribeAssessorWeights(
  classId: string,
  callback: (cfg: AssessorWeightsConfig) => void
): Unsubscribe {
  const ref = doc(db, 'classes', classId, 'config', 'assessorWeights');
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        callback(snap.data() as AssessorWeightsConfig);
      } else {
        callback({
          id: 'assessorWeights',
          stageWeights: DEFAULT_STAGE_WEIGHTS,
          roleWeights: DEFAULT_ASSESSOR_WEIGHTS,
          updatedAt: new Date().toISOString(),
        });
      }
    },
    (err) => handleFirestoreError(err, OperationType.GET, `classes/${classId}/config/assessorWeights`)
  );
}

export function subscribeDriveFolders(callback: (folders: DriveFolderItem[]) => void): Unsubscribe {
  const ref = doc(db, 'systemConfig', 'driveFolders');
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists() && Array.isArray(snap.data().folders)) {
        callback(snap.data().folders as DriveFolderItem[]);
      } else {
        callback(DEFAULT_DRIVE_FOLDERS);
      }
    },
    (err) => handleFirestoreError(err, OperationType.GET, 'systemConfig/driveFolders')
  );
}

export function subscribeAuditLogs(
  user: UserProfile,
  canViewAll: boolean,
  callback: (logs: AuditLogItem[]) => void
): Unsubscribe {
  const q = canViewAll
    ? query(collection(db, 'auditLogs'), limit(200))
    : query(collection(db, 'auditLogs'), where('userId', '==', user.uid), limit(100));

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ ...(d.data() as AuditLogItem), id: d.id }))
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      callback(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'auditLogs')
  );
}

export function subscribeAssessments(
  classId: string,
  callback: (items: Assessment[]) => void
): Unsubscribe {
  return subscribeClassCollection<Assessment>('assessments', classId, callback, 500);
}

export async function saveAssessment(
  payload: Omit<Assessment, 'id'> & { id?: string }
): Promise<string> {
  const id = payload.id || makeSafeId('ass');
  const now = new Date().toISOString();
  const data = {
    ...payload,
    id,
    updatedAt: payload.updatedAt || now,
    createdAt: payload.createdAt || now,
  };
  await setDoc(doc(db, 'assessments', id), data, { merge: true });
  return id;
}

export function subscribeAttendanceSessions(
  classId: string,
  callback: (items: AttendanceSession[]) => void
): Unsubscribe {
  return subscribeClassCollection<AttendanceSession>('attendanceSessions', classId, (list) => {
    callback(list.sort((a, b) => b.date.localeCompare(a.date)));
  });
}

export function subscribeAllAttendanceRecords(
  classId: string,
  callback: (items: AttendanceRecord[]) => void
): Unsubscribe {
  return subscribeClassCollection<AttendanceRecord>('attendanceRecords', classId, callback, 800);
}

export function subscribeAttendanceRecords(
  sessionId: string,
  callback: (items: AttendanceRecord[]) => void
): Unsubscribe {
  const q = query(collection(db, 'attendanceRecords'), where('sessionId', '==', sessionId), limit(300));
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ ...(d.data() as AttendanceRecord), id: d.id })));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'attendanceRecords')
  );
}

export async function createAttendanceSession(
  data: Omit<AttendanceSession, 'id' | 'createdBy' | 'creatorName' | 'creatorRole' | 'createdAt'>,
  actor: { uid: string; displayName: string; role: string }
): Promise<string> {
  const id = makeSafeId('att_sess');
  const clean: Record<string, unknown> = {
    ...data,
    id,
    createdBy: actor.uid,
    creatorName: actor.displayName,
    creatorRole: actor.role,
    createdAt: new Date().toISOString(),
  };
  Object.keys(clean).forEach((k) => {
    if (clean[k] === undefined) delete clean[k];
  });
  await setDoc(doc(db, 'attendanceSessions', id), clean);
  return id;
}

export async function submitAttendanceRecord(payload: {
  sessionId: string;
  studentId: string;
  studentName: string;
  classId: string;
  status: AttendanceStatus;
  isOnBehalf?: boolean;
  filledBy?: string;
  filledByName?: string;
  filledByRole?: string;
}): Promise<void> {
  const recId = `${payload.sessionId}_${payload.studentId}`;
  const clean: Record<string, unknown> = {
    id: recId,
    sessionId: payload.sessionId,
    studentId: payload.studentId,
    studentName: payload.studentName,
    classId: payload.classId,
    status: payload.status,
    timestamp: new Date().toISOString(),
    isOnBehalf: Boolean(payload.isOnBehalf),
  };
  if (payload.filledBy) clean.filledBy = payload.filledBy;
  if (payload.filledByName) clean.filledByName = payload.filledByName;
  if (payload.filledByRole) clean.filledByRole = payload.filledByRole;
  await setDoc(doc(db, 'attendanceRecords', recId), clean, { merge: true });
}

export async function bulkFillAttendance(
  sessionId: string,
  actor: { uid: string; displayName: string; role: string },
  entries: { studentId: string; studentName: string; status: AttendanceStatus }[]
): Promise<{ filled: number; errors: string[] }> {
  const sessSnap = await getDoc(doc(db, 'attendanceSessions', sessionId));
  const classId = sessSnap.exists() ? String(sessSnap.data().classId || '') : '';
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  let filled = 0;
  const errors: string[] = [];

  for (const e of entries) {
    try {
      const recId = `${sessionId}_${e.studentId}`;
      batch.set(
        doc(db, 'attendanceRecords', recId),
        {
          id: recId,
          sessionId,
          studentId: e.studentId,
          studentName: e.studentName,
          classId,
          status: e.status,
          timestamp: now,
          isOnBehalf: true,
          filledBy: actor.uid,
          filledByName: actor.displayName,
          filledByRole: actor.role,
        },
        { merge: true }
      );
      filled++;
    } catch (err) {
      errors.push(`${e.studentName}: ${err instanceof Error ? err.message : 'error'}`);
    }
  }
  await batch.commit();
  return { filled, errors };
}

export function subscribeSchedules(
  classId: string,
  callback: (items: ScheduleItem[]) => void
): Unsubscribe {
  return subscribeClassCollection<ScheduleItem>('schedules', classId, callback, 500);
}

export function subscribeDeadlinesByClass(
  classId: string,
  callback: (items: DeadlineTask[]) => void
): Unsubscribe {
  return subscribeClassCollection<DeadlineTask>('deadlines', classId, callback, 500);
}

export function subscribeDeadlineSubmissionsByClass(
  classId: string,
  callback: (items: DeadlineSubmission[]) => void
): Unsubscribe {
  return subscribeClassCollection<DeadlineSubmission>('deadlineSubmissions', classId, callback, 1200);
}

export function subscribeDocuments(
  classId: string,
  callback: (items: DocumentItem[]) => void
): Unsubscribe {
  return subscribeClassCollection<DocumentItem>('documents', classId, (list) => {
    callback(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  });
}

export async function uploadDocumentMeta(
  payload: Omit<DocumentItem, 'id'> & { id?: string }
): Promise<string> {
  const id = payload.id || makeSafeId('doc');
  const data: Record<string, unknown> = {
    ...payload,
    id,
    url: payload.url || payload.fileUrl || '',
    fileUrl: payload.fileUrl || payload.url || '',
    createdAt: payload.createdAt || new Date().toISOString(),
  };
  Object.keys(data).forEach((k) => {
    if (data[k] === undefined) delete data[k];
  });
  await setDoc(doc(db, 'documents', id), data);
  return id;
}

export async function submitComplaint(
  payload: Omit<ComplaintItem, 'id'>
): Promise<string> {
  const id = makeSafeId('cmp');
  const now = payload.createdAt || new Date().toISOString();
  const data: Record<string, unknown> = {
    id,
    classId: payload.classId,
    studentId: payload.studentId,
    studentName: payload.studentName || 'Siswa',
    subject: payload.subject || payload.title || payload.category || 'Aduan Siswa',
    title: payload.title || payload.subject || 'Aduan Siswa',
    message: payload.message || payload.description || '-',
    description: payload.description || payload.message || '-',
    category: payload.category || 'Lainnya',
    isAnonymous: Boolean(payload.isAnonymous),
    status: payload.status || 'OPEN',
    createdAt: now,
    updatedAt: payload.updatedAt || now,
  };
  if (payload.evidenceUrl) data.evidenceUrl = payload.evidenceUrl;
  await setDoc(doc(db, 'complaints', id), data);
  return id;
}

export function subscribeComplaints(
  classId: string,
  callback: (items: ComplaintItem[]) => void
): Unsubscribe {
  return subscribeClassCollection<ComplaintItem>('complaints', classId, callback, 400);
}

export async function notifyTeachers(
  classId: string,
  payload: {
    title: string;
    message: string;
    category?: NotificationCategory;
    link?: string;
    senderName?: string;
  }
): Promise<void> {
  const users = await fetchUsersByClass(classId);
  const teacherIds = users
    .filter((u) => isTeacherOrAdmin(u.role))
    .map((u) => u.uid);

  if (teacherIds.length === 0) return;

  await notifyUsers({
    userIds: teacherIds,
    classId,
    title: payload.title,
    message: payload.message,
    category: payload.category || 'Urgent',
    link: payload.link || 'dashboard',
  });
}

export async function upsertDocument<T extends Record<string, unknown>>(
  collectionName: string,
  id: string,
  data: T
): Promise<void> {
  try {
    await setDoc(doc(db, collectionName, id), { ...data, id }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${collectionName}/${id}`);
  }
}

export async function updateDocumentFields(
  collectionName: string,
  id: string,
  fields: Record<string, unknown>
): Promise<void> {
  try {
    await updateDoc(doc(db, collectionName, id), fields);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${collectionName}/${id}`);
  }
}

export async function removeDocument(collectionName: string, id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${collectionName}/${id}`);
  }
}

export async function saveStageManager(classId: string, config: StageManagerConfig): Promise<void> {
  try {
    await setDoc(doc(db, 'classes', classId, 'config', 'stageManager'), {
      ...config,
      id: 'stageManager',
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `classes/${classId}/config/stageManager`);
  }
}

export async function saveAssessorWeights(
  classId: string,
  config: AssessorWeightsConfig
): Promise<void> {
  try {
    await setDoc(doc(db, 'classes', classId, 'config', 'assessorWeights'), {
      ...config,
      id: 'assessorWeights',
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `classes/${classId}/config/assessorWeights`);
  }
}

export async function saveDriveFolders(folders: DriveFolderItem[]): Promise<void> {
  try {
    await setDoc(doc(db, 'systemConfig', 'driveFolders'), {
      id: 'driveFolders',
      folders,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'systemConfig/driveFolders');
  }
}

export async function recordAuditLog(
  params:
    | {
        user: UserProfile;
        action: AuditLogItem['action'];
        targetType: string;
        targetId: string;
        details: string;
      }
    | {
        userId: string;
        userName: string;
        role: string;
        action: AuditLogItem['action'];
        targetType: string;
        targetId: string;
        details: string;
      }
): Promise<void> {
  const id = makeSafeId('log');
  const userId = 'user' in params ? params.user.uid : params.userId;
  const userName = 'user' in params ? params.user.displayName || params.user.name : params.userName;
  const role = 'user' in params ? params.user.role : params.role;

  const payload: AuditLogItem = {
    id,
    userId,
    userName,
    role,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    details: params.details.slice(0, 950),
    timestamp: new Date().toISOString(),
  };
  if (isFirestoreQuotaExceeded()) return;
  try {
    await setDoc(doc(db, 'auditLogs', id), payload);
  } catch (err) {
    if (isQuotaExceededError(err)) {
      markFirestoreQuotaExceeded();
    }
    // non-fatal for background audit logs
  }
}

export async function notifyUsers(params: {
  userIds: string[];
  classId: string;
  title: string;
  message: string;
  category: NotificationCategory;
  link: string;
}): Promise<void> {
  const uniqueIds = Array.from(new Set(params.userIds.filter(Boolean)));
  if (uniqueIds.length === 0 || isFirestoreQuotaExceeded()) return;

  const now = new Date().toISOString();
  const batchSize = 400;
  try {
    for (let i = 0; i < uniqueIds.length; i += batchSize) {
      const slice = uniqueIds.slice(i, i + batchSize);
      const batch = writeBatch(db);
      for (const uid of slice) {
        const id = makeSafeId('notif');
        batch.set(doc(db, 'notifications', id), {
          id,
          userId: uid,
          classId: params.classId,
          title: params.title.slice(0, 190),
          message: params.message.slice(0, 1900),
          category: params.category,
          read: false,
          link: params.link,
          createdAt: now,
        });
      }
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'notifications');
  }
}

export async function closeAttendanceSession(params: {
  session: AttendanceSession;
  classMembers: UserProfile[];
  existingRecords: AttendanceRecord[];
  actor: UserProfile;
}): Promise<number>;
export async function closeAttendanceSession(
  sessionId: string
): Promise<{ autoMarked: number; expectedCount: number }>;
export async function closeAttendanceSession(
  arg:
    | {
        session: AttendanceSession;
        classMembers: UserProfile[];
        existingRecords: AttendanceRecord[];
        actor: UserProfile;
      }
    | string
): Promise<number | { autoMarked: number; expectedCount: number }> {
  if (typeof arg === 'string') {
    const sessSnap = await getDoc(doc(db, 'attendanceSessions', arg));
    if (!sessSnap.exists()) {
      throw new Error('Sesi presensi tidak ditemukan.');
    }
    const session = { ...(sessSnap.data() as AttendanceSession), id: sessSnap.id };
    const [classMembers, recSnap] = await Promise.all([
      fetchUsersByClass(session.classId),
      getDocs(query(collection(db, 'attendanceRecords'), where('sessionId', '==', arg))),
    ]);
    const existingRecords = recSnap.docs.map(
      (d) => ({ ...(d.data() as AttendanceRecord), id: d.id })
    );
    const expectedStudents = classMembers.filter(
      (u) =>
        u.isActive !== false &&
        !isTeacherOrAdmin(u.role) &&
        isSessionRelevantToUser(session, u)
    );
    const now = new Date().toISOString();
    const batch = writeBatch(db);
    let autoMarked = 0;

    for (const student of expectedStudents) {
      const hasRecord = existingRecords.some(
        (r) => r.sessionId === session.id && r.studentId === student.uid
      );
      if (!hasRecord) {
        const recId = `${session.id}_${student.uid}`;
        batch.set(doc(db, 'attendanceRecords', recId), {
          id: recId,
          sessionId: session.id,
          studentId: student.uid,
          studentName: student.displayName || student.name,
          classId: session.classId,
          status: 'Alpa',
          timestamp: now,
          autoMarked: true,
          autoMarkedAt: now,
        });
        autoMarked++;
      }
    }

    batch.update(doc(db, 'attendanceSessions', session.id), {
      isOpen: false,
      closedAt: now,
      autoMarkedCount: autoMarked,
      expectedCount: expectedStudents.length,
    });
    await batch.commit();
    return { autoMarked, expectedCount: expectedStudents.length };
  }

  const { session, classMembers, existingRecords, actor } = arg;
  const expectedStudents = classMembers.filter(
    (u) =>
      u.isActive !== false &&
      !isTeacherOrAdmin(u.role) &&
      isSessionRelevantToUser(session, u)
  );
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  let autoMarkedCount = 0;

  for (const student of expectedStudents) {
    const hasRecord = existingRecords.some(
      (r) => r.sessionId === session.id && r.studentId === student.uid
    );
    if (!hasRecord) {
      const recId = `${session.id}_${student.uid}`;
      batch.set(doc(db, 'attendanceRecords', recId), {
        id: recId,
        sessionId: session.id,
        studentId: student.uid,
        studentName: student.name,
        classId: session.classId,
        status: 'Alpa',
        timestamp: now,
        autoMarked: true,
        autoMarkedAt: now,
      });
      autoMarkedCount++;
    }
  }

  batch.update(doc(db, 'attendanceSessions', session.id), {
    isOpen: false,
    closedAt: now,
    autoMarkedCount,
    expectedCount: expectedStudents.length,
  });

  try {
    await batch.commit();
    await recordAuditLog({
      user: actor,
      action: 'UPDATE',
      targetType: 'attendanceSession',
      targetId: session.id,
      details: `Menutup sesi presensi "${session.title}". Auto-Alpa: ${autoMarkedCount} siswa.`,
    });
    return autoMarkedCount;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'attendanceSessions');
  }
}

export async function carryOverDeadlines(params: {
  deadlines: DeadlineTask[];
  fromStage: ProductionStage;
  toStage: ProductionStage;
  actor: UserProfile;
}): Promise<number> {
  const { deadlines, fromStage, toStage, actor } = params;
  const candidates = deadlines.filter(
    (d) => d.stage === fromStage && d.status === 'PENDING'
  );
  if (candidates.length === 0) return 0;

  const batch = writeBatch(db);
  for (const d of candidates) {
    batch.update(doc(db, 'deadlines', d.id), {
      stage: toStage,
      carriedOverFrom: fromStage,
    });
  }

  try {
    await batch.commit();
    await recordAuditLog({
      user: actor,
      action: 'UPDATE',
      targetType: 'deadlines',
      targetId: toStage,
      details: `Carry-over ${candidates.length} tugas dari ${fromStage} ke ${toStage}.`,
    });
    return candidates.length;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'deadlines');
  }
}

export async function logAssessmentHistory(
  entry: Omit<AssessmentHistory, 'id' | 'createdAt'>
): Promise<void> {
  const id = makeSafeId('ahist');
  try {
    await setDoc(doc(db, 'assessmentHistory', id), {
      ...entry,
      id,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'assessmentHistory');
  }
}

export async function saveUserProfileBundle(params: {
  profile: UserProfile;
  privateInfo: UserPrivate;
  credential?: UserCredential;
}): Promise<void> {
  const batch = writeBatch(db);
  const {
    uid,
    name,
    displayName,
    role,
    divisionId,
    divisionName,
    classId,
    classIds,
    photoUrl,
    photoURL,
    isActive,
    createdAt,
    updatedAt,
  } = params.profile;

  const safeName = (name || displayName || 'Pengguna').trim().slice(0, 120) || 'Pengguna';
  const safePhoto = (photoUrl || photoURL || '').slice(0, 390000);
  const safeClassId = (classId || 'IX-A').slice(0, 64) || 'IX-A';

  const userPayload: Record<string, unknown> = {
    uid,
    name: safeName,
    role,
    divisionId: (divisionId || 'pemeran').slice(0, 60),
    divisionName: (divisionName || 'Pemeran & Penyutradaraan').slice(0, 80),
    classId: safeClassId,
    classIds: classIds && classIds.length > 0 ? classIds.slice(0, 20) : [safeClassId],
    photoUrl: safePhoto,
    isActive: isActive !== false,
    createdAt,
    updatedAt,
  };

  const privatePayload: Record<string, unknown> = {
    uid: params.privateInfo.uid || uid,
    email: String(params.privateInfo.email || '').slice(0, 200),
    phone: String(params.privateInfo.phone || '').slice(0, 32),
    nis: String(params.privateInfo.nis || '').slice(0, 40),
    classId: String(params.privateInfo.classId || safeClassId).slice(0, 64) || safeClassId,
    updatedAt: params.privateInfo.updatedAt || updatedAt,
  };

  batch.set(doc(db, 'users', uid), userPayload, { merge: true });
  batch.set(doc(db, 'userPrivate', uid), privatePayload, { merge: true });

  if (params.credential) {
    const credPayload: Record<string, unknown> = {
      uid: params.credential.uid || uid,
      email: String(params.credential.email || '').slice(0, 200),
      classId: String(params.credential.classId || safeClassId).slice(0, 64) || safeClassId,
      updatedAt: params.credential.updatedAt || updatedAt,
    };
    if (params.credential.tempPassword !== undefined) {
      credPayload.tempPassword = String(params.credential.tempPassword).slice(0, 100);
    }
    if (params.credential.createdBy !== undefined) {
      credPayload.createdBy = String(params.credential.createdBy).slice(0, 128);
    }
    batch.set(doc(db, 'userCredentials', uid), credPayload, { merge: true });
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
  }
}

export async function resetStageAssessments(params: {
  classId: string;
  stage: ProductionStage;
  assessments: Assessment[];
  actor: UserProfile;
}): Promise<number> {
  const targets = params.assessments.filter(
    (a) => a.classId === params.classId && a.stage === params.stage
  );
  if (targets.length === 0) return 0;

  const batch = writeBatch(db);
  for (const a of targets) {
    batch.delete(doc(db, 'assessments', a.id));
  }
  try {
    await batch.commit();
    await recordAuditLog({
      user: params.actor,
      action: 'DELETE',
      targetType: 'assessments',
      targetId: `${params.classId}_${params.stage}`,
      details: `Reset ${targets.length} penilaian tahap ${params.stage}.`,
    });
    return targets.length;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'assessments');
  }
}
