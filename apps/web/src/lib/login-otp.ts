import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function getOtpSalt(): string {
  return process.env.IRON_SESSION_PASSWORD ?? 'foody-dev-otp-salt';
}

export function normalizeCallbackUrl(input: string | null | undefined): string {
  if (!input) return '/home';
  if (!input.startsWith('/')) return '/home';
  if (input.startsWith('//')) return '/home';
  return input;
}

export function generateLoginCode(): string {
  return `${randomInt(0, 1_000_000)}`.padStart(6, '0');
}

export function hashLoginCode(email: string, code: string): string {
  return createHash('sha256')
    .update(`${email.trim().toLowerCase()}:${code}:${getOtpSalt()}`)
    .digest('hex');
}

export function verifyLoginCode(email: string, code: string, expectedHash: string): boolean {
  const received = Buffer.from(hashLoginCode(email, code), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

export function getOtpExpiryIso(): string {
  return new Date(Date.now() + OTP_TTL_MS).toISOString();
}

export function isOtpExpired(expiresAt: string): boolean {
  return Date.now() > new Date(expiresAt).getTime();
}

export function getOtpMaxAttempts(): number {
  return OTP_MAX_ATTEMPTS;
}

interface SendLoginCodeParams {
  email: string;
  code: string;
}

export async function sendLoginCodeEmail(params: SendLoginCodeParams): Promise<{ debugCode?: string }> {
  const { email, code } = params;
  console.info(`[auth] Login code for ${email}: ${code}`);
  return { debugCode: code };
}