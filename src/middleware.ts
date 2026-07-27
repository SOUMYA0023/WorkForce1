import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Public paths that do not require session cookie
  if (
    path.startsWith("/api/v1/auth") ||
    path.startsWith("/api/auth") ||
    path === "/login" ||
    path.startsWith("/_next") ||
    path === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Check for NextAuth session cookies
  const hasSessionCookie =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token") ||
    request.cookies.has("next-auth.session-token") ||
    request.cookies.has("__Secure-next-auth.session-token");

  if (!hasSessionCookie) {
    // If requesting an API endpoint, return 401 JSON
    if (path.startsWith("/api/")) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AUTH_003",
            message: "Authentication required. Please sign in.",
          },
        },
        { status: 401 }
      );
    }

    // Redirect to login for UI pages
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
