import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Bell,
  BookOpen,
  CheckCircle2,
  DollarSign,
  Download,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Plus,
  Printer,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react';
import { DIVISIONS, ROLE_DEFINITIONS, isTeacherOrAdmin } from '../../core/constants';
import {
  CashEntry,
  KasPayment,
  KasPeriod,
  KasSetting,
  RabItem,
  SchoolClass,
  UserProfile,
} from '../../core/types';
import {
  makeSafeId,
  notifyUsers,
  recordAuditLog,
  removeDocument,
  upsertDocument,
} from '../../services/firestoreService';
import { exportDOCX } from '../../utils/exportDOCX';
import { exportXLSX } from '../../utils/exportXLSX';
import { buildWhatsAppUrl, formatIDR } from '../../utils/imageCompress';
import { useToast } from '../common/Toast';

export const KasModule: React.FC<{
  user: UserProfile;
  classId: string;
  kasSettings: KasSetting[];
  kasPeriods?: KasPeriod[];
  kasPayments: KasPayment[];
  cashEntries?: CashEntry[];
  classMembers: UserProfile[];
}> = ({
  user,
  classId,
  kasSettings,
  kasPeriods = [],
  kasPayments,
  cashEntries = [],
  classMembers,
}) => {
  const { showToast } = useToast();
  const canManage = isTeacherOrAdmin(user.role) || user.role === 'Bendahara';
  const students = useMemo(
    () => classMembers.filter((m) => !isTeacherOrAdmin(m.role) && m.isActive !== false),
    [classMembers]
  );

  const [activeTab, setActiveTab] = useState<'tagihan' | 'buku-kas'>('tagihan');
  const [showCreate, setShowCreate] = useState(false);
  const [editingKasId, setEditingKasId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('15000');
  const [period, setPeriod] = useState('Bulan 1');
  const [periodType, setPeriodType] = useState<'WEEKLY' | 'MONTHLY' | 'ONCE'>('WEEKLY');
  const [deadline, setDeadline] = useState(() =>
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );
  const [confirmDeleteKasId, setConfirmDeleteKasId] = useState<string | null>(null);

  const [searchStudent, setSearchStudent] = useState('');
  const [payFilter, setPayFilter] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  // Buku Kas state
  const [showCashForm, setShowCashForm] = useState(false);
  const [editingCashId, setEditingCashId] = useState<string | null>(null);
  const [cashType, setCashType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [cashCategory, setCashCategory] = useState<'DIVISI' | 'PERAN' | 'UMUM'>('DIVISI');
  const [cashTarget, setCashTarget] = useState<string>(DIVISIONS[0]?.name || 'Perlengkapan');
  const [cashItemName, setCashItemName] = useState('');
  const [cashQty, setCashQty] = useState('1');
  const [cashUnit, setCashUnit] = useState('pcs');
  const [cashAmount, setCashAmount] = useState('25000');
  const [cashNotes, setCashNotes] = useState('');
  const [cashDate, setCashDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cashFilter, setCashFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  const [confirmDeleteCashId, setConfirmDeleteCashId] = useState<string | null>(null);

  // Merge kasSettings + legacy kasPeriods if any periods exist without matching setting
  const mergedPeriods = useMemo(() => {
    const base = [...kasSettings];
    for (const kp of kasPeriods) {
      if (!base.some((b) => b.id === kp.id)) {
        const parentKas = kasSettings.find((s) => s.id === kp.kasId);
        base.push({
          id: kp.id,
          classId: kp.classId,
          title: kp.label || kp.title || parentKas?.title || 'Tagihan Kas',
          amount: kp.amount ?? parentKas?.amount ?? 0,
          period: kp.label || parentKas?.period || 'Periode',
          active: kp.active ?? parentKas?.active ?? true,
          deadline: kp.deadline || kp.dueDate || new Date().toISOString().slice(0, 10),
          createdBy: kp.createdBy || parentKas?.createdBy || '',
          createdAt: kp.createdAt,
        });
      }
    }
    return base.sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
  }, [kasSettings, kasPeriods]);

  const sortedKas = mergedPeriods;

  const findPayment = (kasId: string, studentId: string) =>
    kasPayments.find(
      (p) => (p.kasId === kasId || p.periodId === kasId) && p.studentId === studentId
    );

  // Student personal billing summary
  const studentSummary = useMemo(() => {
    const activeKas = sortedKas.filter((k) => k.active !== false);
    let totalTagihan = 0;
    let totalLunas = 0;
    let overdueCount = 0;
    let dueSoonCount = 0;

    for (const k of activeKas) {
      totalTagihan += k.amount || 0;
      const myPay = findPayment(k.id, user.uid);
      if (myPay?.paid) {
        totalLunas += k.amount || 0;
      } else {
        const diff = Math.ceil((new Date(k.deadline).getTime() - Date.now()) / 86400000);
        if (diff <= 0) overdueCount++;
        else if (diff <= 3) dueSoonCount++;
      }
    }

    return {
      totalTagihan,
      totalLunas,
      sisaTunggakan: Math.max(0, totalTagihan - totalLunas),
      overdueCount,
      dueSoonCount,
    };
  }, [sortedKas, kasPayments, user.uid]);

  // Class treasurer KPI summary
  const classSummary = useMemo(() => {
    const activeKas = sortedKas.filter((k) => k.active !== false);
    let targetTotal = 0;
    let collectedTotal = 0;

    for (const k of activeKas) {
      targetTotal += (k.amount || 0) * students.length;
      const paidStudents = students.filter((s) => Boolean(findPayment(k.id, s.uid)?.paid)).length;
      collectedTotal += (k.amount || 0) * paidStudents;
    }

    const unpaidTotal = Math.max(0, targetTotal - collectedTotal);
    const pct = targetTotal > 0 ? Math.round((collectedTotal / targetTotal) * 100) : 0;
    return { targetTotal, collectedTotal, unpaidTotal, pct };
  }, [sortedKas, kasPayments, students]);

  // Buku Kas ledger summary
  const cashSummary = useMemo(() => {
    const totalIncome = cashEntries
      .filter((c) => c.type === 'INCOME')
      .reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
    const totalExpense = cashEntries
      .filter((c) => c.type === 'EXPENSE')
      .reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
    // Include paid student dues + recorded income - expense
    const kasCollected = classSummary.collectedTotal;
    const saldoAkhir = kasCollected + totalIncome - totalExpense;
    return { totalIncome, totalExpense, kasCollected, saldoAkhir };
  }, [cashEntries, classSummary.collectedTotal]);

  const sortedCashEntries = useMemo(() => {
    return [...cashEntries]
      .filter((c) => (cashFilter === 'ALL' ? true : c.type === cashFilter))
      .sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt));
  }, [cashEntries, cashFilter]);

  const getKasDeadlineLabel = (deadlineStr: string) => {
    const diff = Math.ceil((new Date(deadlineStr).getTime() - Date.now()) / 86400000);
    if (diff < 0)
      return { text: `Terlambat ${Math.abs(diff)} hari`, cls: 'text-rose-600 dark:text-rose-400' };
    if (diff === 0)
      return { text: 'Jatuh Tempo HARI INI', cls: 'text-rose-600 dark:text-rose-400' };
    if (diff <= 3) return { text: `H-${diff} jatuh tempo`, cls: 'text-amber-600 dark:text-amber-400' };
    return { text: `${diff} hari lagi`, cls: 'text-slate-500 dark:text-slate-400' };
  };

  const resetForm = () => {
    setEditingKasId(null);
    setTitle('');
    setAmount('15000');
    setPeriod('Bulan 1');
    setPeriodType('WEEKLY');
    setDeadline(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  };

  const handleEditKas = (k: KasSetting) => {
    setEditingKasId(k.id);
    setTitle(k.title);
    setAmount(String(k.amount));
    setPeriod(k.period);
    setPeriodType(k.periodType || 'WEEKLY');
    setDeadline((k.deadline || '').slice(0, 10));
    setShowCreate(true);
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('Judul periode kas wajib diisi', 'warning');
      return;
    }
    try {
      const existing = editingKasId ? kasSettings.find((k) => k.id === editingKasId) : undefined;
      const id = editingKasId || makeSafeId('kas');
      const item: KasSetting = {
        id,
        classId,
        title: title.trim(),
        amount: Math.max(0, Number(amount) || 0),
        period: period.trim() || 'Periode',
        periodType,
        active: existing ? existing.active : true,
        deadline,
        createdBy: existing?.createdBy || user.uid,
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
      await upsertDocument('kasSettings', id, item as unknown as Record<string, unknown>);
      await recordAuditLog({
        user,
        action: editingKasId ? 'UPDATE' : 'CREATE',
        targetType: 'kasSetting',
        targetId: id,
        details: `${editingKasId ? 'Memperbarui' : 'Membuat'} periode kas "${item.title}" (${formatIDR(item.amount)}).`,
      });
      resetForm();
      setShowCreate(false);
      showToast(editingKasId ? 'Periode kas diperbarui' : 'Periode kas baru dibuka', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan periode kas', 'error');
    }
  };

  const toggleKasActive = async (kas: KasSetting) => {
    try {
      await upsertDocument('kasSettings', kas.id, {
        ...kas,
        active: !kas.active,
      });
      showToast(`Periode "${kas.title}" ${!kas.active ? 'diaktifkan' : 'dinonaktifkan'}`, 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengubah status kas', 'error');
    }
  };

  const handleDeleteKas = async (kasId: string) => {
    try {
      await removeDocument('kasSettings', kasId);
      setConfirmDeleteKasId(null);
      showToast('Periode tagihan kas dihapus', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus periode kas', 'error');
    }
  };

  const togglePaid = async (kas: KasSetting, student: UserProfile, currentPaid: boolean) => {
    try {
      const existing = findPayment(kas.id, student.uid);
      const payId = existing?.id || `${kas.id}_${student.uid}`;
      const now = new Date().toISOString();
      const noteText = (noteDrafts[payId] ?? existing?.notes ?? '').trim();
      const payload: KasPayment = {
        id: payId,
        kasId: existing?.kasId || kas.id,
        ...(existing?.periodId ? { periodId: existing.periodId } : {}),
        studentId: student.uid,
        studentName: student.name,
        classId,
        paid: !currentPaid,
        paidAt: !currentPaid ? now : '',
        amount: kas.amount,
        ...(noteText ? { notes: noteText } : {}),
        recordedBy: user.name,
        recordedAt: now,
        createdAt: existing?.createdAt || now,
      };
      await upsertDocument('kasPayments', payId, payload as unknown as Record<string, unknown>);
      showToast(`${student.name}: ${!currentPaid ? 'Lunas' : 'Belum Bayar'}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memperbarui status pembayaran', 'error');
    }
  };

  const savePaymentNote = async (
    kas: KasSetting,
    student: UserProfile,
    pay: KasPayment | undefined
  ) => {
    try {
      const payId = pay?.id || `${kas.id}_${student.uid}`;
      const noteText = (noteDrafts[payId] ?? pay?.notes ?? '').trim();
      const now = new Date().toISOString();
      const payload: KasPayment = {
        id: payId,
        kasId: pay?.kasId || kas.id,
        ...(pay?.periodId ? { periodId: pay.periodId } : {}),
        studentId: student.uid,
        studentName: student.name,
        classId,
        paid: Boolean(pay?.paid),
        paidAt: pay?.paidAt || '',
        amount: kas.amount,
        notes: noteText,
        recordedBy: user.name,
        recordedAt: now,
        createdAt: pay?.createdAt || now,
      };
      await upsertDocument('kasPayments', payId, payload as unknown as Record<string, unknown>);
      showToast('Catatan pembayaran disimpan', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan catatan', 'error');
    }
  };

  const handleRemindUnpaid = async (kas: KasSetting) => {
    try {
      const unpaid = students.filter((s) => !findPayment(kas.id, s.uid)?.paid);
      if (unpaid.length === 0) {
        showToast('Seluruh siswa sudah melunasi periode ini', 'info');
        return;
      }
      await notifyUsers({
        userIds: unpaid.map((s) => s.uid),
        classId,
        title: `Pengingat Kas: ${kas.title}`,
        message: `Mohon segera menyelesaikan iuran sebesar ${formatIDR(kas.amount)} sebelum ${kas.deadline}.`,
        category: 'Keuangan',
        link: 'kas',
      });
      showToast(`Pengingat dikirim ke ${unpaid.length} siswa`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengirim pengingat', 'error');
    }
  };

  // Buku Kas handlers
  const resetCashForm = () => {
    setEditingCashId(null);
    setCashType('EXPENSE');
    setCashCategory('DIVISI');
    setCashTarget(DIVISIONS[0]?.name || 'Perlengkapan');
    setCashItemName('');
    setCashQty('1');
    setCashUnit('pcs');
    setCashAmount('25000');
    setCashNotes('');
    setCashDate(new Date().toISOString().slice(0, 10));
  };

  const openEditCash = (c: CashEntry) => {
    setEditingCashId(c.id);
    setCashType(c.type);
    setCashCategory((c.category as 'DIVISI' | 'PERAN' | 'UMUM') || 'UMUM');
    setCashTarget(c.targetName || '');
    setCashItemName(c.itemName || c.description || '');
    setCashQty(String(c.qty || 1));
    setCashUnit(c.unit || 'pcs');
    setCashAmount(String(c.amount || 0));
    setCashNotes(c.notes || '');
    setCashDate((c.date || c.createdAt).slice(0, 10));
    setShowCashForm(true);
  };

  const handleSaveCashEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashItemName.trim()) {
      showToast('Nama item/keperluan wajib diisi', 'warning');
      return;
    }
    try {
      const existing = editingCashId ? cashEntries.find((c) => c.id === editingCashId) : undefined;
      const id = editingCashId || makeSafeId('cash');
      const now = new Date().toISOString();
      const entry: CashEntry = {
        id,
        classId,
        type: cashType,
        category: cashCategory,
        targetName: cashCategory === 'UMUM' ? 'Umum' : cashTarget,
        itemName: cashItemName.trim(),
        description: cashItemName.trim(),
        qty: Math.max(1, Number(cashQty) || 1),
        unit: cashUnit.trim() || 'pcs',
        amount: Math.max(0, Number(cashAmount) || 0),
        notes: cashNotes.trim(),
        date: cashDate,
        recordedBy: existing?.recordedBy || user.uid,
        recorderName: existing?.recorderName || user.name,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      await upsertDocument('cashEntries', id, entry as unknown as Record<string, unknown>);
      await recordAuditLog({
        user,
        action: editingCashId ? 'UPDATE' : 'CREATE',
        targetType: 'cashEntries',
        targetId: id,
        details: `${cashType === 'INCOME' ? 'Pemasukan' : 'Pengeluaran'} Buku Kas: "${entry.itemName}" (${formatIDR(entry.amount)}).`,
      });
      resetCashForm();
      setShowCashForm(false);
      showToast('Entri Buku Kas disimpan', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan entri Buku Kas', 'error');
    }
  };

  const handleDeleteCash = async (id: string) => {
    try {
      await removeDocument('cashEntries', id);
      setConfirmDeleteCashId(null);
      showToast('Entri Buku Kas dihapus', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus entri Buku Kas', 'error');
    }
  };

  const handleExport = () => {
    exportXLSX(`rekap_kas_${classId}`, [
      {
        name: 'Rekap Iuran Siswa',
        headers: [
          'Periode',
          'Nominal',
          'Jatuh Tempo',
          'Siswa',
          'Peran',
          'Status',
          'Tanggal Bayar',
          'Catatan',
          'Pencatat',
        ],
        rows: sortedKas.flatMap((k) =>
          students.map((s) => {
            const pay = findPayment(k.id, s.uid);
            return [
              k.title,
              k.amount,
              k.deadline,
              s.name,
              s.role,
              pay?.paid ? 'LUNAS' : 'BELUM',
              pay?.paidAt ? pay.paidAt.slice(0, 10) : '-',
              pay?.notes || '-',
              pay?.recordedBy || pay?.verifiedBy || '-',
            ];
          })
        ),
      },
      {
        name: 'Buku Kas',
        headers: ['Tanggal', 'Jenis', 'Kategori', 'Target/Divisi', 'Keperluan', 'Qty', 'Nominal (Rp)', 'Catatan', 'Pencatat'],
        rows: sortedCashEntries.map((c) => [
          (c.date || c.createdAt).slice(0, 10),
          c.type === 'INCOME' ? 'PEMASUKAN' : 'PENGELUARAN',
          c.category,
          c.targetName || '-',
          c.itemName || c.description || '-',
          `${c.qty || 1} ${c.unit || 'pcs'}`,
          c.amount,
          c.notes || '-',
          c.recorderName || c.creatorName || '-',
        ]),
      },
    ]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-amber-500" />
            Kas, Tagihan Iuran & Buku Kas
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Pengelolaan iuran siswa dan pembukuan pemasukan/pengeluaran oleh Bendahara.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <>
              <button
                type="button"
                onClick={handleExport}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" /> Ekspor XLSX
              </button>
              {activeTab === 'tagihan' ? (
                <button
                  type="button"
                  onClick={() => {
                    if (showCreate && !editingKasId) {
                      setShowCreate(false);
                    } else {
                      resetForm();
                      setShowCreate(true);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Buat Tagihan Kas
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (showCashForm && !editingCashId) {
                      setShowCashForm(false);
                    } else {
                      resetCashForm();
                      setShowCashForm(true);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Catat Transaksi
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tabs: Tagihan vs Buku Kas */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('tagihan')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer ${
            activeTab === 'tagihan'
              ? 'bg-amber-500 text-slate-950'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Wallet className="w-4 h-4" />
          Tagihan & Centang Kas ({sortedKas.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('buku-kas')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer ${
            activeTab === 'buku-kas'
              ? 'bg-amber-500 text-slate-950'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Buku Kas ({cashEntries.length})
        </button>
      </div>

      {/* Summary KPI Cards */}
      {activeTab === 'buku-kas' ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4">
            <p className="text-[11px] text-slate-500">Iuran Terkumpul</p>
            <p className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-white mt-1">
              {formatIDR(cashSummary.kasCollected)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4">
            <p className="text-[11px] text-slate-500">Pemasukan Lainnya</p>
            <p className="font-mono tabular-nums text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              +{formatIDR(cashSummary.totalIncome)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4">
            <p className="text-[11px] text-slate-500">Total Pengeluaran</p>
            <p className="font-mono tabular-nums text-lg font-bold text-rose-600 dark:text-rose-400 mt-1">
              -{formatIDR(cashSummary.totalExpense)}
            </p>
          </div>
          <div className="rounded-xl border border-amber-500/40 bg-white/95 dark:bg-slate-900/95 p-4">
            <p className="text-[11px] text-slate-500">Saldo Akhir Kas Kelas</p>
            <p
              className={`font-mono tabular-nums text-lg font-bold mt-1 ${
                cashSummary.saldoAkhir >= 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {formatIDR(cashSummary.saldoAkhir)}
            </p>
          </div>
        </div>
      ) : canManage ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4">
            <p className="text-[11px] text-slate-500">Kas Terkumpul</p>
            <p className="font-mono tabular-nums text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {formatIDR(classSummary.collectedTotal)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4">
            <p className="text-[11px] text-slate-500">Target Tagihan Kelas</p>
            <p className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-white mt-1">
              {formatIDR(classSummary.targetTotal)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4">
            <p className="text-[11px] text-slate-500">Sisa Belum Terbayar</p>
            <p className="font-mono tabular-nums text-lg font-bold text-rose-600 dark:text-rose-400 mt-1">
              {formatIDR(classSummary.unpaidTotal)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4">
            <p className="text-[11px] text-slate-500">Saldo Akhir (incl. Buku Kas)</p>
            <p className="font-mono tabular-nums text-lg font-bold text-amber-600 dark:text-amber-400 mt-1">
              {formatIDR(cashSummary.saldoAkhir)}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {(studentSummary.overdueCount > 0 || studentSummary.dueSoonCount > 0) && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <p>
                {studentSummary.overdueCount > 0
                  ? `Anda memiliki ${studentSummary.overdueCount} tagihan kas yang telah melewati batas waktu pembayaran.`
                  : `Anda memiliki ${studentSummary.dueSoonCount} tagihan kas yang mendekati jatuh tempo (≤ 3 hari).`}{' '}
                Segera hubungi Bendahara kelas untuk pelunasan.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4">
              <p className="text-[11px] text-slate-500">Total Tagihan Saya</p>
              <p className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-white mt-1">
                {formatIDR(studentSummary.totalTagihan)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4">
              <p className="text-[11px] text-slate-500">Sudah Dibayar</p>
              <p className="font-mono tabular-nums text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {formatIDR(studentSummary.totalLunas)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4">
              <p className="text-[11px] text-slate-500">Sisa Tunggakan</p>
              <p
                className={`font-mono tabular-nums text-lg font-bold mt-1 ${
                  studentSummary.sisaTunggakan > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {formatIDR(studentSummary.sisaTunggakan)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: TAGIHAN & CENTANG KAS */}
      {activeTab === 'tagihan' && (
        <>
          {showCreate && canManage && (
            <form
              onSubmit={handleCreateOrUpdate}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-4"
            >
              <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
                {editingKasId ? 'Edit Periode Tagihan Kas' : 'Buat Periode Tagihan Kas Baru'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Judul kas (misal: Kas Pekan 1)..."
                  className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                />
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Nominal (Rp)"
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100"
                />
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  placeholder="Label periode (misal: Pekan 1 / Maret 2026)..."
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                />
                <select
                  value={periodType}
                  onChange={(e) =>
                    setPeriodType(e.target.value as 'WEEKLY' | 'MONTHLY' | 'ONCE')
                  }
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                >
                  <option value="WEEKLY">Mingguan</option>
                  <option value="MONTHLY">Bulanan</option>
                  <option value="ONCE">Sekali Bayar</option>
                </select>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setShowCreate(false);
                    }}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-semibold cursor-pointer"
                  >
                    {editingKasId ? 'Simpan Perubahan' : 'Simpan Periode'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {canManage && sortedKas.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchStudent}
                  onChange={(e) => setSearchStudent(e.target.value)}
                  placeholder="Cari nama siswa..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="flex gap-1.5">
                {(['ALL', 'UNPAID', 'PAID'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setPayFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                      payFilter === f
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {f === 'ALL' ? 'Semua Siswa' : f === 'UNPAID' ? 'Belum Lunas' : 'Sudah Lunas'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {sortedKas.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-10 text-center text-xs text-slate-500">
              Belum ada tagihan periode kas yang dibuat.
            </div>
          ) : (
            <div className="space-y-6">
              {sortedKas.map((kas) => {
                const paidCount = students.filter((s) => Boolean(findPayment(kas.id, s.uid)?.paid)).length;
                const myPay = findPayment(kas.id, user.uid);
                const countdown = getKasDeadlineLabel(kas.deadline);
                const q = searchStudent.trim().toLowerCase();

                const filteredStudents = students.filter((s) => {
                  if (q && !s.name.toLowerCase().includes(q) && !s.role.toLowerCase().includes(q)) {
                    return false;
                  }
                  if (payFilter === 'ALL') return true;
                  const isPaid = Boolean(findPayment(kas.id, s.uid)?.paid);
                  return payFilter === 'PAID' ? isPaid : !isPaid;
                });

                return (
                  <div
                    key={kas.id}
                    className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-4 ${
                      kas.active === false ? 'opacity-70' : ''
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums">
                          <span className={countdown.cls}>{countdown.text}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500 dark:text-slate-400">
                            {kas.period} · Batas {kas.deadline}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500 dark:text-slate-400">
                            Terkumpul {paidCount}/{students.length} siswa
                          </span>
                          {kas.active === false && (
                            <>
                              <span className="text-slate-400">·</span>
                              <span className="font-bold text-slate-400">DITUTUP</span>
                            </>
                          )}
                        </div>
                        <h3 className="font-display font-bold text-base text-slate-900 dark:text-white mt-0.5">
                          {kas.title} —{' '}
                          <span className="font-mono text-amber-600 dark:text-amber-400">
                            {formatIDR(kas.amount)}
                          </span>
                        </h3>
                        {!canManage && myPay?.notes && (
                          <p className="text-xs text-slate-500 mt-1">
                            Catatan Bendahara: {myPay.notes}
                          </p>
                        )}
                      </div>
                      {canManage ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleRemindUnpaid(kas)}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Bell className="w-3.5 h-3.5 text-amber-500" />
                            Kirim Reminder
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleKasActive(kas)}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                          >
                            {kas.active === false ? 'Aktifkan' : 'Tutup Periode'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditKas(kas)}
                            className="p-1.5 text-slate-400 hover:text-amber-500 cursor-pointer"
                            aria-label="Edit periode kas"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {confirmDeleteKasId === kas.id ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => void handleDeleteKas(kas.id)}
                                className="px-2 py-1 rounded bg-rose-600 text-white text-[11px] font-bold"
                              >
                                Yakin
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteKasId(null)}
                                className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteKasId(kas.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer"
                              aria-label="Hapus periode kas"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs font-semibold text-right">
                          {myPay?.paid ? (
                            <div className="text-emerald-600 dark:text-emerald-400 space-y-0.5">
                              <span className="inline-flex items-center gap-1">
                                <CheckCircle2 className="w-4 h-4" /> Lunas
                              </span>
                              {myPay.paidAt && (
                                <p className="text-[11px] font-mono text-slate-400">
                                  {myPay.paidAt.slice(0, 10)} · {myPay.recordedBy || myPay.verifiedBy || ''}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className={countdown.cls}>Belum Lunas · {countdown.text}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {canManage && (
                      <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800 pt-3">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="text-slate-500 border-b border-slate-100 dark:border-slate-800">
                              <th className="py-2 pr-3 font-semibold">Nama Siswa</th>
                              <th className="py-2 px-3 font-semibold">Peran</th>
                              <th className="py-2 px-3 font-semibold">Status</th>
                              <th className="py-2 px-3 font-semibold">Catatan / Bukti</th>
                              <th className="py-2 pl-3 text-right font-semibold">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredStudents.map((s) => {
                              const pay = findPayment(kas.id, s.uid);
                              const payId = pay?.id || `${kas.id}_${s.uid}`;
                              const isPaid = Boolean(pay?.paid);
                              return (
                                <tr key={s.uid}>
                                  <td className="py-2 pr-3 font-medium text-slate-900 dark:text-white">
                                    {s.name}
                                  </td>
                                  <td className="py-2 px-3 text-slate-500">{s.role}</td>
                                  <td className="py-2 px-3 font-semibold whitespace-nowrap">
                                    {isPaid ? (
                                      <span className="text-emerald-600 dark:text-emerald-400">
                                        Lunas {pay?.paidAt ? `(${pay.paidAt.slice(5, 10)})` : ''}
                                      </span>
                                    ) : (
                                      <span className="text-rose-500">Belum</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3">
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="text"
                                        value={noteDrafts[payId] ?? pay?.notes ?? ''}
                                        onChange={(e) =>
                                          setNoteDrafts((prev) => ({
                                            ...prev,
                                            [payId]: e.target.value,
                                          }))
                                        }
                                        onBlur={() => {
                                          if (
                                            noteDrafts[payId] !== undefined &&
                                            noteDrafts[payId] !== (pay?.notes || '')
                                          ) {
                                            void savePaymentNote(kas, s, pay);
                                          }
                                        }}
                                        placeholder="Transfer / tunai..."
                                        className="w-36 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] text-slate-900 dark:text-slate-100"
                                      />
                                    </div>
                                  </td>
                                  <td className="py-2 pl-3 text-right whitespace-nowrap space-x-1.5">
                                    {!isPaid && (
                                      <a
                                        href={buildWhatsAppUrl(
                                          s.phone,
                                          `Halo ${s.name}, pengingat iuran kas "${kas.title}" sebesar ${formatIDR(kas.amount)} (batas ${kas.deadline}). Terima kasih.`
                                        )}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold"
                                      >
                                        WA
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => void togglePaid(kas, s, isPaid)}
                                      className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                                        isPaid
                                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                                      }`}
                                    >
                                      {isPaid ? '✓ Lunas' : 'Tandai Lunas'}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* TAB 2: BUKU KAS (INCOME / EXPENSE) */}
      {activeTab === 'buku-kas' && (
        <div className="space-y-4">
          {showCashForm && canManage && (
            <form
              onSubmit={handleSaveCashEntry}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-4"
            >
              <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
                {editingCashId ? 'Edit Transaksi Buku Kas' : 'Catat Pemasukan / Pengeluaran Kas'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <select
                  value={cashType}
                  onChange={(e) => setCashType(e.target.value as 'INCOME' | 'EXPENSE')}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-900 dark:text-slate-100"
                >
                  <option value="EXPENSE">Pengeluaran (EXPENSE)</option>
                  <option value="INCOME">Pemasukan Lain (INCOME)</option>
                </select>
                <select
                  value={cashCategory}
                  onChange={(e) => setCashCategory(e.target.value as 'DIVISI' | 'PERAN' | 'UMUM')}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value="DIVISI">Per Divisi</option>
                  <option value="PERAN">Per Peran</option>
                  <option value="UMUM">Umum</option>
                </select>
                {cashCategory !== 'UMUM' ? (
                  <select
                    value={cashTarget}
                    onChange={(e) => setCashTarget(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  >
                    {(cashCategory === 'DIVISI'
                      ? DIVISIONS.map((d) => d.name)
                      : ROLE_DEFINITIONS.filter((r) => r.level !== 'ADMIN' && r.level !== 'GURU').map(
                          (r) => r.role
                        )
                    ).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    disabled
                    value="Umum Kelas"
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-xs text-slate-500"
                  />
                )}
                <input
                  type="date"
                  value={cashDate}
                  onChange={(e) => setCashDate(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <input
                  type="text"
                  required
                  value={cashItemName}
                  onChange={(e) => setCashItemName(e.target.value)}
                  placeholder="Nama barang / keperluan..."
                  className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                />
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min={1}
                    value={cashQty}
                    onChange={(e) => setCashQty(e.target.value)}
                    className="w-16 px-2 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                  <input
                    type="text"
                    value={cashUnit}
                    onChange={(e) => setCashUnit(e.target.value)}
                    placeholder="pcs"
                    className="flex-1 px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
                <input
                  type="number"
                  min={0}
                  required
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  placeholder="Total Nominal (Rp)"
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
                <input
                  type="text"
                  value={cashNotes}
                  onChange={(e) => setCashNotes(e.target.value)}
                  placeholder="Catatan / toko / nomor nota"
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetCashForm();
                    setShowCashForm(false);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold cursor-pointer"
                >
                  {editingCashId ? 'Simpan Perubahan' : 'Simpan Transaksi'}
                </button>
              </div>
            </form>
          )}

          <div className="flex flex-wrap gap-1.5">
            {(['ALL', 'INCOME', 'EXPENSE'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setCashFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  cashFilter === f
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {f === 'ALL' ? 'Semua Transaksi' : f === 'INCOME' ? 'Pemasukan' : 'Pengeluaran'}
              </button>
            ))}
          </div>

          {sortedCashEntries.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-10 text-center text-xs text-slate-500">
              Belum ada catatan pemasukan atau pengeluaran di Buku Kas.
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-500">
                    <th className="py-3 px-4 font-semibold">Tanggal</th>
                    <th className="py-3 px-4 font-semibold">Keperluan & Catatan</th>
                    <th className="py-3 px-3 font-semibold">Divisi / Target</th>
                    <th className="py-3 px-3 font-semibold">Jenis</th>
                    <th className="py-3 px-4 font-semibold text-right font-mono">Nominal</th>
                    {canManage && <th className="py-3 px-4 text-right font-semibold">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sortedCashEntries.map((c) => {
                    const isInc = c.type === 'INCOME';
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono whitespace-nowrap text-slate-600 dark:text-slate-300">
                          {(c.date || c.createdAt).slice(0, 10)}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-bold text-slate-900 dark:text-white">
                            {c.itemName || c.description || '-'}
                            {c.qty ? ` (${c.qty} ${c.unit || 'pcs'})` : ''}
                          </p>
                          {c.notes && <p className="text-[11px] text-slate-500">{c.notes}</p>}
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                          {c.targetName || c.category || '-'}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              isInc
                                ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                                : 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {isInc ? (
                              <ArrowDownCircle className="w-3 h-3" />
                            ) : (
                              <ArrowUpCircle className="w-3 h-3" />
                            )}
                            {isInc ? 'Masuk' : 'Keluar'}
                          </span>
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono tabular-nums font-bold ${
                            isInc
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {isInc ? '+' : '-'}
                          {formatIDR(c.amount)}
                        </td>
                        {canManage && (
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditCash(c)}
                                className="p-1 text-slate-400 hover:text-amber-500"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              {confirmDeleteCashId === c.id ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteCash(c.id)}
                                    className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold"
                                  >
                                    Yakin
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteCashId(null)}
                                    className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold"
                                  >
                                    Batal
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteCashId(c.id)}
                                  className="p-1 text-slate-400 hover:text-rose-500"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const RABModule: React.FC<{
  user: UserProfile;
  activeClass: SchoolClass | undefined;
  classId: string;
  rabItems: RabItem[];
}> = ({ user, activeClass, classId, rabItems }) => {
  const { showToast } = useToast();
  const canEdit =
    isTeacherOrAdmin(user.role) || ['Bendahara', 'Pimpinan Produksi'].includes(user.role);
  const divisions = useMemo(
    () => Array.from(new Set(ROLE_DEFINITIONS.map((r) => r.divisionName))),
    []
  );

  const [showForm, setShowForm] = useState(false);
  const [division, setDivision] = useState('Tata Panggung');
  const [category, setCategory] = useState('Material');
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('25000');
  const [notes, setNotes] = useState('');
  const [confirmDeleteRabId, setConfirmDeleteRabId] = useState<string | null>(null);

  const getRabQty = (r: RabItem) => Number(r.quantity ?? r.qty) || 1;
  const getRabTotal = (r: RabItem) =>
    Number(r.totalPrice) || getRabQty(r) * (Number(r.unitPrice) || 0);
  const getRabDiv = (r: RabItem) => r.division || r.targetName || r.category || 'Umum';
  const getRabStatus = (r: RabItem): RabItem['status'] => r.status || 'ESTIMASI';

  const grandTotal = useMemo(
    () => rabItems.reduce((s, r) => s + getRabTotal(r), 0),
    [rabItems]
  );

  const byDivision = useMemo(() => {
    const map = new Map<string, RabItem[]>();
    for (const item of rabItems) {
      const divKey = getRabDiv(item);
      const list = map.get(divKey) || [];
      list.push(item);
      map.set(divKey, list);
    }
    return Array.from(map.entries());
  }, [rabItems]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) {
      showToast('Nama item RAB wajib diisi', 'warning');
      return;
    }
    try {
      const qty = Math.max(1, Number(quantity) || 1);
      const price = Math.max(0, Number(unitPrice) || 0);
      const id = makeSafeId('rab');
      const now = new Date().toISOString();
      const item: RabItem = {
        id,
        classId,
        division,
        category: category.trim() || 'Operasional',
        itemName: itemName.trim(),
        quantity: qty,
        unitPrice: price,
        totalPrice: qty * price,
        status: 'ESTIMASI',
        notes: notes.trim(),
        createdAt: now,
        updatedAt: now,
      };
      await upsertDocument('rabItems', id, item as unknown as Record<string, unknown>);
      setItemName('');
      setNotes('');
      setShowForm(false);
      showToast('Item RAB ditambahkan', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menambah item RAB', 'error');
    }
  };

  const handleCycleStatus = async (item: RabItem, next: RabItem['status']) => {
    try {
      await upsertDocument('rabItems', item.id, {
        ...item,
        status: next,
        updatedAt: new Date().toISOString(),
      });
      showToast(`Status "${item.itemName}" diubah ke ${next}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memperbarui status RAB', 'error');
    }
  };

  const handleDeleteRab = async (id: string) => {
    try {
      await removeDocument('rabItems', id);
      setConfirmDeleteRabId(null);
      showToast('Item RAB dihapus', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus item RAB', 'error');
    }
  };

  const handleExportXlsx = () => {
    exportXLSX(`rab_produksi_${classId}`, [
      {
        name: 'RAB Produksi',
        headers: ['Divisi', 'Kategori', 'Item', 'Qty', 'Harga Satuan', 'Total', 'Status', 'Catatan'],
        rows: rabItems.map((r) => [
          getRabDiv(r),
          r.category || '-',
          r.itemName,
          getRabQty(r),
          Number(r.unitPrice) || 0,
          getRabTotal(r),
          getRabStatus(r),
          r.notes || '-',
        ]),
      },
    ]);
  };

  const handleExportDocx = () => {
    exportDOCX({
      filename: `RAB_Produksi_${classId}`,
      title: 'Rencana Anggaran Biaya (RAB) Produksi Teater',
      subtitle: `Total Estimasi Anggaran: ${formatIDR(grandTotal)}`,
      className: activeClass?.name || classId,
      table: {
        headers: ['Divisi', 'Item Kebutuhan', 'Qty', 'Harga Satuan', 'Subtotal', 'Status'],
        rows: rabItems.map((r) => [
          getRabDiv(r),
          r.itemName,
          String(getRabQty(r)),
          formatIDR(Number(r.unitPrice) || 0),
          formatIDR(getRabTotal(r)),
          getRabStatus(r),
        ]),
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-amber-500" />
            Rencana Anggaran Biaya (RAB)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Total Anggaran:{' '}
            <strong className="text-amber-600 dark:text-amber-400">{formatIDR(grandTotal)}</strong> ·{' '}
            {rabItems.length} item
          </p>
        </div>

        <div className="flex flex-wrap gap-2 no-print">
          <button
            type="button"
            onClick={handleExportDocx}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" /> Ekspor DOCX
          </button>
          <button
            type="button"
            onClick={handleExportXlsx}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Ekspor XLSX
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> Cetak TTD
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowForm(!showForm)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Tambah Item
            </button>
          )}
        </div>
      </div>

      {showForm && canEdit && (
        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-5 space-y-4 no-print"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <select
              value={division}
              onChange={(e) => setDivision(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            >
              {divisions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Kategori..."
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="Nama item..."
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            />
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Qty"
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
            />
            <input
              type="number"
              min={0}
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="Harga satuan"
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-between">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan pembelian / spesifikasi..."
              className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-semibold"
              >
                Simpan Item
              </button>
            </div>
          </div>
        </form>
      )}

      {byDivision.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-10 text-center text-xs text-slate-500">
          Belum ada item RAB tercatat.
        </div>
      ) : (
        <div className="space-y-4">
          {byDivision.map(([divName, list]) => {
            const sub = list.reduce((s, r) => s + getRabTotal(r), 0);
            return (
              <div
                key={divName}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 overflow-hidden"
              >
                <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/60 flex items-center justify-between">
                  <span className="font-display font-bold text-sm text-slate-900 dark:text-white">
                    {divName}
                  </span>
                  <span className="font-mono tabular-nums text-xs font-bold text-amber-600 dark:text-amber-400">
                    Subtotal: {formatIDR(sub)}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500">
                        <th className="py-2.5 px-4 font-semibold">Item</th>
                        <th className="py-2.5 px-3 font-semibold text-right font-mono">Qty</th>
                        <th className="py-2.5 px-3 font-semibold text-right font-mono">
                          Harga Satuan
                        </th>
                        <th className="py-2.5 px-3 font-semibold text-right font-mono">Total</th>
                        <th className="py-2.5 px-4 font-semibold">Status</th>
                        {canEdit && <th className="py-2.5 px-4 text-right no-print">Aksi</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {list.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2.5 px-4">
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {r.itemName}
                            </p>
                            {r.notes && <p className="text-[11px] text-slate-500">{r.notes}</p>}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {getRabQty(r)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {formatIDR(Number(r.unitPrice) || 0)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold">
                            {formatIDR(getRabTotal(r))}
                          </td>
                          <td className="py-2.5 px-4">
                            {canEdit ? (
                              <select
                                value={getRabStatus(r)}
                                onChange={(e) =>
                                  void handleCycleStatus(r, e.target.value as RabItem['status'])
                                }
                                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-semibold text-slate-900 dark:text-slate-100"
                              >
                                {(['ESTIMASI', 'DISETUJUI', 'DIBAYAR', 'REALISASI'] as const).map(
                                  (st) => (
                                    <option key={st} value={st}>
                                      {st}
                                    </option>
                                  )
                                )}
                              </select>
                            ) : (
                              <span className="font-semibold">{getRabStatus(r)}</span>
                            )}
                          </td>
                          {canEdit && (
                            <td className="py-2.5 px-4 text-right no-print whitespace-nowrap">
                              {confirmDeleteRabId === r.id ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteRab(r.id)}
                                    className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold"
                                  >
                                    Yakin
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteRabId(null)}
                                    className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold"
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteRabId(r.id)}
                                  className="p-1 text-slate-400 hover:text-rose-500"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
