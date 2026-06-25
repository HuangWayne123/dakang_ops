import test from "node:test";
import assert from "node:assert/strict";

import {
  detectAiSignal,
  normalizeEventPayload,
  buildSummary,
} from "../src/metrics.js";
import {
  parseAllowedOrigins,
  resolveTrackAccessControlOrigin,
} from "../src/cors.js";

test("normalizeEventPayload marks AI referrals and required fields", () => {
  const payload = normalizeEventPayload(
    {
      site: "food",
      page: "/solutions",
      event: "page_view",
      sessionId: "session-1",
      durationMs: 1200,
      meta: { title: "达康食品解决方案" },
    },
    {
      ipHash: "hashed-ip",
      userAgent: "Mozilla/5.0",
      referer: "https://www.doubao.com/chat/?query=%E9%A3%9F%E6%9D%90%E4%BE%9B%E5%BA%94%E9%93%BE",
      occurredAt: "2026-06-25T10:00:00.000Z",
    },
  );

  assert.equal(payload.site, "food");
  assert.equal(payload.aiSignal.detected, true);
  assert.equal(payload.aiSignal.source, "doubao");
  assert.equal(payload.ipHash, "hashed-ip");
});

test("detectAiSignal picks bot traffic from user agent even without referrer", () => {
  const signal = detectAiSignal({
    referer: "",
    userAgent: "Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)",
  });

  assert.equal(signal.detected, true);
  assert.equal(signal.type, "crawler");
  assert.equal(signal.source, "gptbot");
});

test("buildSummary aggregates PV UV top pages and audit hit rate", () => {
  const summary = buildSummary({
    events: [
      {
        occurredAt: "2026-06-24T10:00:00.000Z",
        site: "food",
        page: "/",
        event: "page_view",
        sessionId: "s1",
        ipHash: "u1",
        durationMs: 0,
        aiSignal: { detected: false, source: null, type: null },
        meta: {},
      },
      {
        occurredAt: "2026-06-24T10:02:00.000Z",
        site: "food",
        page: "/solutions",
        event: "page_view",
        sessionId: "s1",
        ipHash: "u1",
        durationMs: 0,
        aiSignal: { detected: true, source: "doubao", type: "referral" },
        meta: {},
      },
      {
        occurredAt: "2026-06-24T10:03:00.000Z",
        site: "group",
        page: "/news/1",
        event: "page_view",
        sessionId: "s2",
        ipHash: "u2",
        durationMs: 0,
        aiSignal: { detected: false, source: null, type: null },
        meta: {},
      },
      {
        occurredAt: "2026-06-24T10:04:00.000Z",
        site: "food",
        page: "/faq",
        event: "faq_open",
        sessionId: "s1",
        ipHash: "u1",
        durationMs: 0,
        aiSignal: { detected: false, source: null, type: null },
        meta: { question: "企业客户如何采购达康食品的食材？" },
      },
      {
        occurredAt: "2026-06-24T10:05:00.000Z",
        site: "food",
        page: "/solutions",
        event: "contact_click",
        sessionId: "s1",
        ipHash: "u1",
        durationMs: 0,
        aiSignal: { detected: false, source: null, type: null },
        meta: { channel: "phone" },
      },
    ],
    audits: [
      {
        occurredAt: "2026-06-24T12:00:00.000Z",
        site: "food",
        engine: "doubao",
        prompt: "怎么选食材供应链服务商",
        matched: true,
        landingPage: "/solutions",
      },
      {
        occurredAt: "2026-06-24T12:30:00.000Z",
        site: "group",
        engine: "doubao",
        prompt: "食品产业链集团有哪些能力",
        matched: false,
        landingPage: "",
      },
    ],
    days: 30,
    now: "2026-06-25T00:00:00.000Z",
  });

  assert.equal(summary.overview.pageViews, 3);
  assert.equal(summary.overview.uniqueVisitors, 2);
  assert.equal(summary.overview.aiVisits, 1);
  assert.equal(summary.overview.agentAuditHits, 1);
  assert.equal(summary.overview.agentAuditTotal, 2);
  assert.equal(summary.overview.agentHitRate, 50);
  assert.equal(summary.sites.food.pageViews, 2);
  assert.equal(summary.sites.food.faqOpens, 1);
  assert.equal(summary.sites.food.contactClicks, 1);
  assert.equal(summary.topPages.some((item) => item.page === "/solutions" && item.site === "food"), true);
});

test("resolveTrackAccessControlOrigin allows localhost origins by default for local previews", () => {
  const allowedOrigin = resolveTrackAccessControlOrigin("http://127.0.0.1:3004", []);

  assert.equal(allowedOrigin, "http://127.0.0.1:3004");
});

test("resolveTrackAccessControlOrigin respects explicit allowlist in deployment", () => {
  const allowedOrigin = resolveTrackAccessControlOrigin(
    "https://www.gxdksp.com",
    parseAllowedOrigins("https://www.gxdksp.com,https://www.example.com"),
  );

  assert.equal(allowedOrigin, "https://www.gxdksp.com");
});

test("resolveTrackAccessControlOrigin blocks unknown cross-origin requests", () => {
  const allowedOrigin = resolveTrackAccessControlOrigin("https://malicious.example", []);

  assert.equal(allowedOrigin, null);
});
