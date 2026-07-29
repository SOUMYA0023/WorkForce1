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
    strategy: "jwt", // JWT for fast edge token inspection & seamless API verification
    maxAge: (parseInt(process.env.SESSION_TIMEOUT_MINUTES || "30", 10)) * 60,
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    callbackUrl: {
      name: process.env.NODE_ENV === "production" ? "__Secure-authjs.callback-url" : "authjs.callback-url",
      options: {
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    csrfToken: {
      name: process.env.NODE_ENV === "production" ? "__Host-authjs.csrf-token" : "authjs.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
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
            category: "SECURITY",
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
            category: lockoutResult.isNowLocked ? "SECURITY" : "AUTH",
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
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.employeeId = user.employeeId;
      }
      return token;
    },
    async session({ session, token }: any) {
      if (session?.user) {
        session.user.id = token.id || token.sub;
        session.user.role = token.role;
        session.user.employeeId = token.employeeId;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
