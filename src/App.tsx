import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User as FirebaseUser, onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  AlertTriangle,
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Settings,
} from 'lucide-react';
import { LoginView } from './components/auth/LoginView';
import { NAV_GROUPS, Sidebar } from './components/common/Sidebar';
import { ThemeSwitcher } from './components/common/ThemeSwitcher';
import { useToast } from './components/common/Toast';
import {
  ActivityLogModule,
  AdminModule,
  BackupModule,
  DebugUsersModule,
  ManageStudentModule,
  SettingsModule,
} from './components/modules/AdminAndSystemModules';
import {
  CostumeModule,
  FaceChartModule,
  MusicCueModule,
  PropertyModule,
} from './components/modules/ArtisticModules';
import { AssessmentModule } from './components/modules/AssessmentModule';
import { AttendanceModule, AttendanceStatsModule } from './components/modules/AttendanceModules';
import {
  BookingCalendarModule,
  BookingModule,
  ComplaintModule,
  DocumentModule,
  NotulensiModule,
} from './components/modules/BookingAndArchiveModules';
import { DashboardModule } from './components/modules/DashboardModule';
import { DeadlineModule, TemplateHubModule } from './components/modules/DeadlineAndTemplateModules';
import { KasModule, RABModule } from './components/modules/FinanceModules';
import { GuideModule } from './components/modules/GuideModule';
import {
  BroadcastModule,
  InformationModule,
  WelcomeBroadcastModule,
} from './components/modules/InformationAndBroadcastModules';
import { GradeRecapModule, ModerationModule } from './components/modules/ModerationAndRecapModules';
import { MyGradeModule } from './components/modules/MyGradeModule';
import { NotificationModule } from './components/modules/NotificationModule';
import { ActivityCalendarModule, ScheduleModule } from './components/modules/ScheduleAndCalendarModules';
import { AssessmentScheduleModule, StageManagerModule } from './components/modules/StageModules';
import {
  InterClassCoordModule,
  ManageClassModule,
  StructureModule,
} from './components/modules/StructureAndClassModules';
import { StudioModule } from './components/modules/StudioModule';
import {
  ContentScheduleModule,
  DirectorTimelineModule,
  DivisionScheduleModule,
  MasterTimelineModule,
} from './components/modules/TimelineModules';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  DEFAULT_ASSESSOR_WEIGHTS,
  DEFAULT_STAGE_WEIGHTS,
  SCHOOL_INFO,
  STAGE_LABELS,
  canAccessModule,
  isCoreCommitteeRole,
  isTeacherOrAdmin,
} from './core/constants';
import { DEFAULT_DRIVE_FOLDERS } from './core/driveFolders';
import { useTheme } from './core/themeContext';
import {
  Assessment,
  AssessmentHistory,
  AssessorWeightsConfig,
  AttendanceRecord,
  AttendanceSession,
  AuditLogItem,
  BookingItem,
  BroadcastItem,
  CashEntry,
  ComplaintItem,
  ContentScheduleItem,
  CostumeItem,
  DeadlineSubmission,
  DeadlineTask,
  DirectorTimelineItem,
  DivisionScheduleItem,
  DocumentItem,
  DriveFolderItem,
  EquipmentItem,
  FaceChart,
  InformationItem,
  InterClassEvent,
  KasPayment,
  KasPeriod,
  KasSetting,
  ModuleId,
  MusicCue,
  MusicReference,
  NotificationItem,
  NotulensiItem,
  Production,
  PromptBookScene,
  PropertyItem,
  RabItem,
  ScheduleConfirmation,
  ScheduleItem,
  SchoolClass,
  ScriptItem,
  StageManagerConfig,
  TimelineConfig,
  TimelineWeek,
  UserCredential,
  UserPrivate,
  UserProfile,
} from './core/types';
import {
  OperationType,
  auth,
  db,
  firebaseConfig,
  handleFirestoreError,
  isFirestoreQuotaExceeded,
  isQuotaExceededError,
  markFirestoreQuotaExceeded,
  subscribeQuotaStatus,
  testConnection,
} from './services/firebase';
import {
  createDefaultStageManager,
  enrichUser,
  recordAuditLog,
  saveUserProfileBundle,
  subscribeAllActiveClasses,
  subscribeAllUsersForAdmin,
  subscribeAssessorWeights,
  subscribeAuditLogs,
  subscribeClassCollection,
  subscribeClassUsers,
  subscribeDriveFolders,
  subscribeEquipmentList,
  subscribeStageManager,
  subscribeUserNotifications,
} from './services/firestoreService';
import {
  migrateFromLegacyDefaultDatabase,
  syncSingleUserFromLegacyDb,
} from './services/backupRestore';
import { runAllReminders } from './utils/reminder';

