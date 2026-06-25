import { buildSummary } from "./metrics.js";

export function buildSummaryResponse({ events, audits, days, now }) {
  return buildSummary({
    events,
    audits,
    days,
    now,
  });
}
