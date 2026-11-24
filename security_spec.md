# Security Specification — SP-PPT v2 (SMP Negeri 10 Samarinda)

## 1. Data Invariants
1. **Identity Integrity**: Every user profile (`users/{uid}`), PII record (`userPrivate/{uid}`), assessment (`assessments`), submission (`deadlineSubmissions`), attendance record (`attendanceRecords`), and complaint (`complaints`) MUST bind its owner/author/assessor UID to `request.auth.uid` unless created/moderated by an authorized Teacher (`Guru Pengampu`) or Administrator (`Super Admin` / `Admin`).
2. **Privilege Escalation Guard**: Students cannot self-assign `Guru Pengampu`, `Admin`, or `Super Admin` roles during registration or profile updates. Only verified bootstrapped Super Admin (`fikri.yassaar15@guru.smp.belajar.id` with `email_verified == true`) or existing `admins/{uid}` entries can grant elevated roles.
3. **PII Isolation**: Email addresses, WhatsApp phone numbers, and NIS/NIP are isolated in `userPrivate/{uid}` and `userCredentials/{uid}`, never exposed in public class directory `users/{uid}` documents.
4. **Path Variable Hardening**: Every single-document operation validates document IDs (`^[a-zA-Z0-9_\-]+$`, max 128 chars) and enforces strict string/array size limits to prevent resource poisoning.
5. **Assessment Integrity**: Peer assessments can only be created or updated by the `assessorId` (matching `request.auth.uid`) or moderated/deleted by `Guru Pengampu` / `Admin`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Elevation Registration**: Student creates `users/{uid}` with `role: "Super Admin"`. -> `PERMISSION_DENIED`.
2. **Role Tampering Update**: Student updates own `users/{uid}` changing `role` from `"Pemeran"` to `"Guru Pengampu"`. -> `PERMISSION_DENIED`.
3. **Email Spoofing Admin**: Unverified token (`email_verified: false`) claiming `fikri.yassaar15@guru.smp.belajar.id` attempts admin write. -> `PERMISSION_DENIED`.
4. **PII Scraping**: Student A calls `get` or `list` on `userPrivate/{studentB_uid}`. -> `PERMISSION_DENIED`.
5. **Credential Theft**: Student calls `get` on `userCredentials/{studentB_uid}`. -> `PERMISSION_DENIED`.
6. **Shadow Field Injection**: User includes `isVerified: true` or `bypassGate: true` on `users/{uid}` create. -> `PERMISSION_DENIED`.
7. **Forged Assessment**: Student A creates an assessment with `assessorId: studentB_uid`. -> `PERMISSION_DENIED`.
8. **Score Tampering**: Student A updates `assessments` document created by `Guru Pengampu`. -> `PERMISSION_DENIED`.
9. **ID Poisoning**: Client writes document with 500-character ID or invalid characters (`../admin`). -> `PERMISSION_DENIED`.
10. **Complaint Snooping**: Student A attempts to read `complaints` belonging to Student B. -> `PERMISSION_DENIED`.
11. **Notification Tampering**: Student A reads or deletes `notifications` belonging to Student B. -> `PERMISSION_DENIED`.
12. **Audit Log Forgery**: Student deletes or modifies existing `auditLogs` entries. -> `PERMISSION_DENIED`.
