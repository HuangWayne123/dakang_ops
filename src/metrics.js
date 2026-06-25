const AI_REFERRER_PATTERNS = [
  { source: "doubao", pattern: /doubao\.com|doubao\.cn|volcengine\.com/i, type: "referral" },
  { source: "chatgpt", pattern: /chatgpt\.com|openai\.com/i, type: "referral" },
  { source: "perplexity", pattern: /perplexity\.ai/i, type: "referral" },
  { source: "metaso", pattern: /metaso\.cn/i, type: "referral" },
  { source: "baidu-ai", pattern: /wenxiaoyan|yiyan|baidu\.com/i, type: "referral" },
];

const AI_UA_PATTERNS = [
  { source: "gptbot", pattern: /gptbot/i, type: "crawler" },
  { source: "bytespider", pattern: /bytespider|bytedance/i, type: "crawler" },
  { source: "claudebot", pattern: /claudebot/i, type: "crawler" },
  { source: "perplexitybot", pattern: /perplexitybot/i, type: "crawler" },
  { source: "google-extended", pattern: /google-extended/i, type: "crawler" },
  { source: "ccbot", pattern: /ccbot/i, type: "crawler" },
];

const KNOWN_SITES = ["group", "food", "cognivora", "supplychain"];

function normalizeSite(site) {
  const normalized = String(site || "").trim().toLowerCase();
  return KNOWN_SITES.includes(normalized) ? normalized : "unknown";
}

function normalizePage(page) {
  if (!page) {
    return "/";
  }

  const value = String(page).trim();
  if (!value.startsWith("/")) {
    return `/${value}`;
  }
  return value || "/";
}

function normalizeEventName(eventName) {
  return String(eventName || "page_view").trim().toLowerCase();
}

export function detectAiSignal({ referer = "", userAgent = "" }) {
  for (const candidate of AI_REFERRER_PATTERNS) {
    if (candidate.pattern.test(referer)) {
      return {
        detected: true,
        source: candidate.source,
        type: candidate.type,
      };
    }
  }

  for (const candidate of AI_UA_PATTERNS) {
    if (candidate.pattern.test(userAgent)) {
      return {
        detected: true,
        source: candidate.source,
        type: candidate.type,
      };
    }
  }

  return {
    detected: false,
    source: null,
    type: null,
  };
}

export function normalizeEventPayload(payload, context) {
  const aiSignal = detectAiSignal({
    referer: context.referer,
    userAgent: context.userAgent,
  });

  return {
    occurredAt: context.occurredAt,
    site: normalizeSite(payload.site),
    page: normalizePage(payload.page),
    event: normalizeEventName(payload.event),
    sessionId: String(payload.sessionId || "anonymous"),
    ipHash: context.ipHash,
    userAgent: String(context.userAgent || ""),
    referer: String(context.referer || ""),
    durationMs: Number.isFinite(Number(payload.durationMs)) ? Number(payload.durationMs) : 0,
    aiSignal,
    meta: payload.meta && typeof payload.meta === "object" ? payload.meta : {},
  };
}

