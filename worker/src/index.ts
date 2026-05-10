/**
 * Poluneev subscribe Worker.
 *
 * POST /subscribe   { "email": "..." }
 *   200  { "success": true }
 *   400  { "success": false, "reason": "Invalid email." }
 *   409  { "success": false, "reason": "Already subscribed." }
 *   429  { "success": false, "reason": "Rate limit reached. Try again later." }
 *   500  { "success": false, "reason": "..." }
 *
 * Storage in KV (single SUBSCRIBERS namespace, two key prefixes):
 *   sub:<lowercased-email>     JSON {email, ts_iso, ip_hash, ua}
 *   rl:<ip-hash>:<bucket-hr>   string-int count, TTL 1 hour
 *
 * No PHI is logged or stored. Raw IPs never leave this Worker — only the
 * sha-256[:12] hex prefix is persisted with each subscriber and used as
 * the rate-limit key.
 */

export interface Env {
  SUBSCRIBERS: KVNamespace;
  ALLOWED_ORIGINS: string;
  RATE_LIMIT_PER_HOUR: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ----- helpers --------------------------------------------------------
function pickOrigin(req: Request, env: Env): string | null {
  const origin = req.headers.get("Origin");
  if (!origin) return null;
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

function corsHeaders(origin: string | null): HeadersInit {
  // If origin is null we still include CORS: * is intentionally NOT used
  // (we want browsers to reject from unknown origins). For non-browser
  // tooling Origin is absent and CORS is irrelevant anyway.
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin":  origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary":                         "Origin",
  };
}

function jsonResponse(
  body: unknown,
  init: ResponseInit & { origin?: string | null } = {}
): Response {
  const { origin = null, ...rest } = init;
  return new Response(JSON.stringify(body), {
    ...rest,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
      ...(rest.headers || {}),
    },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ----- entry point ----------------------------------------------------
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = pickOrigin(req, env);
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (req.method === "POST" && url.pathname === "/subscribe") {
      return handleSubscribe(req, env, origin);
    }
    if (req.method === "GET" && url.pathname === "/healthz") {
      return jsonResponse({ ok: true }, { origin });
    }
    return jsonResponse(
      { success: false, reason: "Not found." },
      { status: 404, origin }
    );
  },
};

async function handleSubscribe(
  req: Request,
  env: Env,
  origin: string | null
): Promise<Response> {
  // Reject browser POSTs from origins not in the allowlist.
  if (req.headers.get("Origin") && !origin) {
    return jsonResponse(
      { success: false, reason: "Origin not allowed." },
      { status: 403, origin: null }
    );
  }

  // Body
  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(
      { success: false, reason: "Invalid JSON body." },
      { status: 400, origin }
    );
  }
  const email = typeof body.email === "string"
    ? body.email.trim().toLowerCase()
    : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return jsonResponse(
      { success: false, reason: "Invalid email." },
      { status: 400, origin }
    );
  }

  // Rate limit by IP hash (bucket = current UTC hour ts).
  const ip = req.headers.get("CF-Connecting-IP") || "0.0.0.0";
  const ipHash = (await sha256Hex(ip)).slice(0, 12);
  const bucket = Math.floor(Date.now() / 3_600_000);
  const rlKey = `rl:${ipHash}:${bucket}`;
  const limit = parseInt(env.RATE_LIMIT_PER_HOUR || "3", 10) || 3;

  const cur = parseInt((await env.SUBSCRIBERS.get(rlKey)) || "0", 10) || 0;
  if (cur >= limit) {
    return jsonResponse(
      { success: false, reason: "Rate limit reached. Try again in an hour." },
      { status: 429, origin }
    );
  }
  // Best-effort RL increment with TTL = 3700s (slightly > 1h so the bucket
  // boundary cleanly transitions).
  await env.SUBSCRIBERS.put(rlKey, String(cur + 1), { expirationTtl: 3700 });

  // Duplicate check
  const subKey = `sub:${email}`;
  const existing = await env.SUBSCRIBERS.get(subKey);
  if (existing) {
    return jsonResponse(
      { success: false, reason: "Already subscribed." },
      { status: 409, origin }
    );
  }

  // Persist
  const record = {
    email:     email,
    ts_iso:    new Date().toISOString(),
    ip_hash:   ipHash,
    ua:        (req.headers.get("User-Agent") || "").slice(0, 200),
    cf_country: req.cf && (req.cf as { country?: string }).country || "",
  };
  try {
    await env.SUBSCRIBERS.put(subKey, JSON.stringify(record));
  } catch (e) {
    return jsonResponse(
      { success: false, reason: "Storage error." },
      { status: 500, origin }
    );
  }

  return jsonResponse({ success: true }, { status: 200, origin });
}
