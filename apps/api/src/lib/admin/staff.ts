/**
 * WHO IS STAFF, ASKED OF THE DATABASE, EVERY TIME.
 *
 * There is exactly one answer to "is this person staff right now", and it is
 * `staff_role(user_id)` in SQL (0025 §9), which is the only thing that reads
 * `role` and `revoked_at` together. This file does not reimplement that check;
 * it calls it.
 *
 * NEVER FROM A CLAIM. A JWT is minted once and lives for an hour. A role
 * revoked at 10:00 is still in the token at 10:59, and an admin surface that
 * trusts the token hands a fired employee an hour of everything. The cost of
 * asking the database is one round trip on a route that is already reading
 * other people's data; the cost of not asking is unbounded.
 *
 * There is no cache here on purpose. A 30-second memo would be a 30-second
 * window in which a revoke has not happened yet, and this is the one place in
 * the app where that trade is not worth making.
 */
import type { StaffRole } from '@shared/api';
import { serviceClient, isMissingObject } from './../db';
import { ApiError } from './../errors';
import { log } from './../log';

export type { StaffRole };

/**
 * BLAST RADIUS, NOT SENIORITY (0025 §1). `support` reads and writes notes;
 * `admin` grants entitlements, makes invites and merges people; `owner` grants
 * staff. A route names the LOWEST role that may run it.
 */
const RANK: Record<StaffRole, number> = { support: 1, admin: 2, owner: 3 };

export function atLeast(role: StaffRole, min: StaffRole): boolean {
  return RANK[role] >= RANK[min];
}

/**
 * `null` for "not staff", which is also the answer for a revoked row, a missing
 * row and a user that does not exist. The caller must not be able to tell those
 * apart — see `staffed()` in lib/http.ts for why the answer is NOT_FOUND.
 */
export async function loadStaffRole(userId: string): Promise<StaffRole | null> {
  const db = serviceClient();
  const { data, error } = await db.rpc('staff_role', { p_user_id: userId });
  if (error) {
    // A missing function means 0025 has not been applied. That is a deployment
    // fault, not a permission decision, and answering "not staff" would quietly
    // turn the whole admin surface off with no way to tell why.
    if (isMissingObject(error)) {
      log('error', 'no-request-id', 'staff.role_function_missing', { message: error.message });
      throw new ApiError('INTERNAL', 'We could not check that right now. Please try again.', {
        status: 503,
      });
    }
    log('error', 'no-request-id', 'staff.role_failed', { code: error.code, message: error.message });
    throw new ApiError('INTERNAL', 'We could not check that right now. Please try again.', {
      status: 503,
    });
  }
  const role = typeof data === 'string' ? data : null;
  return role === 'support' || role === 'admin' || role === 'owner' ? role : null;
}

export function staffPlain(role: StaffRole | null): string {
  switch (role) {
    case 'owner':
      return 'You are the owner. You can grant staff access as well as everything below it.';
    case 'admin':
      return 'You are an admin. Invites, entitlements and merges are yours; staff access is not.';
    case 'support':
      return 'You are support. You can read the CRM and leave notes.';
    default:
      return 'You do not have staff access.';
  }
}