function createEmptySiteSummary() {
  return {
    pageViews: 0,
    uniqueVisitors: 0,
    aiVisits: 0,
    faqOpens: 0,
    contactClicks: 0,
    averageDwellSeconds: 0,
    dwellSamples: 0,
    agentAuditHits: 0,
    agentAuditTotal: 0,
    agentHitRate: 0,
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

export function buildSummary({ events, audits, days, now }) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);

  const recentEvents = events.filter((event) => new Date(event.occurredAt) >= cutoff);
  const recentAudits = audits.filter((audit) => new Date(audit.occurredAt) >= cutoff);

  const siteSummaries = Object.fromEntries(KNOWN_SITES.map((site) => [site, createEmptySiteSummary()]));
  const siteVisitors = Object.fromEntries(KNOWN_SITES.map((site) => [site, new Set()]));
  const topPagesMap = new Map();
  const faqMap = new Map();
  const promptMap = new Map();
  const trendMap = new Map();
  let pageViews = 0;
  let aiVisits = 0;
  const visitors = new Set();

  for (const event of recentEvents) {
    const site = siteSummaries[event.site] ? event.site : "unknown";
    if (!siteSummaries[site]) {
      siteSummaries[site] = createEmptySiteSummary();
      siteVisitors[site] = new Set();
    }

    visitors.add(event.ipHash || event.sessionId);
    siteVisitors[site].add(event.ipHash || event.sessionId);

    const dateKey = String(event.occurredAt).slice(0, 10);
    const trend = trendMap.get(dateKey) || { date: dateKey, pageViews: 0, aiVisits: 0, contactClicks: 0 };

    if (event.event === "page_view") {
      pageViews += 1;
      siteSummaries[site].pageViews += 1;
      trend.pageViews += 1;
      const pageKey = `${site}:${event.page}`;
      topPagesMap.set(pageKey, (topPagesMap.get(pageKey) || 0) + 1);
    }

    if (event.aiSignal?.detected) {
      aiVisits += 1;
      siteSummaries[site].aiVisits += 1;
      trend.aiVisits += 1;
    }

    if (event.event === "faq_open") {
      siteSummaries[site].faqOpens += 1;
      const faqKey = `${site}:${event.meta?.question || "未命名问题"}`;
      faqMap.set(faqKey, (faqMap.get(faqKey) || 0) + 1);
    }

    if (event.event === "contact_click") {
      siteSummaries[site].contactClicks += 1;
      trend.contactClicks += 1;
    }

    if (event.event === "page_exit" && event.durationMs > 0) {
      siteSummaries[site].averageDwellSeconds += event.durationMs / 1000;
      siteSummaries[site].dwellSamples += 1;
    }

    trendMap.set(dateKey, trend);
  }

  for (const audit of recentAudits) {
    const site = siteSummaries[audit.site] ? audit.site : "unknown";
    if (!siteSummaries[site]) {
      siteSummaries[site] = createEmptySiteSummary();
      siteVisitors[site] = new Set();
    }

    siteSummaries[site].agentAuditTotal += 1;
    if (audit.matched) {
      siteSummaries[site].agentAuditHits += 1;
    }

    const promptKey = `${site}:${audit.prompt}`;
    const promptEntry = promptMap.get(promptKey) || {
      site,
      prompt: audit.prompt,
      hits: 0,
      total: 0,
      engines: new Set(),
      landingPage: audit.landingPage || "",
    };
    promptEntry.total += 1;
    if (audit.matched) {
      promptEntry.hits += 1;
    }
    promptEntry.engines.add(audit.engine);
    if (!promptEntry.landingPage && audit.landingPage) {
      promptEntry.landingPage = audit.landingPage;
    }
    promptMap.set(promptKey, promptEntry);
  }

  for (const site of Object.keys(siteSummaries)) {
    siteSummaries[site].uniqueVisitors = siteVisitors[site]?.size || 0;
    siteSummaries[site].averageDwellSeconds = siteSummaries[site].dwellSamples
      ? round(siteSummaries[site].averageDwellSeconds / siteSummaries[site].dwellSamples)
      : 0;
    siteSummaries[site].agentHitRate = siteSummaries[site].agentAuditTotal
      ? round((siteSummaries[site].agentAuditHits / siteSummaries[site].agentAuditTotal) * 100)
      : 0;
  }

  const agentAuditHits = recentAudits.filter((audit) => audit.matched).length;
  const agentAuditTotal = recentAudits.length;

  return {
    overview: {
      pageViews,
      uniqueVisitors: visitors.size,
      aiVisits,
      agentAuditHits,
      agentAuditTotal,
      agentHitRate: agentAuditTotal ? round((agentAuditHits / agentAuditTotal) * 100) : 0,
    },
    sites: siteSummaries,
    topPages: Array.from(topPagesMap.entries())
      .map(([key, count]) => {
        const [site, page] = key.split(":");
        return { site, page, count };
      })
      .sort((left, right) => right.count - left.count)
      .slice(0, 10),
    faqHighlights: Array.from(faqMap.entries())
      .map(([key, opens]) => {
        const [site, question] = key.split(":");
        return { site, question, opens };
      })
      .sort((left, right) => right.opens - left.opens)
      .slice(0, 10),
    keywordPrompts: Array.from(promptMap.values())
      .map((entry) => ({
        site: entry.site,
        prompt: entry.prompt,
        hits: entry.hits,
        total: entry.total,
        hitRate: entry.total ? round((entry.hits / entry.total) * 100) : 0,
        engines: Array.from(entry.engines).sort(),
        landingPage: entry.landingPage,
      }))
      .sort((left, right) => right.total - left.total)
      .slice(0, 12),
    trend: Array.from(trendMap.values()).sort((left, right) => left.date.localeCompare(right.date)),
  };
}
