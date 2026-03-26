export function normalizeContact(contact?: string | null) {
  const trimmed = contact?.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.includes("@")) {
    return trimmed.toLowerCase();
  }

  const sanitized = trimmed.replace(/[^\d+]/g, "");
  if (!sanitized) {
    return "";
  }

  let normalized = sanitized;
  if (normalized.startsWith("00")) {
    normalized = `+${normalized.slice(2)}`;
  }

  if (normalized.startsWith("+")) {
    normalized = `+${normalized.slice(1).replace(/\D/g, "")}`;
  } else {
    normalized = normalized.replace(/\D/g, "");
    const defaultCountry = (process.env.DEFAULT_PHONE_COUNTRY_CODE || "91").replace(/\D/g, "");
    if (normalized.length === 10 && defaultCountry) {
      normalized = `+${defaultCountry}${normalized}`;
    } else if (defaultCountry && normalized.startsWith(defaultCountry)) {
      normalized = `+${normalized}`;
    } else {
      normalized = `+${normalized}`;
    }
  }

  if (normalized.length < 8) {
    return "";
  }

  return normalized;
}
