import { getPricingConfig } from "../config";
import type { Env } from "../types";

const encoder = new TextEncoder();

function toBase64Url(value: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof value === "string"
      ? encoder.encode(value)
      : value instanceof Uint8Array
        ? value
        : new Uint8Array(value);

  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function timingSafeEquals(left: Uint8Array, right: Uint8Array): Promise<boolean> {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }

  return diff === 0;
}

async function hashPassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations,
      salt,
    },
    material,
    256,
  );

  return new Uint8Array(derived);
}

export async function verifyAdminPassword(env: Env, username: string, password: string): Promise<boolean> {
  const config = getPricingConfig(env);

  if (!config.adminUsername || username !== config.adminUsername) {
    return false;
  }

  if (config.adminPasswordHash) {
    const [iterationsValue, saltValue, hashValue] = config.adminPasswordHash.split(":");
    const iterations = Number.parseInt(iterationsValue, 10);

    if (!iterations || !saltValue || !hashValue) {
      return false;
    }

    const derived = await hashPassword(password, fromBase64Url(saltValue), iterations);
    return timingSafeEquals(derived, fromBase64Url(hashValue));
  }

  if (config.adminPassword) {
    return config.adminPassword === password;
  }

  return false;
}

async function signPayload(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toBase64Url(signature);
}

export async function createSessionToken(env: Env, username: string): Promise<string> {
  const config = getPricingConfig(env);

  if (!config.sessionSecret) {
    throw new Error("SESSION_SECRET is not configured.");
  }

  const payload = JSON.stringify({
    username,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
  });
  const encodedPayload = toBase64Url(payload);
  const signature = await signPayload(config.sessionSecret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(env: Env, token: string): Promise<{ username: string } | null> {
  const config = getPricingConfig(env);

  if (!config.sessionSecret || !token.includes(".")) {
    return null;
  }

  const [encodedPayload, providedSignature] = token.split(".", 2);
  const expectedSignature = await signPayload(config.sessionSecret, encodedPayload);

  if (providedSignature !== expectedSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedPayload))) as {
      username: string;
      exp: number;
    };

    if (!payload.username || !payload.exp || payload.exp < Date.now()) {
      return null;
    }

    return { username: payload.username };
  } catch {
    return null;
  }
}

export async function requireAuthenticatedSession(request: Request, env: Env): Promise<{ username: string } | null> {
  const authorization = request.headers.get("authorization") ?? "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return verifySessionToken(env, authorization.slice("Bearer ".length).trim());
}
