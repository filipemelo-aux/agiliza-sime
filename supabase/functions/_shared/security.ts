/**
 * Shared Security Middleware for Edge Functions
 *
 * Provides:
 * 1. Security headers (Helmet-equivalent)
 * 2. Rate limiting (DB-backed, distributed)
 * 3. Payload validation & size limits
 * 4. Data sanitization (XSS, injection prevention)
 * 5. Audit logging for security events
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Security Headers (Helmet-equivalent) ────────────────────

export const securityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
};

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Merge CORS + Security headers for responses */
export function getResponseHeaders(): Record<string, string> {
  return { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" };
}

export function secureJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: getResponseHeaders(),
  });
}

export function secureError(message: string, status = 400): Response {
  return secureJson({ success: false, error: message }, status);
}

// ─── Rate Limiting ───────────────────────────────────────────

export interface RateLimitConfig {
  windowSeconds: number;
  maxRequests: number;
  keyPrefix: string;
}

const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  "fiscal-service": { windowSeconds: 60, maxRequests: 30, keyPrefix: "fiscal" },
  "sefaz-proxy": { windowSeconds: 60, maxRequests: 20, keyPrefix: "sefaz" },
  "sign-fiscal-xml": { windowSeconds: 60, maxRequests: 15, keyPrefix: "sign" },
  "certificate-manager": { windowSeconds: 60, maxRequests: 10, keyPrefix: "cert" },
  default: { windowSeconds: 60, maxRequests: 30, keyPrefix: "default" },
};

export function getRateLimitConfig(functionName: string): RateLimitConfig {
  return DEFAULT_RATE_LIMITS[functionName] || DEFAULT_RATE_LIMITS.default;
}

/**
 * Check rate limit using DB-backed atomic counter.
 * Works across distributed instances.
 * Returns headers to include in response.
 */
export async function checkRateLimit(
  client: SupabaseClient,
  functionName: string,
  identifier: string // user_id or IP
): Promise<{
  allowed: boolean;
  headers: Record<string, string>;
}> {
  const config = getRateLimitConfig(functionName);
  const key = `${config.keyPrefix}:${identifier}`;

  try {
    const { data, error } = await client.rpc("check_rate_limit", {
      _key: key,
      _window_seconds: config.windowSeconds,
      _max_requests: config.maxRequests,
    });

    if (error || !data || data.length === 0) {
      // On error, allow request (fail-open to prevent blocking legitimate users)
      console.error("[Security] Rate limit check failed:", error?.message);
      return { allowed: true, headers: {} };
    }

    const result = data[0];
    const headers: Record<string, string> = {
      "X-RateLimit-Limit": String(config.maxRequests),
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": result.reset_at,
    };

    return { allowed: result.allowed, headers };
  } catch (e: any) {
    console.error("[Security] Rate limit error:", e.message);
    return { allowed: true, headers: {} };
  }
}

// ─── Payload Validation ──────────────────────────────────────

