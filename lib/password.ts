export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** Returns an error message for an unacceptable password, or null when it is fine. */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string") return "Password required";
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  return null;
}
