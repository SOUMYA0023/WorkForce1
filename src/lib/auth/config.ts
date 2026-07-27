/**
 * NextAuth Configuration (FR-001, FR-004, ADR §3)
 *
 * Uses Credentials Provider with Database Sessions.
 * Authenticates users against the users table, verifies password hash,
 * checks account lockout, and ensures employee state is active (if employee-linked).
 * Logs successful and failed login attempts to audit_logs (FR-005, SR-005).
 */

import CredentialsProvider from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "../db";
import { users, employees } from "../db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "./password";
import { checkLockout, handleFailedLogin, handleSuccessfulLogin } from "./lockout";
import { logAuditEvent } from "../audit/logger";

export const authOptions: any = {
  adapter: DrizzleAdapter(db) as any,
  session: {
    strategy: "database",
    maxAge: (parseInt(process.env.SESSION_TIMEOUT_MINUTES || "30", 10)) * 60,
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials: any, req: any) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = String(credentials.email).toLowerCase().trim();
        const user = await db.query.users.findFirst({
          where: eq(users.email, email),
        });

        const ipAddress = (req?.headers as any)?.["x-forwarded-for"] || "127.0.0.1";
        const userAgent = (req?.headers as any)?.["user-agent"] || "";

        if (!user) {
          await logAuditEvent({
            action: "LOGIN_FAILED",
            category: "AUTH",
            details: { email, reason: "USER_NOT_FOUND" },
            ipAddress,
            userAgent,
          });
          return null;
        }

        // 1. Check account lockout
        const lockout = checkLockout(user);
        if (lockout.isLocked) {
          await logAuditEvent({
            userId: user.id,
            action: "LOGIN_BLOCKED_LOCKED",
            category: "AUTH",
            details: { email, remainingMinutes: lockout.remainingMinutes },
            ipAddress,
            userAgent,
          });
          throw new Error(`ACCOUNT_LOCKED:${lockout.remainingMinutes}`);
        }

        // 2. Check if user account is active
        if (!user.isActive) {
          await logAuditEvent({
            userId: user.id,
            action: "LOGIN_FAILED_INACTIVE",
            category: "AUTH",
            details: { email, reason: "USER_ACCOUNT_INACTIVE" },
            ipAddress,
            userAgent,
          });
          throw new Error("USER_INACTIVE");
        }

        // 3. If linked to employee, check employee lifecycle status (must be 'active')
        if (user.employeeId) {
          const emp = await db.query.employees.findFirst({
            where: eq(employees.id, user.employeeId),
          });
          if (!emp || emp.status !== "active" || emp.deletedAt !== null) {
            await logAuditEvent({
              userId: user.id,
              action: "LOGIN_FAILED_EMPLOYEE_NOT_ACTIVE",
              category: "AUTH",
              resourceType: "employee",
              resourceId: user.employeeId,
              details: { email, employeeStatus: emp?.status || "NOT_FOUND" },
              ipAddress,
              userAgent,
            });
            throw new Error("EMPLOYEE_NOT_ACTIVE");
          }
        }

        // 4. Verify password
        const isPasswordValid = await verifyPassword(
          String(credentials.password),
          user.passwordHash
        );

        if (!isPasswordValid) {
          const lockoutResult = await handleFailedLogin(
            user.id,
            user.failedLoginAttempts
          );
          await logAuditEvent({
            userId: user.id,
            action: lockoutResult.isNowLocked ? "ACCOUNT_LOCKED" : "LOGIN_FAILED",
            category: "AUTH",
            details: {
              email,
              attempts: user.failedLoginAttempts + 1,
              isNowLocked: lockoutResult.isNowLocked,
            },
            ipAddress,
            userAgent,
          });

          if (lockoutResult.isNowLocked) {
            throw new Error("ACCOUNT_NOW_LOCKED");
          }
          return null;
        }

        // 5. Success! Reset failed login attempts and log event
        await handleSuccessfulLogin(user.id);
        await logAuditEvent({
          userId: user.id,
          action: "LOGIN_SUCCESS",
          category: "AUTH",
          details: { email, role: user.role },
          ipAddress,
          userAgent,
        });

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          employeeId: user.employeeId,
        } as any;
      },
    }),
  ],
  callbacks: {
    async session({ session, user }: any) {
      if (session?.user) {
        (session.user as any).id = user.id;
        (session.user as any).role = (user as any).role;
        (session.user as any).employeeId = (user as any).employeeId;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
