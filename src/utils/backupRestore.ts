import {
  BackupPayload,
  createClassBackup,
  downloadBackupJSON as downloadPayloadJSON,
  LegacyMigrationResult,
  migrateFromLegacyDefaultDatabase,
  restoreClassBackup,
  validateBackupFile as validateRawBackup,
} from '../services/backupRestore';

export type BackupData = BackupPayload;
export type { LegacyMigrationResult };

export async function createBackup(classId: string, className = ''): Promise<BackupData> {
  return createClassBackup(classId, className || classId);
}

export function downloadBackupJSON(backup: BackupData): void {
  downloadPayloadJSON(backup);
}

export async function validateBackupFile(file: File): Promise<BackupData> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('File bukan JSON yang valid.');
  }
  const result = validateRawBackup(parsed);
  if (!result.valid || !result.payload) {
    throw new Error(result.error || 'Struktur file backup tidak valid.');
  }
  return result.payload;
}

export async function restoreBackup(backup: BackupData): Promise<{ restored: number }> {
  const restored = await restoreClassBackup(backup);
  return { restored };
}

export { migrateFromLegacyDefaultDatabase };
