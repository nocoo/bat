import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// E2E bypass — when E2E_SKIP_AUTH=1, skip NextAuth entirely to avoid
// MissingSecret errors and allow Playwright tests to run without OAuth.
// Per docs/06-dashboard.md § L4 and docs/07-testing.md § L4.
// ---------------------------------------------------------------------------

const isE2E = process.env.E2E_SKIP_AUTH === "1";

function createE2EAuth() {
	const fakeSession = {
		user: { email: "e2e@test.local", name: "E2E User" },
		expires: new Date(Date.now() + 86_400_000).toISOString(),
	};

	// auth() supports two call signatures in NextAuth v5:
	// 1. auth() → Promise<Session | null>       (used in API routes)
	// 2. auth(handler) → middleware function     (used in proxy.ts)
	const auth = (handler?: (req: NextRequest & { auth: typeof fakeSession }) => unknown) => {
		if (!handler) {
			return Promise.resolve(fakeSession);
		}
		return (req: NextRequest) => {
			Object.assign(req, { auth: fakeSession });
			return handler(req as NextRequest & { auth: typeof fakeSession });
		};
	};

	return {
		handlers: {
			GET: () => NextResponse.json({ ok: true }),
			POST: () => NextResponse.json({ ok: true }),
		},
		signIn: () => Promise.resolve(),
		signOut: () => Promise.resolve(),
		auth,
	};
}

function createRealAuth() {
	// These imports are safe here — NextAuth only throws MissingSecret when
	// NextAuth() is called, and this function is never called in E2E mode.
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const NextAuth = require("next-auth").default;
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const Google = require("next-auth/providers/google").default;

	const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
		.split(",")
		.map((email: string) => email.trim().toLowerCase())
		.filter(Boolean);

	const useSecureCookies =
		process.env.NODE_ENV === "production" ||
		process.env.NEXTAUTH_URL?.startsWith("https://") ||
		process.env.USE_SECURE_COOKIES === "true";

	return NextAuth({
		trustHost: true,
		providers: [
			Google({
				clientId: process.env.GOOGLE_CLIENT_ID ?? "",
				clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
			}),
		],
		pages: {
			signIn: "/login",
			error: "/login",
		},
		cookies: {
			pkceCodeVerifier: {
				name: useSecureCookies ? "__Secure-authjs.pkce.code_verifier" : "authjs.pkce.code_verifier",
				options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies },
			},
			state: {
				name: useSecureCookies ? "__Secure-authjs.state" : "authjs.state",
				options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies },
			},
			callbackUrl: {
				name: useSecureCookies ? "__Secure-authjs.callback-url" : "authjs.callback-url",
				options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies },
			},
			sessionToken: {
				name: useSecureCookies ? "__Secure-authjs.session-token" : "authjs.session-token",
				options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies },
			},
			csrfToken: {
				name: useSecureCookies ? "__Host-authjs.csrf-token" : "authjs.csrf-token",
				options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies },
			},
		},
		callbacks: {
			async signIn({ user }: { user: { email?: string } }) {
				const email = user.email?.toLowerCase();
				if (!email || !allowedEmails.includes(email)) {
					return false;
				}
				return true;
			},
		},
	});
}

const authResult = isE2E ? createE2EAuth() : createRealAuth();

export const { handlers, signIn, signOut, auth } = authResult;
