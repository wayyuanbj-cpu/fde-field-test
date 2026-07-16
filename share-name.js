const ANONYMOUS_NAME = "匿名挑战者";

export function sanitizeShareName(value) {
  const cleaned = String(value ?? "")
    .normalize("NFC")
    .replace(/\p{Cc}/gu, "")
    .trim();
  const limited = Array.from(cleaned).slice(0, 20).join("");
  return limited || ANONYMOUS_NAME;
}

export function shareFilename(value) {
  const safe = sanitizeShareName(value)
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/^\.+/, "")
    .trim() || ANONYMOUS_NAME;
  return `FDE-三级挑战-${safe}.png`;
}
