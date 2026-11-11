import { UserRole } from '@pos/shared';

/**
 * Who may set a clinical safety warning aside, or approve selling a prescription-only medicine without a prescription:
 * the owner, a manager, or a pharmacist. Voids and other money overrides stay with owners and managers.
 */
export const CLINICAL_APPROVER_ROLES: UserRole[] = [UserRole.OWNER, UserRole.MANAGER, UserRole.PHARMACIST];

/** Role strings that may approve with their own login (ADMIN is the legacy owner-level role). */
export const CLINICAL_SELF_APPROVE = ['OWNER', 'ADMIN', 'MANAGER', 'PHARMACIST'];
