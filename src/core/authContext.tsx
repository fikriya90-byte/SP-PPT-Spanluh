import React, { createContext, useContext } from 'react';
import { ASSESSMENT_MATRIX, isAdminRole as checkAdmin, isTeacherOrAdmin } from './constants';
import { RoleName, SchoolClass, UserProfile } from './types';

export interface AuthContextValue {
  user: (UserProfile & { displayName: string; photoURL: string; className: string }) | null;
  activeClass: (SchoolClass & { kerabatKerja?: string; theme?: string }) | null;
  setActiveClass: (cls: SchoolClass | null) => void;
  classes: (SchoolClass & { kerabatKerja?: string; theme?: string })[];
  reloadClasses: () => Promise<void>;
  isGuruPengampu: boolean;
  isAdminRole: boolean;
  isTeacher: boolean;
  isPimprod: boolean;
  isSekretaris: boolean;
  isBendahara: boolean;
  isSutradara: boolean;
  canAssessTarget: (targetRole: string) => boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function buildAuthFlags(
  user: UserProfile | null,
  activeClass: SchoolClass | null,
  classes: SchoolClass[],
  setActiveClass: (cls: SchoolClass | null) => void,
  reloadClasses: () => Promise<void>
): AuthContextValue {
  const role = user?.role || '';
  const isAdm = checkAdmin(role);
  const isGuru = role === 'Guru Pengampu' || (role as string) === 'Guru Pembina';
  const isTchr = isTeacherOrAdmin(role);

  const normalizedUser = user
    ? {
        ...user,
        displayName: user.displayName || user.name || 'Pengguna',
        name: user.name || user.displayName || 'Pengguna',
        photoURL: user.photoURL || user.photoUrl || '',
        photoUrl: user.photoUrl || user.photoURL || '',
        className:
          user.className ||
          classes.find((c) => c.id === user.classId)?.name ||
          activeClass?.name ||
          user.classId ||
          '',
      }
    : null;

  const normalizedActiveClass = activeClass
    ? {
        ...activeClass,
        kerabatKerja: activeClass.kerabatKerja || activeClass.troupeName || '',
      }
    : null;

  const normalizedClasses = classes.map((c) => ({
    ...c,
    kerabatKerja: c.kerabatKerja || c.troupeName || '',
  }));

  const canAssessTarget = (targetRole: string): boolean => {
    if (!user) return false;
    if (isTchr) return true;
    const normalizedTarget = (targetRole === 'Pemain' ? 'Pemeran' : targetRole) as RoleName;
    const matrix = ASSESSMENT_MATRIX[user.role];
    if (!matrix) return false;
    return Boolean(
      matrix.ATASAN?.includes(normalizedTarget) ||
        matrix.REKAN?.includes(normalizedTarget) ||
        matrix.BAWAHAN?.includes(normalizedTarget)
    );
  };

  return {
    user: normalizedUser,
    activeClass: normalizedActiveClass,
    setActiveClass,
    classes: normalizedClasses,
    reloadClasses,
    isGuruPengampu: isGuru,
    isAdminRole: isAdm,
    isTeacher: isTchr,
    isPimprod: role === 'Pimpinan Produksi',
    isSekretaris: role === 'Sekretaris',
    isBendahara: role === 'Bendahara',
    isSutradara: role === 'Sutradara',
    canAssessTarget,
  };
}

export const AuthProvider: React.FC<{
  value: AuthContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
