import { SignJWT } from 'jose';
import { createHash } from 'node:crypto';

const JWT_SECRET = process.env.JWT_SECRET ?? 'fallback-dev-secret-change-in-production';

/**
 * Derive a deterministic UUID v5-ish from an email so the same user always
 * gets the same id across logins (no external auth provider needed).
 */
export function emailToUuid(email: string): string {
  const hash = createHash('sha1').update(email.trim().toLowerCase()).digest();
  // Set version (5) and variant (RFC 4122) bits
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return (
    hex.substring(0, 8) +
    '-' +
    hex.substring(8, 12) +
    '-' +
    hex.substring(12, 16) +
    '-' +
    hex.substring(16, 20) +
    '-' +
    hex.substring(20, 32)
  );
}

export interface JwtPayload {
  sub: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export async function signJWT(payload: JwtPayload): Promise<string> {
  const key = new TextEncoder().encode(JWT_SECRET);
  return new SignJWT({
    email: payload.email,
    name: payload.name,
    avatarUrl: payload.avatarUrl,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .setIssuer('foody-web-auth')
    .setAudience('foody-api')
    .sign(key);
}
