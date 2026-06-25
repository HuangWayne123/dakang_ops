import crypto from "node:crypto";
import path from "node:path";
import express from "express";

import { parseAllowedOrigins, resolveTrackAccessControlOrigin } from "./cors.js";
import { buildSummary, normalizeEventPayload } from "./metrics.js";
import { appendAgentAudit, appendEvent, getAgentAudits, getEvents } from "./storage.js";

const app = express();
const PORT = Number(process.env.PORT || 3200);
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN || "dakang-internal";
const HASH_SALT = process.env.HASH_SALT || "dakang-ops";
const TRACK_ALLOWED_ORIGINS = parseAllowedOrigins(process.env.TRACK_ALLOWED_ORIGINS || "");

app.use(express.json({ limit: "200kb" }));
app.use("/dashboard-assets", express.static(path.resolve(process.cwd(), "public")));

function hashIp(ipAddress) {
  return crypto.createHash("sha256").update(`${HASH_SALT}:${ipAddress || "unknown"}`).digest("hex");
}

function requireDashboardToken(req, res, next) {
  const token = req.query.token || req.get("x-dashboard-token");
  if (token !== DASHBOARD_TOKEN) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

function applyTrackCors(req, res, next) {
  const allowedOrigin = resolveTrackAccessControlOrigin(req.get("origin") || "", TRACK_ALLOWED_ORIGINS);
  if (allowedOrigin) {
    res.set("Access-Control-Allow-Origin", allowedOrigin);
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Vary", "Origin");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.options("/api/track", applyTrackCors);

app.post("/api/track", applyTrackCors, async (req, res) => {
  const occurredAt = new Date().toISOString();
  const record = normalizeEventPayload(req.body || {}, {
    occurredAt,
    ipHash: hashIp(req.ip),
    userAgent: req.get("user-agent") || "",
    referer: req.get("referer") || "",
  });

  await appendEvent(record);
  res.status(202).json({ ok: true, acceptedAt: occurredAt, aiSignal: record.aiSignal });
});

app.post("/api/agent-audit", requireDashboardToken, async (req, res) => {
  const payload = req.body || {};
  const record = {
    occurredAt: payload.occurredAt || new Date().toISOString(),
    site: String(payload.site || "unknown").trim().toLowerCase(),
    engine: String(payload.engine || "manual").trim().toLowerCase(),
    prompt: String(payload.prompt || "").trim(),
    matched: Boolean(payload.matched),
    landingPage: String(payload.landingPage || "").trim(),
    note: String(payload.note || "").trim(),
  };

  await appendAgentAudit(record);
  res.status(201).json({ ok: true });
});

app.get("/api/summary", requireDashboardToken, async (req, res) => {
  const days = Number(req.query.days || 30);
  const [events, audits] = await Promise.all([getEvents(), getAgentAudits()]);
  res.json(
    buildSummary({
      events,
      audits,
      days: Number.isFinite(days) && days > 0 ? days : 30,
      now: new Date().toISOString(),
    }),
  );
});

app.get("/dashboard", requireDashboardToken, (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "public/dashboard.html"));
});

app.listen(PORT, () => {
  console.log(`dakang-ops listening on http://0.0.0.0:${PORT}`);
});
