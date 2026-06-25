const LOCAL_PREVIEW_ORIGIN_PATTERN = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i;

export function parseAllowedOrigins(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function resolveTrackAccessControlOrigin(origin, allowedOrigins = []) {
  const normalizedOrigin = String(origin || "").trim();
  if (!normalizedOrigin) {
    return null;
  }

  if (allowedOrigins.includes("*")) {
    return "*";
  }

  if (allowedOrigins.includes(normalizedOrigin)) {
    return normalizedOrigin;
  }

  if (allowedOrigins.length === 0) {
    if (normalizedOrigin === "null") {
      return "null";
    }

    if (LOCAL_PREVIEW_ORIGIN_PATTERN.test(normalizedOrigin)) {
      return normalizedOrigin;
    }
  }

  return null;
}
