/**
 * Account Lockout Protection (Refinement #6)
 *
 * Locks accounts after 5 consecutive failed login attempts
 * for a duration of 15 minutes.
 */

import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MINUTES = 15;

export interface LockoutStatus {
  isLocked: boolean;
  lockedUntil?: Date;
  remainingMinutes?: number;
}

export function checkLockout(user: {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}): LockoutStatus {
  if (user.lockedUntil) {
    const now = new Date();
    const lockedUntilDate = new Date(user.lockedUntil);
    if (lockedUntilDate > now) {
      const remainingMs = lockedUntilDate.getTime() - now.getTime();
      const remainingMinutes = Math.ceil(remainingMs / (1000 * 60));
      return {
        isLocked: true,
        lockedUntil: lockedUntilDate,
        remainingMinutes,
      };
    }
  }
  return { isLocked: false };
}

export async function handleFailedLogin(userId: string, currentAttempts: number) {
  const newAttempts = currentAttempts + 1;
  const now = new Date();

  if (newAttempts >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(
      now.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000
    );
    await db
      .update(users)
      .set({
        failedLoginAttempts: newAttempts,
        lockedUntil,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    return { isNowLocked: true, lockedUntil };
  } else {
    await db
      .update(users)
      .set({
        failedLoginAttempts: newAttempts,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    return { isNowLocked: false, remainingAttempts: MAX_FAILED_ATTEMPTS - newAttempts };
  }
}

export async function handleSuccessfulLogin(userId: string) {
  const now = new Date();
  await db
    .update(users)
    .set({
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, userId));
}
