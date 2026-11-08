import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Db } from "./db/index.ts";
import { getSetting, setSetting } from "./repo.ts";

export const COOKIE = "pinillalist";
/** Browsers cap cookie lifetimes at 400 days. */
export const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = scryptSync(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

export function setPassword(db: Db, password: string) {
  if (password.length < 8) throw new Error("Use at least 8 characters.");
  setSetting(db, "password_hash", hashPassword(password));
}

/** The secret that signs the login cookie, made on first use. */
export function cookieSecret(db: Db): string {
  let secret = getSetting(db, "cookie_secret");
  if (!secret) {
    secret = randomBytes(32).toString("base64");
    setSetting(db, "cookie_secret", secret);
  }
  return secret;
}

/**
 * The value stored in the login cookie. It changes when the password changes,
 * so setting a new password signs out every phone.
 */
export function sessionValue(db: Db): string | null {
  const hash = getSetting(db, "password_hash");
  if (!hash) return null;
  return "household." + createHash("sha256").update(hash).digest("base64url").slice(0, 16);
}

/** Counts failed logins per address and blocks an address after 10 failures in 15 minutes. */
export class LoginLimiter {
  private failures = new Map<string, number[]>();
  private limit: number;
  private windowMs: number;

  constructor(limit = 10, windowMs = 15 * 60 * 1000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  blocked(address: string, now = Date.now()): boolean {
    const recent = (this.failures.get(address) ?? []).filter((t) => now - t < this.windowMs);
    this.failures.set(address, recent);
    return recent.length >= this.limit;
  }

  fail(address: string, now = Date.now()) {
    this.failures.set(address, [...(this.failures.get(address) ?? []), now]);
  }

  reset(address: string) {
    this.failures.delete(address);
  }
}
