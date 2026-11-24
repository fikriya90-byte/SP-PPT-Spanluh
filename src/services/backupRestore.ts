import { collection, doc, getDoc, getDocs, limit, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { getRoleMeta, normalizeUserRole } from '../core/constants';
import { RoleName, UserProfile } from '../core/types';
import { triggerDownload } from '../utils/exportXLSX';
import {
  db,
  isFirestoreQuotaExceeded,
  isQuotaExceededError,
  legacyDefaultDb,
  markFirestoreQuotaExceeded,
} from './firebase';

export const BACKUP_COLLECTIONS = [
  'classes',
  'users',
  'userPrivate',
  'userCredentials',
  'productions',
  'assessments',
  'assessmentHistory',
  'attendanceSessions',
  'attendanceRecords',
  'schedules',
  'divisionSchedules',
  'scheduleConfirmations',
  'documents',
  'broadcasts',
  'crossClassBroadcasts',
  'information',
  'complaints',
  'notifications',
  'promptBooks',
  'deadlines',
  'deadlineSubmissions',
  'kasSettings',
  'kasPeriods',
  'kasPayments',
  'cashEntries',
  'properties',
  'musicCues',
  'faceCharts',
  'costumes',
  'rabItems',
  'rabDocuments',
  'equipment',
  'bookings',
  'notulensi',
  'scripts',
  'musicReferences',
  'timelineConfigs',
  'timelineWeeks',
  'contentSchedules',
  'directorTimelines',
  'interClassEvents',
  'driveSubmissions',
  'templateSubmissions',
  'templateDrafts',
  'auditLogs',
  'reminderLog',
] as const;

const LEGACY_COLLECTION_MAP: Record<string, string> = {
  tasks: 'deadlines',
  directorTimeline: 'directorTimelines',
  contentSchedule: 'contentSchedules',
  crossClassMessages: 'interClassEvents',
};

export interface BackupPayload {
  version: string;
  exportedAt: string;
  classId: string;
  className: string;
  totalRecords: number;
  collections: Record<string, Record<string, unknown>[]>;
}

function sanitizeId(rawId: unknown, fallbackPrefix = 'doc'): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);
  if (cleaned.length > 0) return cleaned;
  return `${fallbackPrefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function createClassBackup(classId: string, className: string): Promise<BackupPayload> {
  const collectionsData: Record<string, Record<string, unknown>[]> = {};
  let totalRecords = 0;

  for (const colName of BACKUP_COLLECTIONS) {
    try {
      let snap;
      if (colName === 'classes') {
        snap = await getDocs(query(collection(db, colName), where('id', '==', classId)));
      } else if (colName === 'auditLogs' || colName === 'crossClassBroadcasts') {
        snap = await getDocs(query(collection(db, colName)));
      } else {
        snap = await getDocs(query(collection(db, colName), where('classId', '==', classId)));
      }
      const docsList = snap.docs.map((d) => ({ ...d.data(), _docId: d.id }));
      collectionsData[colName] = docsList;
      totalRecords += docsList.length;
    } catch {
      collectionsData[colName] = [];
    }
  }

  return {
    version: 'spppt-v2',
    exportedAt: new Date().toISOString(),
    classId,
    className,
    totalRecords,
    collections: collectionsData,
  };
}

export function downloadBackupJSON(payload: BackupPayload): void {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const dateTag = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `backup_spppt_${payload.classId}_${dateTag}.json`);
}

export function validateBackupFile(raw: unknown): { valid: boolean; error?: string; payload?: BackupPayload } {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Format JSON backup tidak valid.' };
  }
  const obj = raw as Record<string, unknown>;

  let rawCollections: Record<string, unknown> | null = null;
  if (obj.collections && typeof obj.collections === 'object') {
    rawCollections = obj.collections as Record<string, unknown>;
  } else if (obj.data && typeof obj.data === 'object') {
    rawCollections = obj.data as Record<string, unknown>;
  } else {
    const matchingKeys = BACKUP_COLLECTIONS.filter((k) => Array.isArray(obj[k]));
    if (
      matchingKeys.length > 0 ||
      Array.isArray(obj.tasks) ||
      Array.isArray(obj.directorTimeline) ||
      Array.isArray(obj.contentSchedule)
    ) {
      rawCollections = obj;
    }
  }

  if (!rawCollections) {
    return {
      valid: false,
      error: 'Struktur backup tidak dikenali. Pastikan file JSON berisi collections data SP-PPT.',
    };
  }

  const normalizedCollections: Record<string, Record<string, unknown>[]> = {};
  let totalRecords = 0;

  for (const [key, val] of Object.entries(rawCollections)) {
    if (!Array.isArray(val)) continue;
    const targetCol = LEGACY_COLLECTION_MAP[key] || key;
    if (!normalizedCollections[targetCol]) normalizedCollections[targetCol] = [];
    for (const item of val) {
      if (item && typeof item === 'object') {
        normalizedCollections[targetCol].push(item as Record<string, unknown>);
        totalRecords++;
      }
    }
  }

  if (totalRecords === 0) {
    return { valid: false, error: 'File backup tidak memiliki dokumen apa pun untuk dipulihkan.' };
  }

  const firstClassRow = normalizedCollections.classes?.[0];
  const detectedClassId = String(
    obj.classId ||
      firstClassRow?.id ||
      firstClassRow?._docId ||
      normalizedCollections.users?.[0]?.classId ||
      'IX-A'
  );
  const detectedClassName = String(
    obj.className || firstClassRow?.name || `Kelas ${detectedClassId}`
  );

  return {
    valid: true,
    payload: {
      version: String(obj.version || 'spppt-legacy'),
      exportedAt: String(obj.exportedAt || new Date().toISOString()),
      classId: detectedClassId,
      className: detectedClassName,
      totalRecords,
      collections: normalizedCollections,
    },
  };
}

function normalizeStageValue(raw: unknown): 'PERSIAPAN' | 'PELAKSANAAN' | 'PERTUNJUKAN' | 'PASCA' {
  const s = String(raw || 'PERSIAPAN').toUpperCase();
  if (s.includes('LAKSANA') || s === 'TAHAP_2') return 'PELAKSANAAN';
  if (s.includes('TUNJUK') || s.includes('PENTAS') || s === 'TAHAP_3') return 'PERTUNJUKAN';
  if (s.includes('PASCA') || s === 'TAHAP_4') return 'PASCA';
  return 'PERSIAPAN';
}

interface MigrationContext {
  sessionClassMap: Map<string, string>;
  knownUsers: UserProfile[];
}

async function sanitizeAndCommitCollection(
  colName: string,
  rows: Record<string, unknown>[],
  fallbackClassId: string,
  now: string,
  ctx?: MigrationContext
): Promise<number> {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let written = 0;

  const commitPairs = async (
    targetCollection: string,
    pairs: { docId: string; data: Record<string, unknown>; merge: boolean }[],
    nonFatalPermission = false
  ) => {
    for (let i = 0; i < pairs.length; i += 300) {
      if (isFirestoreQuotaExceeded()) {
        throw new Error('Quota limit exceeded (resource-exhausted).');
      }
      const slice = pairs.slice(i, i + 300);
      try {
        const batch = writeBatch(db);
        for (const item of slice) {
          batch.set(
            doc(db, targetCollection, item.docId),
            item.data,
            item.merge ? { merge: true } : {}
          );
        }
        await batch.commit();
        written += slice.length;
      } catch (err) {
        if (isQuotaExceededError(err)) {
          markFirestoreQuotaExceeded();
          throw err;
        }
        // Fallback: commit individually only for schema/rule validation issues on a single legacy row
        for (const item of slice) {
          if (isFirestoreQuotaExceeded()) break;
          try {
            await setDoc(
              doc(db, targetCollection, item.docId),
              item.data,
              item.merge ? { merge: true } : {}
            );
            written++;
          } catch (rowErr) {
            if (isQuotaExceededError(rowErr)) {
              markFirestoreQuotaExceeded();
              throw rowErr;
            }
            if (!nonFatalPermission) {
              // Skip single invalid legacy row
            }
          }
        }
      }
    }
  };

  // 1. Users: sanitize non-PII fields into users/{uid}, PII into userPrivate/{uid}, and Admin roles into admins/{uid}
  if (colName === 'users') {
    const userPairs: { docId: string; data: Record<string, unknown>; merge: boolean }[] = [];
    const privPairs: { docId: string; data: Record<string, unknown>; merge: boolean }[] = [];
    const adminPairs: { docId: string; data: Record<string, unknown>; merge: boolean }[] = [];

    for (const row of rows) {
      const uid = sanitizeId(row._docId || row.uid || row.id, 'usr');
      const normRole = normalizeUserRole(typeof row.role === 'string' ? row.role : undefined);
      const meta = getRoleMeta(normRole);
      const rowClassId = String(row.classId || fallbackClassId || 'IX-A').slice(0, 64) || 'IX-A';
      const classIds =
        Array.isArray(row.classIds) && row.classIds.length > 0
          ? row.classIds.map(String).slice(0, 20)
          : [rowClassId];
      const rawName = String(row.name || row.displayName || 'Pengguna').trim().slice(0, 120) || 'Pengguna';
      const rawPhoto =
        typeof row.photoUrl === 'string'
          ? row.photoUrl
          : typeof row.photoURL === 'string'
            ? row.photoURL
            : '';

      const userData = {
        uid,
        name: rawName,
        role: meta.role,
        divisionId: String(row.divisionId || meta.divisionId).slice(0, 60),
        divisionName: String(row.divisionName || meta.divisionName).slice(0, 80),
        classId: rowClassId,
        classIds,
        photoUrl: rawPhoto.slice(0, 390000),
        isActive: row.isActive !== false,
        createdAt: String(row.createdAt || now).slice(0, 64),
        updatedAt: String(row.updatedAt || now).slice(0, 64),
      };

      userPairs.push({ docId: uid, merge: true, data: userData });

      if (ctx) {
        ctx.knownUsers.push(userData as unknown as UserProfile);
      }

      if (meta.role === 'Super Admin' || meta.role === 'Admin') {
        adminPairs.push({
          docId: uid,
          merge: true,
          data: {
            uid,
            email: String(row.email || '').trim().slice(0, 200) || `${uid}@admin.spppt.local`,
            role: meta.role,
            createdAt: String(row.createdAt || now).slice(0, 64),
          },
        });
      }

      if (row.email || row.phone || row.nis) {
        privPairs.push({
          docId: uid,
          merge: true,
          data: {
            uid,
            email: String(row.email || '').slice(0, 200),
            phone: String(row.phone || '').slice(0, 32),
            nis: String(row.nis || '').slice(0, 40),
            classId: rowClassId,
            updatedAt: now,
          },
        });
      }
    }

    await commitPairs('users', userPairs);
    if (privPairs.length > 0) {
      await commitPairs('userPrivate', privPairs);
    }
    if (adminPairs.length > 0) {
      await commitPairs('admins', adminPairs, true);
    }
    return written;
  }

  // 2. userPrivate: enforce strict allowed keys
  if (colName === 'userPrivate') {
    const pairs = rows.map((row) => {
      const uid = sanitizeId(row._docId || row.uid || row.id, 'usr');
      return {
        docId: uid,
        merge: true,
        data: {
          uid,
          email: String(row.email || '').slice(0, 200),
          phone: String(row.phone || '').slice(0, 32),
          nis: String(row.nis || '').slice(0, 40),
          classId: String(row.classId || fallbackClassId || 'IX-A').slice(0, 64) || 'IX-A',
          updatedAt: String(row.updatedAt || now).slice(0, 64),
        },
      };
    });
    await commitPairs('userPrivate', pairs);
    return written;
  }

  // 3. userCredentials: enforce strict allowed keys
  if (colName === 'userCredentials') {
    const pairs = rows
      .filter((row) => Boolean(row.email))
      .map((row) => {
        const uid = sanitizeId(row._docId || row.uid || row.id, 'cred');
        return {
          docId: uid,
          merge: true,
          data: {
            uid,
            email: String(row.email || '').slice(0, 200),
            tempPassword: String(row.tempPassword || '').slice(0, 100),
            classId: String(row.classId || fallbackClassId || 'IX-A').slice(0, 64) || 'IX-A',
            createdBy: String(row.createdBy || 'migration').slice(0, 128),
            updatedAt: String(row.updatedAt || now).slice(0, 64),
          },
        };
      });
    await commitPairs('userCredentials', pairs);
    return written;
  }

  // 4. Classes: enforce allowed keys per firestore.rules (map kerabatKerja & kerabatLogo)
  if (colName === 'classes') {
    const pairs = rows.map((row) => {
      const cid = sanitizeId(row._docId || row.id || fallbackClassId, 'cls');
      const logoVal =
        typeof row.troupeLogo === 'string'
          ? row.troupeLogo
          : typeof row.kerabatLogo === 'string'
            ? row.kerabatLogo
            : '';
      return {
        docId: cid,
        merge: true,
        data: {
          id: cid,
          name: String(row.name || `Kelas ${cid}`).slice(0, 120) || `Kelas ${cid}`,
          code: String(row.code || `TEATER-${cid.toUpperCase()}-2026`).slice(0, 32) || `TEATER-${cid}`,
          troupeName: String(row.troupeName || row.kerabatKerja || row.name || cid).slice(0, 120),
          troupeLogo: logoVal.slice(0, 390000),
          teacherId: String(row.teacherId || '').slice(0, 128),
          academicYear: String(row.academicYear || '2025/2026').slice(0, 32),
          isActive: row.isActive !== false,
          createdAt: String(row.createdAt || now).slice(0, 64),
          updatedAt: now,
        },
      };
    });
    await commitPairs('classes', pairs);
    return written;
  }

  // 5. Assessments: enforce allowed keys and bounded totalScore
  if (colName === 'assessments') {
    const pairs = rows.map((row) => {
      const aid = sanitizeId(row._docId || row.id, 'ass');
      const scoreNum = Math.min(100, Math.max(0, Number(row.totalScore) || 0));
      const rawCat = String(row.assessorCategory || 'REKAN').toUpperCase();
      const cat = ['GURU', 'ATASAN', 'REKAN', 'BAWAHAN'].includes(rawCat) ? rawCat : 'REKAN';
      const stg = normalizeStageValue(row.stage || row.stageId);
      return {
        docId: aid,
        merge: true,
        data: {
          id: aid,
          classId: String(row.classId || fallbackClassId || 'IX-A').slice(0, 64) || 'IX-A',
          productionId: String(row.productionId || `prod_${fallbackClassId}`),
          studentId: sanitizeId(row.studentId, 'stu'),
          studentName: String(row.studentName || ''),
          studentRole: normalizeUserRole(String(row.studentRole || 'Pemeran')),
          studentDivision: String(row.studentDivision || 'Pemeran & Penyutradaraan'),
          assessorId: sanitizeId(row.assessorId, 'asr'),
          assessorName: String(row.assessorName || ''),
          assessorRole: normalizeUserRole(String(row.assessorRole || '')),
          assessorCategory: cat,
          stage: stg,
          scores: row.scores && typeof row.scores === 'object' ? row.scores : {},
          autoScores: row.autoScores && typeof row.autoScores === 'object' ? row.autoScores : {},
          totalScore: scoreNum,
          comment: String(row.comment || '').slice(0, 2000),
          isFinal: row.isFinal !== false,
          version: Number(row.version) || 1,
          createdAt: String(row.createdAt || now).slice(0, 64),
          updatedAt: String(row.updatedAt || now).slice(0, 64),
        },
      };
    });
    await commitPairs('assessments', pairs);
    return written;
  }

  // 6. Notifications: enforce allowed keys
  if (colName === 'notifications') {
    const pairs = rows.map((row) => {
      const nid = sanitizeId(row._docId || row.id, 'ntf');
      return {
        docId: nid,
        merge: true,
        data: {
          id: nid,
          userId: sanitizeId(row.userId, 'usr'),
          classId: String(row.classId || fallbackClassId || 'IX-A').slice(0, 64) || 'IX-A',
          title: String(row.title || 'Notifikasi').slice(0, 200) || 'Notifikasi',
          message: String(row.message || '-').slice(0, 2000) || '-',
          category: String(row.category || 'INFO').slice(0, 40),
          read: Boolean(row.read),
          link: String(row.link || 'dashboard').slice(0, 80),
          createdAt: String(row.createdAt || now).slice(0, 64),
        },
      };
    });
    await commitPairs('notifications', pairs);
    return written;
  }

  // 7. Complaints: preserve legacy title/description/category/evidenceUrl & enforce allowed keys
  if (colName === 'complaints') {
    const pairs = rows.map((row) => {
      const cid = sanitizeId(row._docId || row.id, 'cmp');
      const status = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(String(row.status))
        ? String(row.status)
        : 'OPEN';
      const subject = String(row.subject || row.title || 'Aduan').slice(0, 200) || 'Aduan';
      const message = String(row.message || row.description || '-').slice(0, 3000) || '-';
      const payload: Record<string, unknown> = {
        id: cid,
        classId: String(row.classId || fallbackClassId || 'IX-A').slice(0, 64) || 'IX-A',
        studentId: sanitizeId(row.studentId, 'stu'),
        studentName: String(row.studentName || ''),
        subject,
        title: String(row.title || subject).slice(0, 200),
        message,
        description: String(row.description || message).slice(0, 3000),
        isAnonymous: Boolean(row.isAnonymous),
        status,
        teacherResponse: String(row.teacherResponse || '').slice(0, 3000),
        respondedBy: String(row.respondedBy || ''),
        respondedAt: String(row.respondedAt || ''),
        createdAt: String(row.createdAt || now).slice(0, 64),
        updatedAt: String(row.updatedAt || now).slice(0, 64),
      };
      if (typeof row.category === 'string' && row.category.trim()) {
        payload.category = row.category.slice(0, 80);
      }
      if (typeof row.evidenceUrl === 'string' && row.evidenceUrl.trim()) {
        payload.evidenceUrl = row.evidenceUrl.slice(0, 1000);
      }
      return { docId: cid, merge: true, data: payload };
    });
    await commitPairs('complaints', pairs);
    return written;
  }

  // 8. crossClassBroadcasts: school-wide teacher/admin broadcast (no classId required)
  if (colName === 'crossClassBroadcasts') {
    const pairs = rows.map((row) => {
      const bcId = sanitizeId(row._docId || row.id, 'cbc');
      const payload: Record<string, unknown> = {
        id: bcId,
        title: String(row.title || 'Siaran Lintas Kelas').slice(0, 200) || 'Siaran Lintas Kelas',
        content: String(row.content || row.message || '-').slice(0, 4000),
        priority: ['NORMAL', 'HIGH', 'URGENT'].includes(String(row.priority)) ? String(row.priority) : 'NORMAL',
        senderId: sanitizeId(row.senderId || row.createdBy, 'guru'),
        senderName: String(row.senderName || 'Guru Pengampu').slice(0, 120),
        targetClassIds: Array.isArray(row.targetClassIds) ? row.targetClassIds.map(String).slice(0, 30) : [],
        createdAt: String(row.createdAt || now).slice(0, 64),
      };
      return { docId: bcId, merge: true, data: payload };
    });
    await commitPairs('crossClassBroadcasts', pairs, true);
    return written;
  }

  // 9. Skip immutable auditLogs on restore to avoid update rule denial on existing logs
  if (colName === 'auditLogs') {
    return 0;
  }

  // 10. All other class-scoped collections (enforce classId non-empty <= 64 and <= 40 keys)
  if (!BACKUP_COLLECTIONS.includes(colName as (typeof BACKUP_COLLECTIONS)[number])) {
    return 0;
  }

  const pairs = rows.map((row) => {
    const copy: Record<string, unknown> = { ...row };
    const docId = sanitizeId(copy._docId || copy.id || copy.uid, colName.slice(0, 4));
    delete copy._docId;

    // Normalize legacy attendanceSessions
    if (colName === 'attendanceSessions') {
      copy.stage = normalizeStageValue(copy.stage || copy.stageId);
      if (!copy.targetScope) copy.targetScope = 'SEMUA';
      const sessCid = String(copy.classId || fallbackClassId || 'IX-A').slice(0, 64) || 'IX-A';
      if (ctx) {
        ctx.sessionClassMap.set(docId, sessCid);
        if (copy.id) ctx.sessionClassMap.set(String(copy.id), sessCid);
      }
    }

    // Backfill classId on legacy attendanceRecords from sessionClassMap
    if (colName === 'attendanceRecords' && (!copy.classId || String(copy.classId).trim() === '')) {
      const matchedCid = ctx?.sessionClassMap.get(String(copy.sessionId || ''));
      if (matchedCid) copy.classId = matchedCid;
    }

    // Normalize legacy deadline fields seamlessly
    if (colName === 'deadlines') {
      copy.stage = normalizeStageValue(copy.stage || copy.stageId);
      if (copy.status === 'ACTIVE' || !copy.status) {
        copy.status = 'PENDING';
      }
      if (!copy.targetScope) {
        copy.targetScope = 'SEMUA';
      }
      const dlClassId = String(copy.classId || fallbackClassId || 'IX-A').slice(0, 64) || 'IX-A';
      if (
        copy.targetScope === 'CUSTOM' &&
        (!Array.isArray(copy.targetUserIds) || copy.targetUserIds.length === 0) &&
        ctx &&
        ctx.knownUsers.length > 0
      ) {
        const tRoles = Array.isArray(copy.targetRoles) ? copy.targetRoles.map((r) => normalizeUserRole(String(r))) : [];
        const tDivs = Array.isArray(copy.targetDivisions) ? copy.targetDivisions.map(String) : [];
        if (tRoles.length > 0 || tDivs.length > 0) {
          copy.targetUserIds = ctx.knownUsers
            .filter(
              (u) =>
                (u.classId === dlClassId || u.classIds?.includes(dlClassId)) &&
                (tRoles.includes(u.role) || tDivs.includes(u.divisionName))
            )
            .map((u) => u.uid);
        }
      }
    }

    // Normalize legacy deadlineSubmissions fields
    if (colName === 'deadlineSubmissions') {
      const wasDone =
        copy.status === 'SELESAI' ||
        copy.status === 'TERLAMBAT' ||
        copy.completed === true ||
        (typeof copy.progress === 'number' && copy.progress >= 100);
      if (copy.status !== 'TERLAMBAT') {
        copy.status = wasDone ? 'SELESAI' : String(copy.status || 'BELUM');
      }
      if (!copy.photos && Array.isArray(copy.evidencePhotos)) {
        copy.photos = copy.evidencePhotos;
      }
      if (!copy.linkUrl && copy.proofUrl) {
        copy.linkUrl = copy.proofUrl;
      }
      if (!copy.notes && copy.proofNote) {
        copy.notes = copy.proofNote;
      }
      if (copy.feedbackScore === undefined && copy.rating !== undefined) {
        copy.feedbackScore = copy.rating;
      }
      if (!copy.feedback && copy.reviewNote) {
        copy.feedback = copy.reviewNote;
      }
      if (!copy.submittedAt && wasDone) {
        copy.submittedAt = String(copy.updatedAt || copy.createdAt || now);
      }
    }

    // Normalize legacy rabItems fields
    if (colName === 'rabItems') {
      const qty = Number(copy.quantity ?? copy.qty) || 1;
      const unitPrice = Number(copy.unitPrice) || 0;
      copy.quantity = qty;
      copy.unitPrice = unitPrice;
      copy.totalPrice = Number(copy.totalPrice) || qty * unitPrice;
      copy.division = String(copy.division || copy.targetName || copy.category || 'Umum').slice(0, 80);
      copy.status = ['ESTIMASI', 'DISETUJUI', 'DIBAYAR', 'REALISASI'].includes(String(copy.status))
        ? copy.status
        : 'ESTIMASI';
    }

    // Normalize legacy interClassEvents / crossClassMessages
    if (colName === 'interClassEvents') {
      const resolvedSenderCid = String(copy.classId || copy.senderClassId || fallbackClassId || 'IX-A').slice(0, 64);
      copy.classId = resolvedSenderCid;
      if (!Array.isArray(copy.involvedClassIds) || copy.involvedClassIds.length === 0) {
        copy.involvedClassIds =
          Array.isArray(copy.targetClassIds) && copy.targetClassIds.length > 0
            ? copy.targetClassIds
            : [resolvedSenderCid];
      }
      if (!copy.title && copy.content) {
        copy.title = String(copy.content).slice(0, 180);
      }
    }

    const resolvedClassId = String(copy.classId || fallbackClassId || 'IX-A').slice(0, 64) || 'IX-A';
    const trimmed: Record<string, unknown> = {
      id: String(copy.id || docId),
      classId: resolvedClassId,
    };
    for (const k of Object.keys(copy)) {
      if (k === 'id' || k === 'classId') continue;
      if (Object.keys(trimmed).length >= 40) break;
      if (copy[k] !== undefined) trimmed[k] = copy[k];
    }
    return { docId, data: trimmed, merge: true };
  });
  await commitPairs(colName, pairs);
  return written;
}

export async function restoreClassBackup(payload: BackupPayload): Promise<number> {
  const now = new Date().toISOString();
  let restoredCount = 0;
  const ctx: MigrationContext = {
    sessionClassMap: new Map(),
    knownUsers: [],
  };

  const priorityOrder = ['classes', 'users', 'userPrivate', 'attendanceSessions', 'deadlines'];
  const entries = Object.entries(payload.collections).sort(([a], [b]) => {
    const ia = priorityOrder.indexOf(a);
    const ib = priorityOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  for (const [colName, rows] of entries) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    restoredCount += await sanitizeAndCommitCollection(colName, rows, payload.classId, now, ctx);
  }

  const markBatch = writeBatch(db);
  markBatch.set(
    doc(db, 'systemConfig', 'seedStatus'),
    {
      skipAutoSeed: true,
      restoredClassId: payload.classId,
      updatedAt: now,
    },
    { merge: true }
  );
  await markBatch.commit();

  return restoredCount;
}

export async function syncSingleUserFromLegacyDb(
  uid: string,
  emailHint?: string
): Promise<UserProfile | null> {
  try {
    let sourceUid = uid;
    let raw: Record<string, unknown> | null = null;

    const legacySnap = await getDoc(doc(legacyDefaultDb, 'users', uid)).catch(() => null);
    if (legacySnap?.exists()) {
      raw = legacySnap.data() as Record<string, unknown>;
    } else if (emailHint && emailHint.trim()) {
      const cleanEmail = emailHint.trim();
      const lowerEmail = cleanEmail.toLowerCase();
      const byExact = await getDocs(
        query(collection(legacyDefaultDb, 'users'), where('email', '==', cleanEmail), limit(1))
      ).catch(() => null);
      if (byExact && !byExact.empty) {
        sourceUid = byExact.docs[0].id;
        raw = byExact.docs[0].data() as Record<string, unknown>;
      } else {
        const byLower = await getDocs(
          query(collection(legacyDefaultDb, 'users'), where('email', '==', lowerEmail), limit(1))
        ).catch(() => null);
        if (byLower && !byLower.empty) {
          sourceUid = byLower.docs[0].id;
          raw = byLower.docs[0].data() as Record<string, unknown>;
        } else {
          // Also check legacyDefaultDb/userPrivate by email
          const privByEmail = await getDocs(
            query(collection(legacyDefaultDb, 'userPrivate'), where('email', '==', lowerEmail), limit(1))
          ).catch(() => null);
          if (privByEmail && !privByEmail.empty) {
            sourceUid = privByEmail.docs[0].id;
            const linkedUser = await getDoc(doc(legacyDefaultDb, 'users', sourceUid)).catch(() => null);
            if (linkedUser?.exists()) {
              raw = linkedUser.data() as Record<string, unknown>;
            }
          }
        }
      }
    }

    if (!raw) return null;

    const legacyPrivSnap = await getDoc(doc(legacyDefaultDb, 'userPrivate', sourceUid)).catch(() => null);
    const legacyPriv = legacyPrivSnap?.exists() ? (legacyPrivSnap.data() as Record<string, unknown>) : null;

    const now = new Date().toISOString();
    const normRole = normalizeUserRole(typeof raw.role === 'string' ? raw.role : undefined);
    const meta = getRoleMeta(normRole);
    const rowClassId = String(raw.classId || 'IX-A').slice(0, 64) || 'IX-A';
    const classIds =
      Array.isArray(raw.classIds) && raw.classIds.length > 0
        ? raw.classIds.map(String).slice(0, 20)
        : [rowClassId];
    const rawPhoto =
      typeof raw.photoUrl === 'string'
        ? raw.photoUrl
        : typeof raw.photoURL === 'string'
          ? raw.photoURL
          : '';

    const publicDoc: Record<string, unknown> = {
      uid,
      name: String(raw.name || raw.displayName || 'Pengguna').trim().slice(0, 120) || 'Pengguna',
      role: meta.role,
      divisionId: String(raw.divisionId || meta.divisionId).slice(0, 60),
      divisionName: String(raw.divisionName || meta.divisionName).slice(0, 80),
      classId: rowClassId,
      classIds,
      photoUrl: rawPhoto.slice(0, 390000),
      isActive: raw.isActive !== false,
      createdAt: String(raw.createdAt || now).slice(0, 64),
      updatedAt: String(raw.updatedAt || now).slice(0, 64),
    };

    const email = String(legacyPriv?.email || raw.email || emailHint || '').slice(0, 200);
    const phone = String(legacyPriv?.phone || raw.phone || '').slice(0, 32);
    const nis = String(legacyPriv?.nis || raw.nis || '').slice(0, 40);

    try {
      await setDoc(doc(db, 'users', uid), publicDoc, { merge: true });
      await setDoc(
        doc(db, 'userPrivate', uid),
        { uid, email, phone, nis, classId: rowClassId, updatedAt: now },
        { merge: true }
      );
    } catch {
      // Non-student legacy profile self-creation may require admin migration first
    }

    return {
      ...(publicDoc as unknown as UserProfile),
      email,
      phone,
      nis,
    };
  } catch {
    return null;
  }
}

export interface LegacyInspectionResult {
  readable: boolean;
  classesCount: number;
  usersCount: number;
  deadlinesCount: number;
  assessmentsCount: number;
  errorMessage?: string;
}

export async function inspectLegacyDefaultDatabase(): Promise<LegacyInspectionResult> {
  try {
    const [clsSnap, usrSnap, dlSnap, assSnap] = await Promise.all([
      getDocs(collection(legacyDefaultDb, 'classes')).catch(() => null),
      getDocs(collection(legacyDefaultDb, 'users')).catch(() => null),
      getDocs(collection(legacyDefaultDb, 'deadlines')).catch(() => null),
      getDocs(collection(legacyDefaultDb, 'assessments')).catch(() => null),
    ]);
    const readable = Boolean(clsSnap || usrSnap || dlSnap || assSnap);
    return {
      readable,
      classesCount: clsSnap?.size || 0,
      usersCount: usrSnap?.size || 0,
      deadlinesCount: dlSnap?.size || 0,
      assessmentsCount: assSnap?.size || 0,
      errorMessage: readable
        ? undefined
        : 'Tidak dapat membaca database (default) pada project ini (periksa aturan Firestore database (default) atau gunakan Restore JSON).',
    };
  } catch (err) {
    return {
      readable: false,
      classesCount: 0,
      usersCount: 0,
      deadlinesCount: 0,
      assessmentsCount: 0,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface LegacyMigrationResult {
  totalCopied: number;
  classesCount: number;
  usersCount: number;
  skippedCollections: string[];
  errors: Record<string, string>;
}

let inFlightLegacyMigration: Promise<LegacyMigrationResult> | null = null;

export function migrateFromLegacyDefaultDatabase(
  _actor?: UserProfile
): Promise<LegacyMigrationResult> {
  if (inFlightLegacyMigration) return inFlightLegacyMigration;
  inFlightLegacyMigration = runLegacyDefaultDatabaseMigration(_actor).finally(() => {
    inFlightLegacyMigration = null;
  });
  return inFlightLegacyMigration;
}

async function runLegacyDefaultDatabaseMigration(
  _actor?: UserProfile
): Promise<LegacyMigrationResult> {
  const now = new Date().toISOString();
  let totalCopied = 0;
  let classesCount = 0;
  let usersCount = 0;
  const skippedCollections: string[] = [];
  const errors: Record<string, string> = {};
  const discoveredClassIds = new Set<string>(['IX-A', 'IX-B']);
  let fallbackClassId = 'IX-A';
  const ctx: MigrationContext = {
    sessionClassMap: new Map(),
    knownUsers: [],
  };

  // Read classes first so we know classIds
  try {
    const classSnap = await getDocs(collection(legacyDefaultDb, 'classes'));
    if (!classSnap.empty) {
      const classRows = classSnap.docs.map((d) => ({ ...d.data(), _docId: d.id }));
      classRows.forEach((c) => {
        const cid = sanitizeId(c._docId || (c as Record<string, unknown>).id, 'cls');
        discoveredClassIds.add(cid);
      });
      fallbackClassId = sanitizeId(
        classRows[0]._docId || (classRows[0] as Record<string, unknown>).id,
        'IX-A'
      );
      const count = await sanitizeAndCommitCollection('classes', classRows, fallbackClassId, now, ctx);
      classesCount = classRows.length;
      totalCopied += count;
    }
  } catch (err) {
    skippedCollections.push('classes');
    errors.classes = err instanceof Error ? err.message : String(err);
  }

  // Order users and attendanceSessions before attendanceRecords & deadlines so ctx maps are populated
  const remainingBase = BACKUP_COLLECTIONS.filter(
    (c) => !['classes', 'auditLogs', 'users', 'userPrivate', 'attendanceSessions', 'deadlines'].includes(c)
  );
  const collectionsToMigrate: string[] = [
    'users',
    'userPrivate',
    'attendanceSessions',
    'deadlines',
    'tasks',
    ...remainingBase,
    'directorTimeline',
    'contentSchedule',
    'crossClassMessages',
  ];

  for (const sourceCol of collectionsToMigrate) {
    if (isFirestoreQuotaExceeded()) {
      skippedCollections.push(sourceCol);
      errors[sourceCol] = 'Dihentikan sementara: kuota tulis harian Firestore (free tier) tercapai.';
      continue;
    }
    try {
      const snap = await getDocs(collection(legacyDefaultDb, sourceCol));
      if (snap.empty) continue;

      const targetCol = LEGACY_COLLECTION_MAP[sourceCol] || sourceCol;
      const rows = snap.docs.map((d) => ({ ...d.data(), _docId: d.id }));
      const count = await sanitizeAndCommitCollection(targetCol, rows, fallbackClassId, now, ctx);
      if (targetCol === 'users') {
        usersCount = rows.length;
      }
      totalCopied += count;
    } catch (err) {
      if (isQuotaExceededError(err)) {
        markFirestoreQuotaExceeded();
      }
      skippedCollections.push(sourceCol);
      errors[sourceCol] = err instanceof Error ? err.message : String(err);
    }
  }

  // Migrate systemConfig/driveFolders
  if (!isFirestoreQuotaExceeded()) {
    try {
      const driveSnap = await getDoc(doc(legacyDefaultDb, 'systemConfig', 'driveFolders'));
      if (driveSnap.exists()) {
        await setDoc(
          doc(db, 'systemConfig', 'driveFolders'),
          { ...driveSnap.data(), updatedAt: now },
          { merge: true }
        );
        totalCopied++;
      }
    } catch (err) {
      if (isQuotaExceededError(err)) markFirestoreQuotaExceeded();
    }
  }

  // Migrate per-class config subcollections (stageManager & assessorWeights)
  if (!isFirestoreQuotaExceeded()) {
    for (const cid of discoveredClassIds) {
      if (isFirestoreQuotaExceeded()) break;
      for (const cfgId of ['stageManager', 'assessorWeights'] as const) {
        if (isFirestoreQuotaExceeded()) break;
        try {
          const cfgSnap = await getDoc(doc(legacyDefaultDb, 'classes', cid, 'config', cfgId));
          if (cfgSnap.exists()) {
            await setDoc(
              doc(db, 'classes', cid, 'config', cfgId),
              { ...cfgSnap.data(), updatedAt: now },
              { merge: true }
            );
            totalCopied++;
          }
        } catch (err) {
          if (isQuotaExceededError(err)) markFirestoreQuotaExceeded();
        }
      }
    }
  }

  // Mark attempt timestamp so auto-migration doesn't loop endlessly on page reload
  if (!isFirestoreQuotaExceeded()) {
    await setDoc(
      doc(db, 'systemConfig', 'seedStatus'),
      {
        skipAutoSeed: true,
        migratedFromDefault: totalCopied > 0,
        lastMigratedCount: totalCopied,
        lastAttemptAt: now,
        updatedAt: now,
      },
      { merge: true }
    ).catch((err) => {
      if (isQuotaExceededError(err)) markFirestoreQuotaExceeded();
    });
  }

  return {
    totalCopied,
    classesCount,
    usersCount,
    skippedCollections,
    errors,
  };
}

export interface LegacyRepairResult {
  sessionsFixed: number;
  deadlinesFixed: number;
  submissionsFixed: number;
  rabFixed: number;
  totalUpdated: number;
}

export async function repairLegacyClassData(
  classId: string,
  members: UserProfile[]
): Promise<LegacyRepairResult> {
  if (isFirestoreQuotaExceeded()) {
    throw new Error('Kuota tulis harian Firestore tercapai. Coba lagi nanti.');
  }

  const now = new Date().toISOString();
  const updates: { col: string; id: string; fields: Record<string, unknown> }[] = [];
  let sessionsFixed = 0;
  let deadlinesFixed = 0;
  let submissionsFixed = 0;
  let rabFixed = 0;

  const [sessSnap, dlSnap, subSnap, rabSnap] = await Promise.all([
    getDocs(query(collection(db, 'attendanceSessions'), where('classId', '==', classId))),
    getDocs(query(collection(db, 'deadlines'), where('classId', '==', classId))),
    getDocs(query(collection(db, 'deadlineSubmissions'), where('classId', '==', classId))),
    getDocs(query(collection(db, 'rabItems'), where('classId', '==', classId))),
  ]);

  for (const d of sessSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    const normalizedStage = normalizeStageValue(data.stage || data.stageId);
    const patch: Record<string, unknown> = {};
    if (data.stage !== normalizedStage) patch.stage = normalizedStage;
    if (!data.targetScope) patch.targetScope = 'SEMUA';
    if (Object.keys(patch).length > 0) {
      sessionsFixed++;
      updates.push({ col: 'attendanceSessions', id: d.id, fields: patch });
    }
  }

  for (const d of dlSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    const normalizedStage = normalizeStageValue(data.stage || data.stageId);
    const patch: Record<string, unknown> = {};
    if (data.stage !== normalizedStage) patch.stage = normalizedStage;
    if (data.status === 'ACTIVE' || !data.status) patch.status = 'PENDING';
    if (!data.targetScope) patch.targetScope = 'SEMUA';

    if (
      data.targetScope === 'CUSTOM' &&
      (!Array.isArray(data.targetUserIds) || data.targetUserIds.length === 0) &&
      members.length > 0
    ) {
      const tRoles = Array.isArray(data.targetRoles) ? data.targetRoles.map((r) => normalizeUserRole(String(r))) : [];
      const tDivs = Array.isArray(data.targetDivisions) ? data.targetDivisions.map(String) : [];
      if (tRoles.length > 0 || tDivs.length > 0) {
        const matched = members
          .filter((u) => tRoles.includes(u.role) || tDivs.includes(u.divisionName))
          .map((u) => u.uid);
        if (matched.length > 0) patch.targetUserIds = matched;
      }
    }

    if (Object.keys(patch).length > 0) {
      deadlinesFixed++;
      updates.push({ col: 'deadlines', id: d.id, fields: patch });
    }
  }

  for (const d of subSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const legacyDone =
      data.completed === true || (typeof data.progress === 'number' && data.progress >= 100);
    if (legacyDone && (!data.status || data.status === 'BELUM')) {
      patch.status = 'SELESAI';
    }
    if (!data.photos && Array.isArray(data.evidencePhotos)) {
      patch.photos = data.evidencePhotos;
    }
    if (!data.linkUrl && data.proofUrl) {
      patch.linkUrl = data.proofUrl;
    }
    if (!data.notes && data.proofNote) {
      patch.notes = data.proofNote;
    }
    if (data.feedbackScore === undefined && data.rating !== undefined) {
      patch.feedbackScore = data.rating;
    }
    if (!data.feedback && data.reviewNote) {
      patch.feedback = data.reviewNote;
    }
    if (Object.keys(patch).length > 0) {
      submissionsFixed++;
      updates.push({ col: 'deadlineSubmissions', id: d.id, fields: patch });
    }
  }

  for (const d of rabSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const qty = Number(data.quantity ?? data.qty) || 1;
    const unitPrice = Number(data.unitPrice) || 0;
    if (typeof data.quantity !== 'number') patch.quantity = qty;
    if (typeof data.totalPrice !== 'number' || (data.totalPrice === 0 && unitPrice > 0)) {
      patch.totalPrice = qty * unitPrice;
    }
    if (!data.division && (data.targetName || data.category)) {
      patch.division = String(data.targetName || data.category || 'Umum').slice(0, 80);
    }
    if (!data.status) {
      patch.status = 'ESTIMASI';
    }
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = now;
      rabFixed++;
      updates.push({ col: 'rabItems', id: d.id, fields: patch });
    }
  }

  for (let i = 0; i < updates.length; i += 350) {
    if (isFirestoreQuotaExceeded()) break;
    const slice = updates.slice(i, i + 350);
    const batch = writeBatch(db);
    for (const u of slice) {
      batch.set(doc(db, u.col, u.id), u.fields, { merge: true });
    }
    try {
      await batch.commit();
    } catch (err) {
      if (isQuotaExceededError(err)) {
        markFirestoreQuotaExceeded();
      }
      throw err;
    }
  }

  return {
    sessionsFixed,
    deadlinesFixed,
    submissionsFixed,
    rabFixed,
    totalUpdated: updates.length,
  };
}