export interface ValidationRule {
  field: string;
  type: "string" | "number" | "boolean" | "uuid" | "array" | "object";
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CNPJ_PATTERN = /^\d{14}$/;
const SAFE_STRING_PATTERN = /^[^<>{}]*$/; // No HTML tags or template injection

/** Maximum payload size in bytes (1MB) */
const MAX_PAYLOAD_SIZE = 1_048_576;

export function validatePayloadSize(body: string): boolean {
  return new TextEncoder().encode(body).length <= MAX_PAYLOAD_SIZE;
}

export function validateField(value: unknown, rule: ValidationRule): string | null {
  if (value === undefined || value === null) {
    return rule.required ? `Campo '${rule.field}' é obrigatório` : null;
  }

  switch (rule.type) {
    case "string": {
      if (typeof value !== "string") return `Campo '${rule.field}' deve ser texto`;
      if (rule.maxLength && value.length > rule.maxLength)
        return `Campo '${rule.field}' excede ${rule.maxLength} caracteres`;
      if (rule.minLength && value.length < rule.minLength)
        return `Campo '${rule.field}' deve ter no mínimo ${rule.minLength} caracteres`;
      if (rule.pattern && !rule.pattern.test(value))
        return `Campo '${rule.field}' contém formato inválido`;
      break;
    }
    case "number": {
      if (typeof value !== "number" || isNaN(value))
        return `Campo '${rule.field}' deve ser numérico`;
      if (rule.min !== undefined && value < rule.min)
        return `Campo '${rule.field}' deve ser >= ${rule.min}`;
      if (rule.max !== undefined && value > rule.max)
        return `Campo '${rule.field}' deve ser <= ${rule.max}`;
      break;
    }
    case "boolean": {
      if (typeof value !== "boolean") return `Campo '${rule.field}' deve ser booleano`;
      break;
    }
    case "uuid": {
      if (typeof value !== "string" || !UUID_PATTERN.test(value))
        return `Campo '${rule.field}' deve ser um UUID válido`;
      break;
    }
    case "array": {
      if (!Array.isArray(value)) return `Campo '${rule.field}' deve ser um array`;
      break;
    }
    case "object": {
      if (typeof value !== "object" || Array.isArray(value))
        return `Campo '${rule.field}' deve ser um objeto`;
      break;
    }
  }
  return null;
}

export function validatePayload(
  body: Record<string, unknown>,
  rules: ValidationRule[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const rule of rules) {
    const error = validateField(body[rule.field], rule);
    if (error) errors.push(error);
  }
  return { valid: errors.length === 0, errors };
}

// ─── Pre-defined validation schemas ─────────────────────────

export const VALIDATION_SCHEMAS = {
  cte_emit: [
    { field: "cte_id", type: "uuid" as const, required: true },
  ],
  cte_cancel: [
    { field: "cte_id", type: "uuid" as const, required: true },
    { field: "justificativa", type: "string" as const, required: true, minLength: 15, maxLength: 255 },
  ],
  mdfe_emit: [
    { field: "mdfe_id", type: "uuid" as const, required: true },
  ],
  mdfe_encerrar: [
    { field: "mdfe_id", type: "uuid" as const, required: true },
  ],
  sefaz_proxy: [
    { field: "action", type: "string" as const, required: true, maxLength: 50, pattern: /^[a-z_]+$/ },
    { field: "document_id", type: "string" as const, required: false, maxLength: 100 },
    { field: "establishment_id", type: "uuid" as const, required: false },
    { field: "signed_xml", type: "string" as const, required: false, maxLength: 500_000 },
    { field: "chave_acesso", type: "string" as const, required: false, maxLength: 50, pattern: /^\d{0,44}$/ },
    { field: "justificativa", type: "string" as const, required: false, minLength: 15, maxLength: 255 },
  ],
  sign_xml: [
    { field: "xml", type: "string" as const, required: true, maxLength: 500_000 },
    { field: "document_type", type: "string" as const, required: true, maxLength: 10, pattern: /^(cte|mdfe)$/ },
    { field: "document_id", type: "string" as const, required: true, maxLength: 100 },
    { field: "establishment_id", type: "uuid" as const, required: false },
  ],
};

// ─── Data Sanitization ───────────────────────────────────────

/** Remove potential XSS/injection characters from string */
export function sanitizeString(value: string): string {
  return value
    .replace(/[<>]/g, "") // Strip HTML tags
    .replace(/javascript:/gi, "") // Strip JS protocol
    .replace(/on\w+\s*=/gi, "") // Strip event handlers
    .replace(/\x00/g, "") // Strip null bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, "") // Strip control chars
    .trim();
}

/** Deep sanitize an object — recursively clean all string values */
export function sanitizePayload<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    // Sanitize keys too
    const cleanKey = sanitizeString(key);
    if (typeof value === "string") {
      result[cleanKey] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      result[cleanKey] = value.map((item) =>
        typeof item === "string"
          ? sanitizeString(item)
          : typeof item === "object" && item !== null
          ? sanitizePayload(item as Record<string, unknown>)
          : item
      );
    } else if (typeof value === "object" && value !== null) {
      result[cleanKey] = sanitizePayload(value as Record<string, unknown>);
    } else {
      result[cleanKey] = value;
    }
  }
  return result as T;
}

