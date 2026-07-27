import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { apiError, apiSuccess } from "@/lib/api/response";
import { db } from "@/lib/db";
import { users, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/auth/password";
import { checkLockout, handleFailedLogin, handleSuccessfulLogin } from "@/lib/auth/lockout";
import { logAuditEvent } from "@/lib/audit/logger";

export async function POST(req: NextRequest) {
  // 1. Rate limiting check (max 10 attempts per minute per IP)
  const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
  const rateCheck = checkRateLimit(`login:${ip}`, 10, 60000);
  if (!rateCheck.isAllowed) {
    return apiError("SYS_001", undefined, undefined, 429);
  }

  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return apiError("SYS_003", "Email and password are required.", undefined, 400);
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    const userAgent = req.headers.get("user-agent") || "";

    if (!user) {
      await logAuditEvent({
        action: "LOGIN_FAILED",
        category: "AUTH",
        details: { email: normalizedEmail, reason: "USER_NOT_FOUND" },
        ipAddress: ip,
        userAgent,
      });
      return apiError("AUTH_001", undefined, undefined, 401);
    }

    // 2. Lockout check
    const lockout = checkLockout(user);
    if (lockout.isLocked) {
      await logAuditEvent({
        userId: user.id,
        action: "LOGIN_BLOCKED_LOCKED",
        category: "AUTH",
        details: { email: normalizedEmail, remainingMinutes: lockout.remainingMinutes },
        ipAddress: ip,
        userAgent,
      });
      return apiError(
        "AUTH_002",
        `Account locked. Please try again in ${lockout.remainingMinutes} minutes.`,
        { remainingMinutes: lockout.remainingMinutes },
        423
      );
    }

    // 3. User account active check
    if (!user.isActive) {
      await logAuditEvent({
        userId: user.id,
        action: "LOGIN_FAILED_INACTIVE",
        category: "AUTH",
        details: { email: normalizedEmail },
        ipAddress: ip,
        userAgent,
      });
      return apiError("AUTH_005", "User account is inactive.", undefined, 403);
    }

    // 4. Employee lifecycle status check if employee-linked
    if (user.employeeId) {
      const emp = await db.query.employees.findFirst({
        where: eq(employees.id, user.employeeId),
      });
      if (!emp || emp.status !== "active" || emp.deletedAt !== null) {
        await logAuditEvent({
          userId: user.id,
          action: "LOGIN_FAILED_EMPLOYEE_STATUS",
          category: "AUTH",
          resourceType: "employee",
          resourceId: user.employeeId,
          details: { email: normalizedEmail, employeeStatus: emp?.status || "DELETED" },
          ipAddress: ip,
          userAgent,
        });
        return apiError(
          "AUTH_005",
          `Employee lifecycle status '${emp?.status || "inactive"}' prohibits login. Only active employees can access the platform.`,
          undefined,
          403
        );
      }
    }

    // 5. Password verification
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      const lockoutRes = await handleFailedLogin(user.id, user.failedLoginAttempts);
      await logAuditEvent({
        userId: user.id,
        action: lockoutRes.isNowLocked ? "ACCOUNT_LOCKED" : "LOGIN_FAILED",
        category: "AUTH",
        details: {
          email: normalizedEmail,
          attempts: user.failedLoginAttempts + 1,
          isNowLocked: lockoutRes.isNowLocked,
        },
        ipAddress: ip,
        userAgent,
      });

      if (lockoutRes.isNowLocked) {
        return apiError(
          "AUTH_002",
          "Account has been locked for 15 minutes due to 5 consecutive failed login attempts.",
          undefined,
          423
        );
      }

      return apiError("AUTH_001", undefined, undefined, 401);
    }

    // 6. Success: Reset lockout & log success
    await handleSuccessfulLogin(user.id);
    await logAuditEvent({
      userId: user.id,
      action: "LOGIN_SUCCESS",
      category: "AUTH",
      details: { email: normalizedEmail, role: user.role },
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
      },
    });
  } catch (error: any) {
    console.error("LOGIN_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}
