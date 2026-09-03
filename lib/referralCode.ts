import { randomInt } from "node:crypto";

const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const REFERRAL_CODE_LENGTH = 8;

/** 8-char upper-case alphanumeric code from a CSPRNG (36^8 ≈ 2.8e12 combinations). */
export function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += CODE_CHARS.charAt(randomInt(CODE_CHARS.length));
  }
  return code;
}
