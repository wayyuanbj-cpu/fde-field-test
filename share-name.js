const ANONYMOUS_NAME = "匿名挑战者";

export function sanitizeShareName(value, fallback = ANONYMOUS_NAME) {
  const cleaned = String(value ?? "")
    .normalize("NFC")
    .replace(/\p{Cc}/gu, "")
    .trim();
  const limited = Array.from(cleaned).slice(0, 20).join("");
  return limited || fallback;
}

export function shareFilename(value, options = {}) {
  const fallback = options.fallback ?? ANONYMOUS_NAME;
  const safe = sanitizeShareName(value, fallback)
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/^\.+/, "")
    .trim() || fallback;
  return `${options.prefix ?? "FDE-三级挑战"}-${safe}.png`;
}
