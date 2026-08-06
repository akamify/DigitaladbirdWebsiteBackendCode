const PHONE_PATTERN = /^\+[1-9]\d{9,14}$/;

export const normalizePhone = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  const normalized = hasPlus ? `+${digits}` : digits.length === 10 ? `+91${digits}` : `+${digits}`;
  return PHONE_PATTERN.test(normalized) ? normalized : null;
};

export const maskPhone = (value) => {
  const normalized = normalizePhone(value);
  if (!normalized) {
    return "";
  }

  return `${normalized.slice(0, 3)}******${normalized.slice(-2)}`;
};
