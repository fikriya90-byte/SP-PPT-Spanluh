import { collection, doc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';
import {
  BookingItem,
  DeadlineSubmission,
  DeadlineTask,
  KasPayment,
  KasSetting,
  ScheduleItem,
  UserProfile,
} from '../core/types';
import { isTaskRelevantToUser } from '../services/autoScoreService';
import {
  db,
  isFirestoreQuotaExceeded,
  isQuotaExceededError,
  markFirestoreQuotaExceeded,
} from '../services/firebase';
import { notifyUsers } from '../services/firestoreService';

export async function runAllReminders(params: {
  classId: string;
  users: UserProfile[];
  deadlines: DeadlineTask[];
  submissions: DeadlineSubmission[];
  schedules: ScheduleItem[];
  kasSettings: KasSetting[];
  kasPayments: KasPayment[];
  bookings: BookingItem[];
}): Promise<number> {
  const { classId, users, deadlines, submissions, schedules, kasSettings, kasPayments, bookings } = params;
  if (!classId || users.length === 0 || isFirestoreQuotaExceeded()) return 0;

  const sweepStorageKey = `spppt_rem_sweep_${classId}`;
  try {
    const lastSweep = Number(localStorage.getItem(sweepStorageKey) || '0');
    if (Date.now() - lastSweep < 25 * 60 * 1000) {
      return 0;
    }
    localStorage.setItem(sweepStorageKey, String(Date.now()));
  } catch {
    // Ignore storage access errors
  }

  const existingLogsSnap = await getDocs(
    query(collection(db, 'reminderLog'), where('classId', '==', classId), limit(300))
  ).catch((err) => {
    if (isQuotaExceededError(err)) markFirestoreQuotaExceeded();
    return null;
  });
  if (isFirestoreQuotaExceeded()) return 0;

  const sentKeys = new Set<string>(existingLogsSnap ? existingLogsSnap.docs.map((d) => d.id) : []);

  const markReminderSent = async (key: string, kind: string) => {
    sentKeys.add(key);
    if (isFirestoreQuotaExceeded()) return;
    try {
      await setDoc(doc(db, 'reminderLog', key), {
        id: key,
        classId,
        kind,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      if (isQuotaExceededError(err)) {
        markFirestoreQuotaExceeded();
      }
    }
  };

  const now = Date.now();
  const students = users.filter((u) => !['Super Admin', 'Admin', 'Guru Pengampu'].includes(u.role));
  const teachers = users.filter((u) => ['Guru Pengampu', 'Admin', 'Super Admin'].includes(u.role));
  const bendahara = users.filter((u) => u.role === 'Bendahara');
  let sentCount = 0;

  // 1. Deadline reminders (H-3, H-1, OVERDUE)
  for (const task of deadlines.filter((d) => d.status === 'PENDING')) {
    const dueMs = new Date(task.dueDate).getTime();
    if (Number.isNaN(dueMs)) continue;
    const hoursDiff = (dueMs - now) / 3600000;
    let tag: string | null = null;
    if (hoursDiff <= 72 && hoursDiff > 24) tag = 'H3';
    else if (hoursDiff <= 24 && hoursDiff > 1) tag = 'H1';
    else if (hoursDiff <= 1 && hoursDiff > 0) tag = 'H1J';
    else if (hoursDiff < 0 && hoursDiff > -72) tag = 'OVERDUE';

    if (!tag) continue;
    const remKey = `rem_dl_${task.id}_${tag}`;
    if (sentKeys.has(remKey)) continue;

    const targetStudents = students.filter((s) => {
      if (!isTaskRelevantToUser(task, s)) return false;
      const sub = submissions.find((x) => x.deadlineId === task.id && x.studentId === s.uid);
      return !sub || sub.status === 'BELUM';
    });

    if (targetStudents.length > 0) {
      await notifyUsers({
        userIds: targetStudents.map((s) => s.uid),
        classId,
        title: `Reminder Deadline (${tag === 'OVERDUE' ? 'Terlewat' : tag}): ${task.title}`,
        message: `Batas pengumpulan tugas "${task.title}" adalah ${new Date(task.dueDate).toLocaleString('id-ID')}. Segera unggah bukti penyelesaian.`,
        category: tag === 'OVERDUE' ? 'Urgent' : 'Reminder',
        link: 'tugas',
      });
      await markReminderSent(remKey, 'DEADLINE');
      sentCount++;
    }
  }

  // 2. Schedule reminders (H-1, H-1JAM)
  for (const sched of schedules) {
    const startMs = new Date(sched.startAt).getTime();
    if (Number.isNaN(startMs)) continue;
    const hoursDiff = (startMs - now) / 3600000;
    let tag: string | null = null;
    if (hoursDiff >= 20 && hoursDiff <= 25) tag = 'H1';
    else if (hoursDiff >= 0.5 && hoursDiff <= 1.5) tag = 'H1J';
    if (!tag) continue;

    const remKey = `rem_sch_${sched.id}_${tag}`;
    if (sentKeys.has(remKey)) continue;

    await notifyUsers({
      userIds: students.map((s) => s.uid),
      classId,
      title: `Pengingat Jadwal (${tag === 'H1' ? 'Besok' : '1 Jam Lagi'}): ${sched.title}`,
      message: `Agenda "${sched.title}" di ${sched.location} dimulai pukul ${new Date(sched.startAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}.`,
      category: 'Reminder',
      link: 'jadwal',
    });
    await markReminderSent(remKey, 'SCHEDULE');
    sentCount++;
  }

  // 3. Kas reminders (H-3, H-1, OVERDUE)
  for (const kas of kasSettings.filter((k) => k.active)) {
    const dlMs = new Date(kas.deadline).getTime();
    if (Number.isNaN(dlMs)) continue;
    const hoursDiff = (dlMs - now) / 3600000;
    let tag: string | null = null;
    if (hoursDiff <= 72 && hoursDiff > 24) tag = 'H3';
    else if (hoursDiff <= 24 && hoursDiff > 0) tag = 'H1';
    else if (hoursDiff < 0 && hoursDiff > -168) tag = 'OVERDUE';
    if (!tag) continue;

    const remKey = `rem_kas_${kas.id}_${tag}`;
    if (sentKeys.has(remKey)) continue;

    const unpaid = students.filter((s) => {
      const p = kasPayments.find((pay) => pay.kasId === kas.id && pay.studentId === s.uid);
      return !p || !p.paid;
    });

    if (unpaid.length > 0) {
      await notifyUsers({
        userIds: unpaid.map((s) => s.uid),
        classId,
        title: `Pengingat Kas (${tag}): ${kas.title}`,
        message: `Iuran "${kas.title}" sebesar Rp${kas.amount.toLocaleString('id-ID')} jatuh tempo ${kas.deadline}.`,
        category: 'Keuangan',
        link: 'kas',
      });
      if (tag === 'OVERDUE' && bendahara.length > 0) {
        await notifyUsers({
          userIds: bendahara.map((b) => b.uid),
          classId,
          title: `Laporan Kas Jatuh Tempo: ${kas.title}`,
          message: `Terdapat ${unpaid.length} anggota yang belum melunasi kas "${kas.title}".`,
          category: 'Keuangan',
          link: 'kas',
        });
      }
      await markReminderSent(remKey, 'KAS');
      sentCount++;
    }
  }

  // 4. Booking reminders (PENDING > 12h & OVERDUE +10m)
  for (const b of bookings) {
    if (b.status === 'PENDING') {
      const createdMs = new Date(b.createdAt).getTime();
      if (!Number.isNaN(createdMs) && now - createdMs > 12 * 3600000) {
        const remKey = `rem_bk_pend_${b.id}`;
        if (!sentKeys.has(remKey) && teachers.length > 0) {
          await notifyUsers({
            userIds: teachers.map((t) => t.uid),
            classId,
            title: `Booking Menunggu Persetujuan: ${b.equipmentName}`,
            message: `Permintaan pinjam "${b.equipmentName}" oleh ${b.bookerName} belum diproses lebih dari 12 jam.`,
            category: 'Reminder',
            link: 'booking',
          });
          await markReminderSent(remKey, 'BOOKING_PENDING');
          sentCount++;
        }
      }
    }

    if (b.status === 'CHECKED_OUT') {
      const endMs = new Date(`${b.date}T${b.endTime}:00`).getTime();
      if (!Number.isNaN(endMs) && now > endMs + 10 * 60000) {
        const remKey = `rem_bk_over_${b.id}`;
        if (!sentKeys.has(remKey)) {
          await notifyUsers({
            userIds: [b.bookerId, ...teachers.map((t) => t.uid)],
            classId,
            title: `Alat Terlambat Dikembalikan: ${b.equipmentName}`,
            message: `Peminjaman "${b.equipmentName}" oleh ${b.bookerName} telah melewati batas waktu ${b.endTime}. Segera lakukan pengembalian.`,
            category: 'Urgent',
            link: 'booking',
          });
          await markReminderSent(remKey, 'BOOKING_OVERDUE');
          sentCount++;
        }
      }
    }
  }

  return sentCount;
}
