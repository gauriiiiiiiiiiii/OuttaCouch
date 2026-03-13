export function normalizeContact(contact?: string | null) {
  const trimmed = contact?.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.includes("@") ? trimmed.toLowerCase() : trimmed;
}
