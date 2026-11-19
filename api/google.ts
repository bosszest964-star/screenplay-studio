import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const scopes = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/documents",
];
const tokenUrl = "https://oauth2.googleapis.com/token";
const loginCookie = "__Host-sceneform_google_login";
const sessionCookie = "__Host-sceneform_google";
const sessionLifetime = 30 * 24 * 60 * 60;

interface Login {
  state: string;
  verifier: string;
  returnTo: string;
  expiresAt: number;
}

interface Session {
  refreshToken: string;
  accessToken: string;
  accessExpiresAt: number;
  expiresAt: number;
}

interface GoogleToken {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
}

function configuration(url: URL) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const key = Buffer.from(process.env.GOOGLE_SESSION_SECRET ?? "", "base64");
  const address = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !address || key.length !== 32) return null;
  try {
    const redirect = new URL(address);
    const local = ["localhost", "127.0.0.1"].includes(redirect.hostname);
    if ((redirect.protocol !== "https:" && !(local && redirect.protocol === "http:")) ||
        redirect.origin !== url.origin || redirect.pathname !== "/api/google" ||
        redirect.search || redirect.hash || redirect.username || redirect.password) return null;
    return { clientId, clientSecret, redirect: redirect.href, key };
  } catch {
    return null;
  }
}

function seal(value: object, key: Buffer, purpose: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(purpose));
  return Buffer.concat([iv, cipher.update(JSON.stringify(value), "utf8"), cipher.final(), cipher.getAuthTag()]).toString("base64url");
}

function open<T extends { expiresAt: number }>(request: Request, key: Buffer, name: string): T | null {
  const entry = request.headers.get("cookie")?.split(/;\s*/).find((value) => value.startsWith(`${name}=`));
  if (!entry) return null;
  try {
    const bytes = Buffer.from(entry.slice(name.length + 1), "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(name));
    decipher.setAuthTag(bytes.subarray(-16));
    const value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString("utf8")) as T;
    return value.expiresAt > Date.now() ? value : null;
  } catch {
    return null;
  }
}

function cookie(response: Response, name: string, value: string, age: number) {
  response.headers.append("Set-Cookie", `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`);
  return response;
}

const noStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const json = (value: object, status = 200) => Response.json(value, { status, headers: noStore });
const redirect = (location: string) => new Response(null, { status: 303, headers: { ...noStore, Location: location } });

function returnPath(value: string | null, base: string) {
  if (!value?.startsWith("/") || value.length > 1000 || value.startsWith("//") || value.includes("\\")) return "/";
  const url = new URL(value, base);
  return url.origin === base && ["/", "/editor/", "/production/", "/print/"].includes(url.pathname)
    ? url.pathname + url.search : "/";
}

function loginResult(path: string, origin: string, result: string) {
  const url = new URL(path, origin);
  url.searchParams.set("google", result);
  return url.pathname + url.search;
}

async function exchange(parameters: Record<string, string>): Promise<GoogleToken> {
  const response = await fetch(tokenUrl, {
    method: "POST",
    body: new URLSearchParams(parameters),
    signal: AbortSignal.timeout(12_000),
  });
  return await response.json() as GoogleToken;
}

function sessionResponse(session: Session, key: Buffer, updateCookie: boolean) {
  const response = json({
    configured: true, accessToken: session.accessToken, expiresAt: session.accessExpiresAt,
  });
  return updateCookie ? cookie(response, sessionCookie, seal(session, key, sessionCookie), sessionLifetime) : response;
}

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    const config = configuration(url);
    const action = url.searchParams.get("action") ?? "session";
    const callback = url.searchParams.has("code") || url.searchParams.has("error");
    if (request.method === "POST") {
      if (request.headers.get("origin") !== url.origin || action !== "disconnect") return json({}, 403);
      return cookie(json({ configured: !!config }), sessionCookie, "", 0);
    }
    if (request.method !== "GET") return json({}, 405);
    if (!config) return json({ configured: false });
    const { key, clientId, clientSecret } = config;
    const credentials = { client_id: clientId, client_secret: clientSecret };

    if (callback) {
      const login = open<Login>(request, key, loginCookie);
      const code = url.searchParams.get("code");
      const finish = (result: string) => cookie(redirect(loginResult(login?.returnTo ?? "/", url.origin, result)), loginCookie, "", 0);
      if (!login || url.searchParams.get("state") !== login.state || !code) return finish("error");

      try {
        const token = await exchange({
          ...credentials, code, redirect_uri: config.redirect, code_verifier: login.verifier, grant_type: "authorization_code",
        });
        const granted = token.scope?.split(/\s+/);
        if (!token.access_token || !token.refresh_token || !token.expires_in ||
            (granted && (granted.length !== scopes.length || scopes.some((scope) => !granted.includes(scope))))) {
          return finish("error");
        }
        const session: Session = {
          refreshToken: token.refresh_token, accessToken: token.access_token,
          accessExpiresAt: Date.now() + token.expires_in * 1000, expiresAt: Date.now() + sessionLifetime * 1000,
        };
        return cookie(finish("connected"), sessionCookie, seal(session, key, sessionCookie), sessionLifetime);
      } catch {
        return finish("error");
      }
    }

    if (action === "connect") {
      const login: Login = {
        state: randomBytes(24).toString("base64url"),
        verifier: randomBytes(32).toString("base64url"),
        returnTo: returnPath(url.searchParams.get("returnTo"), url.origin),
        expiresAt: Date.now() + 600_000,
      };
      const query = new URLSearchParams({
        client_id: clientId, redirect_uri: config.redirect,
        response_type: "code", scope: scopes.join(" "), access_type: "offline", prompt: "consent",
        state: login.state, code_challenge_method: "S256",
        code_challenge: createHash("sha256").update(login.verifier).digest("base64url"),
      });
      return cookie(redirect(`https://accounts.google.com/o/oauth2/v2/auth?${query}`),
        loginCookie, seal(login, key, loginCookie), 600);
    }

    if (action !== "session") return json({}, 404);
    const session = open<Session>(request, key, sessionCookie);
    if (!session) return json({ configured: true });
    if (session.accessExpiresAt > Date.now() + 60_000 && url.searchParams.get("refresh") !== "1") {
      return sessionResponse(session, key, false);
    }
    try {
      const token = await exchange({ ...credentials, refresh_token: session.refreshToken, grant_type: "refresh_token" });
      if (token.error === "invalid_grant") return cookie(json({ configured: true }), sessionCookie, "", 0);
      if (!token.access_token || !token.expires_in) return json({ configured: true }, 502);
      return sessionResponse({
        refreshToken: token.refresh_token ?? session.refreshToken,
        accessToken: token.access_token, accessExpiresAt: Date.now() + token.expires_in * 1000,
        expiresAt: Date.now() + sessionLifetime * 1000,
      }, key, true);
    } catch {
      return json({ configured: true }, 502);
    }
  },
};
