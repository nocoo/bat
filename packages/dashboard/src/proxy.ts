import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Build redirect URL respecting reverse proxy headers
function buildRedirectUrl(req: NextRequest, pathname: string): URL {
	const forwardedHost = req.headers.get("x-forwarded-host");
	const forwardedProto = req.headers.get("x-forwarded-proto") || "https";

	if (forwardedHost) {
		// Use forwarded host from reverse proxy
		return new URL(pathname, `${forwardedProto}://${forwardedHost}`);
	}

	// Fallback to request URL
	return new URL(pathname, req.nextUrl.origin);
}

// Next.js 16 proxy convention (replaces middleware.ts)
// NextAuth's auth() returns a middleware-compatible handler
const authHandler = auth(async (req) => {
	const pathname = req.nextUrl.pathname;

	// Allow auth routes (OAuth flow)
	if (pathname.startsWith("/api/auth")) {
		return NextResponse.next();
	}

	const isLoggedIn = !!req.auth;

	// Not logged in → redirect to login (except if already on /login)
	if (!isLoggedIn && pathname !== "/login") {
		return NextResponse.redirect(buildRedirectUrl(req, "/login"));
	}

	// Logged in on /login → redirect to home
	if (isLoggedIn && pathname === "/login") {
		return NextResponse.redirect(buildRedirectUrl(req, "/"));
	}

	return NextResponse.next();
});

// Export as named 'proxy' function for Next.js 16
export function proxy(request: NextRequest) {
	return authHandler(request, {} as never);
}

export const config = {
	matcher: [
		// Match all paths except static files and health check
		"/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.ico$|.*\\.svg$|api/live).*)",
	],
};