export default function App() {
  useTheme();
  const { showToast } = useToast();

  // Auth state
  const [authLoading, setAuthLoading] = useState(true);
  const [pendingGoogleUser, setPendingGoogleUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Navigation & UI state
  const [activeModule, setActiveModule] = useState<ModuleId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [activeClassId, setActiveClassId] = useState<string>(() => {
    return localStorage.getItem('spppt_active_class') || 'IX-A';
  });

  // Global & Class Data state
  const [dataLoading, setDataLoading] = useState(false);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [classMembers, setClassMembers] = useState<UserProfile[]>([]);
  const [credentials, setCredentials] = useState<UserCredential[]>([]);
  const [stageConfig, setStageConfig] = useState<StageManagerConfig>(createDefaultStageManager);
  const [weightsConfig, setWeightsConfig] = useState<AssessorWeightsConfig>({
    stageWeights: DEFAULT_STAGE_WEIGHTS,
    roleWeights: DEFAULT_ASSESSOR_WEIGHTS,
    updatedAt: new Date().toISOString(),
  });
  const [driveFolders, setDriveFolders] = useState<DriveFolderItem[]>(DEFAULT_DRIVE_FOLDERS);

  const [productions, setProductions] = useState<Production[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastItem[]>([]);
  const [informationList, setInformationList] = useState<InformationItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<AttendanceSession[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [scheduleConfirmations, setScheduleConfirmations] = useState<ScheduleConfirmation[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineTask[]>([]);
  const [submissions, setSubmissions] = useState<DeadlineSubmission[]>([]);
  const [kasSettings, setKasSettings] = useState<KasSetting[]>([]);
  const [kasPeriods, setKasPeriods] = useState<KasPeriod[]>([]);
  const [kasPayments, setKasPayments] = useState<KasPayment[]>([]);
  const [cashEntries, setCashEntries] = useState<CashEntry[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [assessmentHistory, setAssessmentHistory] = useState<AssessmentHistory[]>([]);
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [musicCues, setMusicCues] = useState<MusicCue[]>([]);
  const [faceCharts, setFaceCharts] = useState<FaceChart[]>([]);
  const [costumes, setCostumes] = useState<CostumeItem[]>([]);
  const [scripts, setScripts] = useState<ScriptItem[]>([]);
  const [musicReferences, setMusicReferences] = useState<MusicReference[]>([]);
  const [promptBooks, setPromptBooks] = useState<PromptBookScene[]>([]);
  const [rabItems, setRabItems] = useState<RabItem[]>([]);
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([]);
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [notulensiList, setNotulensiList] = useState<NotulensiItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [complaints, setComplaints] = useState<ComplaintItem[]>([]);
  const [timelineConfigs, setTimelineConfigs] = useState<TimelineConfig[]>([]);
  const [timelineWeeks, setTimelineWeeks] = useState<TimelineWeek[]>([]);
  const [directorTimelines, setDirectorTimelines] = useState<DirectorTimelineItem[]>([]);
  const [divisionSchedules, setDivisionSchedules] = useState<DivisionScheduleItem[]>([]);
  const [contentSchedules, setContentSchedules] = useState<ContentScheduleItem[]>([]);
  const [interClassEvents, setInterClassEvents] = useState<InterClassEvent[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [legacySyncBusy, setLegacySyncBusy] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(() => isFirestoreQuotaExceeded());

  useEffect(() => {
    void testConnection();
    return subscribeQuotaStatus(setQuotaExceeded);
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUserProfile(null);
        setPendingGoogleUser(null);
        setAuthLoading(false);
        return;
      }

      try {
        const cacheKey = `spppt_cached_profile_${fbUser.uid}`;
        let userDoc = null;
        try {
          userDoc = await getDoc(doc(db, 'users', fbUser.uid));
        } catch (readErr) {
          if (isQuotaExceededError(readErr)) {
            markFirestoreQuotaExceeded();
            try {
              handleFirestoreError(readErr, OperationType.GET, `users/${fbUser.uid}`);
            } catch {
              // Logged structured error; continue to local cache fallback
            }
            const cachedSnap = await getDocFromCache(doc(db, 'users', fbUser.uid)).catch(() => null);
            if (cachedSnap?.exists()) {
              const cachedPriv = await getDocFromCache(doc(db, 'userPrivate', fbUser.uid)).catch(() => null);
              const privData = cachedPriv?.exists() ? (cachedPriv.data() as UserPrivate) : null;
              const enriched = enrichUser(
                { ...(cachedSnap.data() as UserProfile), uid: fbUser.uid },
                privData
              );
              setUserProfile(enriched);
              setPendingGoogleUser(null);
              if (enriched.classId && !localStorage.getItem('spppt_active_class')) {
                setActiveClassId(enriched.classId);
              }
              showToast(
                'Kuota baca harian Firestore tercapai — menampilkan profil dari cache lokal',
                'warning'
              );
              return;
            }
            const rawCached = localStorage.getItem(cacheKey);
            if (rawCached) {
              try {
                const parsed = JSON.parse(rawCached) as UserProfile;
                if (parsed?.uid === fbUser.uid) {
                  setUserProfile(parsed);
                  setPendingGoogleUser(null);
                  if (parsed.classId && !localStorage.getItem('spppt_active_class')) {
                    setActiveClassId(parsed.classId);
                  }
                  showToast(
                    'Kuota baca harian Firestore tercapai — menampilkan profil dari cache browser',
                    'warning'
                  );
                  return;
                }
              } catch {
                // ignore malformed cache
              }
            }
            const isBootstrapFallback =
              fbUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase() &&
              fbUser.emailVerified;
            if (isBootstrapFallback) {
              const now = new Date().toISOString();
              const adminFallback: UserProfile = {
                uid: fbUser.uid,
                name: fbUser.displayName || 'Fikri Yassaar (Guru Pengampu)',
                role: 'Super Admin',
                divisionId: 'admin',
                divisionName: 'Administrator',
                classId: 'IX-A',
                classIds: ['IX-A', 'IX-B'],
                photoUrl: fbUser.photoURL || '',
                email: fbUser.email || BOOTSTRAPPED_ADMIN_EMAIL,
                phone: '',
                isActive: true,
                createdAt: now,
                updatedAt: now,
              };
              setUserProfile(adminFallback);
              setPendingGoogleUser(null);
              showToast(
                'Kuota baca harian Firestore tercapai — masuk dalam mode darurat cache',
                'warning'
              );
              return;
            }
            setUserProfile(null);
            setPendingGoogleUser(null);
            return;
          }
          handleFirestoreError(readErr, OperationType.GET, `users/${fbUser.uid}`);
        }

        if (userDoc && userDoc.exists()) {
          const privDoc = await getDoc(doc(db, 'userPrivate', fbUser.uid)).catch(() => null);
          const privData = privDoc?.exists() ? (privDoc.data() as UserPrivate) : null;
          const enriched = enrichUser(
            { ...(userDoc.data() as UserProfile), uid: fbUser.uid },
            privData
          );
          try {
            localStorage.setItem(cacheKey, JSON.stringify(enriched));
          } catch {
            // ignore storage quota errors
          }
          setUserProfile(enriched);
          setPendingGoogleUser(null);
          if (enriched.classId && !localStorage.getItem('spppt_active_class')) {
            setActiveClassId(enriched.classId);
          }
          if (isTeacherOrAdmin(enriched.role) && !isFirestoreQuotaExceeded()) {
            const seedStatusSnap = await getDoc(doc(db, 'systemConfig', 'seedStatus')).catch(() => null);
            const seedData = seedStatusSnap?.data() as
              | { migratedFromDefault?: boolean; lastAttemptAt?: string }
              | undefined;
            const clsSnap = await getDocs(query(collection(db, 'classes'), limit(1))).catch(() => null);
            if (!seedData?.migratedFromDefault && !seedData?.lastAttemptAt && (!clsSnap || clsSnap.empty)) {
              migrateFromLegacyDefaultDatabase(enriched)
                .then((res) => {
                  if (res.totalCopied > 0) {
                    showToast(`${res.totalCopied} dokumen data lama berhasil dimuat!`, 'success');
                  }
                })
                .catch(() => undefined);
            }
          }
        } else {
          const isBootstrapEmail =
            fbUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
          const syncedLegacy = await syncSingleUserFromLegacyDb(fbUser.uid, fbUser.email || undefined);
          if (syncedLegacy) {
            if (isBootstrapEmail && fbUser.emailVerified) {
              await setDoc(
                doc(db, 'admins', fbUser.uid),
                {
                  uid: fbUser.uid,
                  email: fbUser.email || BOOTSTRAPPED_ADMIN_EMAIL,
                  role: 'Super Admin',
                  createdAt: new Date().toISOString(),
                },
                { merge: true }
              ).catch(() => undefined);
              const res = await migrateFromLegacyDefaultDatabase(syncedLegacy).catch(() => null);
              if (res && res.totalCopied > 0) {
                showToast(`${res.totalCopied} dokumen data lama berhasil dimuat!`, 'success');
              }
            }
            setUserProfile(syncedLegacy);
            setPendingGoogleUser(null);
            if (syncedLegacy.classId && !localStorage.getItem('spppt_active_class')) {
              setActiveClassId(syncedLegacy.classId);
            }
          } else if (isBootstrapEmail && fbUser.emailVerified) {
            const now = new Date().toISOString();
            const adminProfile: UserProfile = {
              uid: fbUser.uid,
              name: fbUser.displayName || 'Fikri Yassaar (Guru Pengampu)',
              role: 'Super Admin',
              divisionId: 'admin',
              divisionName: 'Administrator',
              classId: 'IX-A',
              classIds: ['IX-A', 'IX-B'],
              photoUrl: fbUser.photoURL || '',
              email: fbUser.email || '',
              phone: '',
              isActive: true,
              createdAt: now,
              updatedAt: now,
            };
            try {
              await setDoc(
                doc(db, 'admins', fbUser.uid),
                {
                  uid: fbUser.uid,
                  email: fbUser.email || BOOTSTRAPPED_ADMIN_EMAIL,
                  role: 'Super Admin',
                  createdAt: now,
                },
                { merge: true }
              );
              await saveUserProfileBundle({
                profile: adminProfile,
                privateInfo: {
                  uid: fbUser.uid,
                  email: fbUser.email || BOOTSTRAPPED_ADMIN_EMAIL,
                  phone: '',
                  nis: '',
                  classId: 'IX-A',
                  updatedAt: now,
                },
              });
            } catch (writeErr) {
              if (isQuotaExceededError(writeErr)) {
                markFirestoreQuotaExceeded();
              } else {
                throw writeErr;
              }
            }
            if (!isFirestoreQuotaExceeded()) {
              const res = await migrateFromLegacyDefaultDatabase(adminProfile).catch(() => null);
              if (res && res.totalCopied > 0) {
                showToast(`${res.totalCopied} dokumen data lama berhasil dimuat!`, 'success');
              }
            }
            setUserProfile(adminProfile);
            setPendingGoogleUser(null);
            setActiveClassId('IX-A');
          } else if (isBootstrapEmail && !fbUser.emailVerified) {
            showToast(
              'Gunakan tombol "Masuk dengan Google" untuk mengaktifkan akun Super Admin terverifikasi.',
              'warning'
            );
            setUserProfile(null);
            setPendingGoogleUser(null);
          } else {
            setUserProfile(null);
            setPendingGoogleUser(fbUser);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showToast(
          'Gagal memuat profil akun dari Firestore',
          'error',
          msg.includes('permission') || msg.includes('PERMISSION_DENIED')
            ? 'Silakan muat ulang halaman atau masuk ulang menggunakan Google.'
            : msg
        );
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsub();
  }, []);

  // Ensure activeClassId is valid once classes load
  useEffect(() => {
    if (!userProfile || classes.length === 0) return;
    const isTeacher = isTeacherOrAdmin(userProfile.role);
    const allowedIds = isTeacher
      ? classes.map((c) => c.id)
      : userProfile.classIds && userProfile.classIds.length > 0
        ? userProfile.classIds
        : [userProfile.classId];

    if (!allowedIds.includes(activeClassId)) {
      const next = allowedIds[0] || classes[0].id;
      setActiveClassId(next);
      localStorage.setItem('spppt_active_class', next);
    }
  }, [classes, userProfile, activeClassId]);

  // Derive classMembers directly from allUsers for teachers/admins to avoid duplicate reads
  useEffect(() => {
    if (!userProfile || !isTeacherOrAdmin(userProfile.role)) return;
    setClassMembers(
      allUsers.filter((u) => u.classId === activeClassId || u.classIds?.includes(activeClassId))
    );
  }, [allUsers, activeClassId, userProfile]);

  // Real-time Firestore Subscriptions
  useEffect(() => {
    if (!userProfile || !auth.currentUser || quotaExceeded) return;

    setDataLoading(true);
    const isTeacher = isTeacherOrAdmin(userProfile.role);
    const canViewAllAudit = isCoreCommitteeRole(userProfile.role);

    const unsubs = [
      subscribeAllActiveClasses((list) => {
        setClasses(list);
        setDataLoading(false);
      }),
      subscribeStageManager(activeClassId, setStageConfig),
      subscribeAssessorWeights(activeClassId, setWeightsConfig),
      subscribeDriveFolders(setDriveFolders),
      ...(isTeacher
        ? []
        : [subscribeClassUsers(activeClassId, false, userProfile.uid, setClassMembers)]),
      subscribeUserNotifications(userProfile.uid, setNotifications),
      subscribeAuditLogs(userProfile, canViewAllAudit, setAuditLogs),

      subscribeClassCollection<Production>('productions', activeClassId, setProductions),
      subscribeClassCollection<BroadcastItem>('broadcasts', activeClassId, setBroadcasts),
      subscribeClassCollection<InformationItem>('information', activeClassId, setInformationList),
      subscribeClassCollection<AttendanceSession>('attendanceSessions', activeClassId, setAttendanceSessions),
      subscribeClassCollection<AttendanceRecord>('attendanceRecords', activeClassId, setAttendanceRecords),
      subscribeClassCollection<ScheduleItem>('schedules', activeClassId, setSchedules),
      subscribeClassCollection<ScheduleConfirmation>('scheduleConfirmations', activeClassId, setScheduleConfirmations),
      subscribeClassCollection<DeadlineTask>('deadlines', activeClassId, setDeadlines),
      subscribeClassCollection<DeadlineSubmission>('deadlineSubmissions', activeClassId, setSubmissions),
      subscribeClassCollection<KasSetting>('kasSettings', activeClassId, setKasSettings),
      subscribeClassCollection<KasPeriod>('kasPeriods', activeClassId, setKasPeriods),
      subscribeClassCollection<KasPayment>('kasPayments', activeClassId, setKasPayments),
      subscribeClassCollection<CashEntry>('cashEntries', activeClassId, setCashEntries),
      subscribeClassCollection<Assessment>('assessments', activeClassId, setAssessments),
      subscribeClassCollection<PropertyItem>('properties', activeClassId, setProperties),
      subscribeClassCollection<MusicCue>('musicCues', activeClassId, setMusicCues),
      subscribeClassCollection<FaceChart>('faceCharts', activeClassId, setFaceCharts),
      subscribeClassCollection<CostumeItem>('costumes', activeClassId, setCostumes),
      subscribeClassCollection<ScriptItem>('scripts', activeClassId, setScripts),
      subscribeClassCollection<MusicReference>('musicReferences', activeClassId, setMusicReferences),
      subscribeClassCollection<PromptBookScene>('promptBooks', activeClassId, setPromptBooks),
      subscribeClassCollection<RabItem>('rabItems', activeClassId, setRabItems),
      subscribeEquipmentList(activeClassId, setEquipmentList),
      subscribeClassCollection<BookingItem>('bookings', activeClassId, setBookings),
      subscribeClassCollection<NotulensiItem>('notulensi', activeClassId, setNotulensiList),
      subscribeClassCollection<DocumentItem>('documents', activeClassId, setDocuments),
      subscribeClassCollection<TimelineConfig>('timelineConfigs', activeClassId, setTimelineConfigs),
      subscribeClassCollection<TimelineWeek>('timelineWeeks', activeClassId, setTimelineWeeks),
      subscribeClassCollection<DirectorTimelineItem>('directorTimelines', activeClassId, setDirectorTimelines),
      subscribeClassCollection<DivisionScheduleItem>('divisionSchedules', activeClassId, setDivisionSchedules),
      subscribeClassCollection<ContentScheduleItem>('contentSchedules', activeClassId, setContentSchedules),
      subscribeClassCollection<InterClassEvent>('interClassEvents', activeClassId, setInterClassEvents),
    ];

    // Complaints: Teacher/Admin queries class, Student queries own studentId per firestore.rules
    const complaintsQuery = isTeacher
      ? query(collection(db, 'complaints'), where('classId', '==', activeClassId), limit(300))
      : query(collection(db, 'complaints'), where('studentId', '==', userProfile.uid), limit(100));
    unsubs.push(
      onSnapshot(
        complaintsQuery,
        (snap) => setComplaints(snap.docs.map((d) => ({ ...(d.data() as ComplaintItem), id: d.id }))),
        (err) => handleFirestoreError(err, OperationType.LIST, 'complaints')
      )
    );

    if (isTeacher) {
      unsubs.push(subscribeAllUsersForAdmin(setAllUsers));
      unsubs.push(
        subscribeClassCollection<AssessmentHistory>('assessmentHistory', activeClassId, setAssessmentHistory)
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'userCredentials'), limit(400)),
          (snap) => setCredentials(snap.docs.map((d) => d.data() as UserCredential)),
          (err) => handleFirestoreError(err, OperationType.LIST, 'userCredentials')
        )
      );
    } else {
      setAllUsers([]);
      setAssessmentHistory([]);
      setCredentials([]);
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [userProfile, activeClassId, quotaExceeded]);

  // 30-minute Automatic Reminder Sweep (runs for Teachers / Core Committee)
  const reminderDataRef = useRef({
    activeClassId,
    classMembers,
    deadlines,
    submissions,
    schedules,
    kasSettings,
    kasPayments,
    bookings,
  });
  reminderDataRef.current = {
    activeClassId,
    classMembers,
    deadlines,
    submissions,
    schedules,
    kasSettings,
    kasPayments,
    bookings,
  };

  useEffect(() => {
    if (!userProfile || !isTeacherOrAdmin(userProfile.role) || isFirestoreQuotaExceeded()) return;
    const executeSweep = () => {
      if (isFirestoreQuotaExceeded()) return;
      const snap = reminderDataRef.current;
      if (snap.classMembers.length === 0) return;
      void runAllReminders({
        classId: snap.activeClassId,
        users: snap.classMembers,
        deadlines: snap.deadlines,
        submissions: snap.submissions,
        schedules: snap.schedules,
        kasSettings: snap.kasSettings,
        kasPayments: snap.kasPayments,
        bookings: snap.bookings,
      });
    };

    const initialTimer = window.setTimeout(executeSweep, 8000);
    const interval = window.setInterval(executeSweep, 30 * 60 * 1000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [userProfile]);

  const activeClass = useMemo(
    () => classes.find((c) => c.id === activeClassId),
    [classes, activeClassId]
  );

  const accessibleClasses = useMemo(() => {
    if (!userProfile) return [];
    if (isTeacherOrAdmin(userProfile.role)) return classes;
    const ids = userProfile.classIds && userProfile.classIds.length > 0 ? userProfile.classIds : [userProfile.classId];
    return classes.filter((c) => ids.includes(c.id));
  }, [classes, userProfile]);

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const activeModuleTitle = useMemo(() => {
    for (const grp of NAV_GROUPS) {
      const found = grp.items.find((i) => i.id === activeModule);
      if (found) return found.label;
    }
    return 'Dashboard';
  }, [activeModule]);

  const handleSelectClass = (cid: string) => {
    setActiveClassId(cid);
    localStorage.setItem('spppt_active_class', cid);
  };

  const handleNavigate = (moduleId: ModuleId) => {
    if (userProfile && !canAccessModule(userProfile.role, moduleId)) {
      showToast('Akses modul ini khusus untuk peran pembimbing/admin', 'warning');
      return;
    }
    setActiveModule(moduleId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogout = async () => {
    if (userProfile) {
      try {
        localStorage.removeItem(`spppt_cached_profile_${userProfile.uid}`);
      } catch {
        // ignore
      }
      await recordAuditLog({
        user: userProfile,
        action: 'LOGOUT',
        targetType: 'auth',
        targetId: userProfile.uid,
        details: 'Keluar dari sistem SP-PPT.',
      });
    }
    await signOut(auth);
    setUserProfile(null);
    setActiveModule('dashboard');
  };

  const handleQuickMigrateLegacy = async () => {
    if (!userProfile) return;
    setLegacySyncBusy(true);
    try {
      const res = await migrateFromLegacyDefaultDatabase(userProfile);
      await recordAuditLog({
        user: userProfile,
        action: 'UPDATE',
        targetType: 'migration',
        targetId: 'default-db',
        details: `Sinkronisasi data lama (default): ${res.totalCopied} dokumen (${res.classesCount} kelas, ${res.usersCount} pengguna).`,
      });
      if (res.totalCopied > 0) {
        showToast(`${res.totalCopied} dokumen data lama berhasil ditarik!`, 'success');
      } else {
        showToast(
          'Tidak ditemukan dokumen baru di database (default)',
          'warning',
          'Jika data lama tersimpan sebagai file ekspor, gunakan "Buka Backup & Restore" untuk mengunggah file JSON.'
        );
      }
    } catch (err) {
      showToast('Gagal menarik data lama', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setLegacySyncBusy(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-theater-weave flex flex-col items-center justify-center p-6 text-slate-100">
        <img
          src={SCHOOL_INFO.logoSchool}
          alt="Logo SMPN 10 Samarinda"
          className="w-14 h-14 object-contain mb-4 animate-pulse"
        />
        <p className="font-display font-bold text-lg">{SCHOOL_INFO.appName}</p>
        <p className="text-xs text-slate-400 mt-1">Memuat sesi produksi teater...</p>
      </div>
    );
  }

  const quotaBanner = quotaExceeded ? (
    <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-rose-800 dark:text-rose-200">
            Kuota Baca / Tulis Harian Firestore (Free Tier) Tercapai
          </p>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
            Batas kuota harian proyek Firebase gratis (<code className="font-mono">Spark</code>) sedang terlampaui sehingga permintaan baru dihentikan sementara. Kuota akan direset otomatis besok, atau Anda dapat memeriksa dan mengelola paket database langsung di Firebase Console.
          </p>
        </div>
      </div>
      <a
        href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data?openUpgradeDialog=true`}
        target="_blank"
        rel="noopener noreferrer"
        className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold shrink-0 text-center"
      >
        Kelola Database di Firebase
      </a>
    </div>
  ) : null;

  if (!userProfile) {
    return (
      <div className="min-h-screen flex flex-col">
        {quotaBanner && <div className="p-4 max-w-4xl w-full mx-auto">{quotaBanner}</div>}
        <LoginView
          pendingGoogleUser={pendingGoogleUser}
          onAuthenticated={(profile) => {
            try {
              localStorage.setItem(`spppt_cached_profile_${profile.uid}`, JSON.stringify(profile));
            } catch {
              // ignore
            }
            setUserProfile(profile);
            setPendingGoogleUser(null);
            const nextClass = profile.classId || 'IX-A';
            setActiveClassId(nextClass);
            localStorage.setItem('spppt_active_class', nextClass);
          }}
        />
      </div>
    );
  }

  const renderModule = () => {
    if (!canAccessModule(userProfile.role, activeModule)) {
      return (
        <DashboardModule
          user={userProfile}
          activeClass={activeClass}
          allClasses={classes}
          production={productions[0]}
          stageConfig={stageConfig}
          classMembers={classMembers}
          assessments={assessments}
          deadlines={deadlines}
          submissions={submissions}
          loading={dataLoading}
          onNavigate={handleNavigate}
          onMigrateLegacy={handleQuickMigrateLegacy}
          legacySyncBusy={legacySyncBusy}
        />
      );
    }

    switch (activeModule) {
      case 'dashboard':
        return (
          <DashboardModule
            user={userProfile}
            activeClass={activeClass}
            allClasses={classes}
            production={productions[0]}
            stageConfig={stageConfig}
            classMembers={classMembers}
            assessments={assessments}
            deadlines={deadlines}
            submissions={submissions}
            loading={dataLoading}
            onNavigate={handleNavigate}
            onMigrateLegacy={handleQuickMigrateLegacy}
            legacySyncBusy={legacySyncBusy}
          />
        );
      case 'informasi':
        return (
          <InformationModule
            user={userProfile}
            classId={activeClassId}
            broadcasts={broadcasts}
            informationList={informationList}
            allClasses={classes}
            classMembers={classMembers}
          />
        );
      case 'broadcast':
        return (
          <BroadcastModule
            user={userProfile}
            classId={activeClassId}
            broadcasts={broadcasts}
            classMembers={classMembers}
          />
        );
      case 'welcome-broadcast':
        return (
          <WelcomeBroadcastModule
            user={userProfile}
            allClasses={classes}
            allUsers={allUsers}
          />
        );
      case 'notifikasi':
        return <NotificationModule notifications={notifications} onNavigate={handleNavigate} />;
      case 'panduan':
        return <GuideModule classMembers={classMembers} user={userProfile} />;
      case 'absensi':
        return (
          <AttendanceModule
            user={userProfile}
            classId={activeClassId}
            currentStage={stageConfig.currentStage}
            sessions={attendanceSessions}
            records={attendanceRecords}
            classMembers={classMembers}
          />
        );
      case 'statistik-absensi':
        return (
          <AttendanceStatsModule
            classId={activeClassId}
            sessions={attendanceSessions}
            records={attendanceRecords}
            classMembers={classMembers}
          />
        );
      case 'jadwal':
        return (
          <ScheduleModule
            user={userProfile}
            classId={activeClassId}
            schedules={schedules}
            confirmations={scheduleConfirmations}
          />
        );
      case 'master-timeline':
        return (
          <MasterTimelineModule
            user={userProfile}
            classId={activeClassId}
            timelineConfigs={timelineConfigs}
            timelineWeeks={timelineWeeks}
          />
        );
      case 'director-timeline':
        return (
          <DirectorTimelineModule
            user={userProfile}
            classId={activeClassId}
            items={directorTimelines}
          />
        );
      case 'division-schedule':
        return (
          <DivisionScheduleModule
            user={userProfile}
            classId={activeClassId}
            items={divisionSchedules}
          />
        );
      case 'content-schedule':
        return (
          <ContentScheduleModule
            user={userProfile}
            classId={activeClassId}
            items={contentSchedules}
          />
        );
      case 'activity-calendar':
        return (
          <ActivityCalendarModule
            user={userProfile}
            timelineWeeks={timelineWeeks}
            schedules={schedules}
            bookings={bookings}
            deadlines={deadlines}
          />
        );
      case 'tugas':
        return (
          <DeadlineModule
            user={userProfile}
            classId={activeClassId}
            currentStage={stageConfig.currentStage}
            deadlines={deadlines}
            submissions={submissions}
            classMembers={classMembers}
            allClasses={classes}
          />
        );
      case 'template-hub':
        return (
          <TemplateHubModule
            user={userProfile}
            classId={activeClassId}
            classMembers={classMembers}
            allClasses={classes}
          />
        );
      case 'kelola-tahapan':
        return (
          <StageManagerModule
            user={userProfile}
            classId={activeClassId}
            stageConfig={stageConfig}
            deadlines={deadlines}
          />
        );
      case 'jadwal-penilaian':
        return (
          <AssessmentScheduleModule
            user={userProfile}
            classId={activeClassId}
            stageConfig={stageConfig}
          />
        );
      case 'nilai':
        return (
          <AssessmentModule
            user={userProfile}
            activeClass={activeClass}
            classId={activeClassId}
            stageConfig={stageConfig}
            classMembers={classMembers}
            assessments={assessments}
            deadlines={deadlines}
            submissions={submissions}
            attendanceSessions={attendanceSessions}
            attendanceRecords={attendanceRecords}
          />
        );
      case 'nilai-saya':
        return (
          <MyGradeModule
            user={userProfile}
            activeClass={activeClass}
            stageConfig={stageConfig}
            weightsConfig={weightsConfig}
            classMembers={classMembers}
            assessments={assessments}
            onNavigate={handleNavigate}
          />
        );
      case 'moderasi':
        return (
          <ModerationModule
            user={userProfile}
            classId={activeClassId}
            assessments={assessments}
            history={assessmentHistory}
            classMembers={classMembers}
          />
        );
      case 'rekap-nilai':
        return (
          <GradeRecapModule
            user={userProfile}
            classId={activeClassId}
            weightsConfig={weightsConfig}
            classMembers={classMembers}
            assessments={assessments}
          />
        );
      case 'kas':
        return (
          <KasModule
            user={userProfile}
            classId={activeClassId}
            kasSettings={kasSettings}
            kasPeriods={kasPeriods}
            kasPayments={kasPayments}
            cashEntries={cashEntries}
            classMembers={classMembers}
          />
        );
      case 'rab':
        return (
          <RABModule
            user={userProfile}
            activeClass={activeClass}
            classId={activeClassId}
            rabItems={rabItems}
          />
        );
      case 'booking':
        return (
          <BookingModule
            user={userProfile}
            classId={activeClassId}
            bookings={bookings}
            classMembers={classMembers}
            equipment={equipmentList}
            stageConfig={stageConfig}
          />
        );
      case 'booking-calendar':
        return (
          <BookingCalendarModule
            bookings={bookings}
            equipment={equipmentList}
            currentUserId={userProfile.uid}
          />
        );
      case 'notulensi':
        return (
          <NotulensiModule
            user={userProfile}
            classId={activeClassId}
            notulensiList={notulensiList}
            classMembers={classMembers}
          />
        );
      case 'dokumen':
        return (
          <DocumentModule
            user={userProfile}
            classId={activeClassId}
            documents={documents}
            driveFolders={driveFolders}
          />
        );
      case 'aduan':
        return (
          <ComplaintModule
            user={userProfile}
            classId={activeClassId}
            complaints={complaints}
            classMembers={classMembers}
          />
        );
      case 'properti':
        return (
          <PropertyModule
            user={userProfile}
            classId={activeClassId}
            properties={properties}
            members={classMembers}
          />
        );
      case 'musik-cue':
        return (
          <MusicCueModule
            user={userProfile}
            classId={activeClassId}
            musicCues={musicCues}
          />
        );
      case 'face-chart':
        return (
          <FaceChartModule
            user={userProfile}
            classId={activeClassId}
            faceCharts={faceCharts}
            members={classMembers}
          />
        );
      case 'kostum':
        return (
          <CostumeModule
            user={userProfile}
            classId={activeClassId}
            costumes={costumes}
            members={classMembers}
          />
        );
      case 'studio':
        return (
          <StudioModule
            user={userProfile}
            classId={activeClassId}
            classes={classes}
            scripts={scripts}
            musicReferences={musicReferences}
            promptBooks={promptBooks}
          />
        );
      case 'struktur':
        return (
          <StructureModule
            user={userProfile}
            currentClass={activeClass}
            members={classMembers}
          />
        );
      case 'kelola-kelas':
        return (
          <ManageClassModule
            user={userProfile}
            classes={classes}
            activeClassId={activeClassId}
            onSelectClass={handleSelectClass}
          />
        );
      case 'inter-class':
        return (
          <InterClassCoordModule
            user={userProfile}
            classId={activeClassId}
            classes={classes}
            events={interClassEvents}
          />
        );
      case 'kelola-siswa':
        return (
          <ManageStudentModule
            user={userProfile}
            classId={activeClassId}
            classes={classes}
            members={classMembers}
            credentials={credentials}
            deadlines={deadlines}
            submissions={submissions}
            currentStage={stageConfig.currentStage}
          />
        );
      case 'admin':
        return (
          <AdminModule
            user={userProfile}
            classes={classes}
            allUsers={allUsers}
            credentials={credentials}
          />
        );
      case 'debug-users':
        return <DebugUsersModule user={userProfile} allUsers={allUsers} classes={classes} />;
      case 'activity-log':
        return <ActivityLogModule logs={auditLogs} />;
      case 'backup':
        return <BackupModule user={userProfile} currentClass={activeClass} classMembers={classMembers} />;
      case 'settings':
        return (
          <SettingsModule
            user={userProfile}
            classId={activeClassId}
            assessorWeights={weightsConfig}
            driveFolders={driveFolders}
            onProfileUpdated={setUserProfile}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-app-weave text-slate-900 dark:text-slate-100 flex">
      <Sidebar
        user={userProfile}
        activeModule={activeModule}
        unreadNotifications={unreadNotifications}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onNavigate={handleNavigate}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Clean 3-Zone Top Header Bar */}
        <header className="sticky top-0 z-30 h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-3 no-print">
          {/* Zone 1: Menu toggle & Active breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="font-display font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                {activeModuleTitle}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {activeClass?.name || activeClassId} · Tahap{' '}
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {STAGE_LABELS[stageConfig.currentStage].label}
                </span>
              </p>
            </div>
          </div>

          {/* Zone 2 & 3: Class switcher, 3-Mode Theme Switcher (Terang/Gelap/Auto), Notifications, User menu */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {accessibleClasses.length > 1 && (
              <select
                value={activeClassId}
                onChange={(e) => handleSelectClass(e.target.value)}
                aria-label="Pilih kelas aktif"
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                {accessibleClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            <ThemeSwitcher compact />

            <button
              type="button"
              onClick={() => handleNavigate('notifikasi')}
              className="relative p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Buka notifikasi"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white font-mono text-[10px] font-bold flex items-center justify-center">
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </span>
              )}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                {userProfile.photoUrl ? (
                  <img
                    src={userProfile.photoUrl}
                    alt={userProfile.name}
                    className="w-7 h-7 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-amber-500 text-slate-950 font-display font-bold text-xs flex items-center justify-center">
                    {userProfile.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="hidden md:block text-left max-w-[140px]">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {userProfile.name}
                  </p>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 truncate">
                    {userProfile.role}
                  </p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {profileMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setProfileMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl z-20 p-2 space-y-1">
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {userProfile.name}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">{userProfile.email || userProfile.role}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        handleNavigate('settings');
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      Pengaturan Profil
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        void handleLogout();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Keluar Sistem
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-4">
          {quotaBanner}
          {renderModule()}
        </main>
      </div>
    </div>
  );
}