/** Validate that XML doesn't contain XXE attacks */
export function sanitizeXml(xml: string): string {
  // Block XXE (XML External Entity) attacks
  const xxePatterns = [
    /<!ENTITY/gi,
    /<!DOCTYPE[^>]*\[/gi,
    /SYSTEM\s+["']/gi,
    /PUBLIC\s+["']/gi,
  ];
  let clean = xml;
  for (const pattern of xxePatterns) {
    if (pattern.test(clean)) {
      throw new Error("XML contém entidades externas não permitidas (XXE bloqueado)");
    }
  }
  // Strip null bytes
  clean = clean.replace(/\x00/g, "");
  return clean;
}

// ─── Security Audit ──────────────────────────────────────────

export async function logSecurityEvent(
  client: SupabaseClient,
  event: {
    event_type: string;
    source_ip?: string;
    user_id?: string;
    function_name: string;
    details?: Record<string, unknown>;
  }
) {
  try {
    await client.from("security_audit_log").insert({
      event_type: event.event_type,
      source_ip: event.source_ip || null,
      user_id: event.user_id || null,
      function_name: event.function_name,
      details: event.details || null,
    });
  } catch (e: any) {
    console.error("[Security] Audit log error:", e.message);
  }
}

// ─── Request Processing Helper ───────────────────────────────

export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Full security middleware pipeline.
 * Call at the start of every edge function handler.
 */
export async function securityMiddleware(
  req: Request,
  functionName: string,
  options: {
    validateSchema?: ValidationRule[];
    maxBodySize?: number;
    skipRateLimit?: boolean;
  } = {}
): Promise<{
  ok: boolean;
  body?: Record<string, unknown>;
  response?: Response;
  client: SupabaseClient;
  userId?: string;
  clientIp: string;
}> {
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const clientIp = getClientIp(req);

  // 1. Rate limit check
  if (!options.skipRateLimit) {
    // Extract user identifier from auth header or fall back to IP
    let identifier = clientIp;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const anonClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const token = authHeader.replace("Bearer ", "");
      try {
        const { data } = await anonClient.auth.getClaims(token);
        if (data?.claims?.sub) {
          identifier = data.claims.sub as string;
        }
      } catch {
        // Use IP as fallback
      }
    }

    const rateResult = await checkRateLimit(client, functionName, identifier);
    if (!rateResult.allowed) {
      await logSecurityEvent(client, {
        event_type: "rate_limit_exceeded",
        source_ip: clientIp,
        user_id: identifier !== clientIp ? identifier : undefined,
        function_name: functionName,
        details: { headers: rateResult.headers },
      });

      return {
        ok: false,
        response: new Response(
          JSON.stringify({ success: false, error: "Rate limit excedido. Tente novamente em breve." }),
          {
            status: 429,
            headers: { ...getResponseHeaders(), ...rateResult.headers },
          }
        ),
        client,
        clientIp,
      };
    }
  }

  // 2. Parse and validate body
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    let rawBody: string;
    try {
      rawBody = await req.text();
    } catch {
      return {
        ok: false,
        response: secureError("Corpo da requisição inválido", 400),
        client,
        clientIp,
      };
    }

    // Size check
    const maxSize = options.maxBodySize || MAX_PAYLOAD_SIZE;
    if (!validatePayloadSize(rawBody) || new TextEncoder().encode(rawBody).length > maxSize) {
      await logSecurityEvent(client, {
        event_type: "payload_too_large",
        source_ip: clientIp,
        function_name: functionName,
        details: { size: rawBody.length },
      });
      return {
        ok: false,
        response: secureError("Payload excede o tamanho máximo permitido", 413),
        client,
        clientIp,
      };
    }

    // Parse JSON
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        throw new Error("Body must be an object");
      }
    } catch {
      return {
        ok: false,
        response: secureError("JSON inválido no corpo da requisição", 400),
        client,
        clientIp,
      };
    }

    // Sanitize
    body = sanitizePayload(body);

    // Validate schema
    if (options.validateSchema) {
      const validation = validatePayload(body, options.validateSchema);
      if (!validation.valid) {
        await logSecurityEvent(client, {
          event_type: "validation_failed",
          source_ip: clientIp,
          function_name: functionName,
          details: { errors: validation.errors },
        });
        return {
          ok: false,
          response: secureError(validation.errors.join("; "), 422),
          client,
          clientIp,
        };
      }
    }

    return { ok: true, body, client, clientIp };
  }

  return { ok: true, client, clientIp };
}
