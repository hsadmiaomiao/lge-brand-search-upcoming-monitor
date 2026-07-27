"use strict";

function normalizeText(value) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value || "").trim();
  }
}

function eventIdFromUrl(value) {
  const url = String(value || "");
  const peId = url.match(/detail-(PE\d+)/i)?.[1]?.toUpperCase();
  if (peId) return peId;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "bestshop.lge.co.kr") {
      const slug = parsed.pathname.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "_").toUpperCase();
      return slug ? `BESTSHOP_${slug}` : "BESTSHOP_EVENT";
    }
  } catch {}
  return "";
}

function isBestshopEventLanding({ finalUrl, pageText = "", listedInEventIndex = false }) {
  try {
    const url = new URL(finalUrl);
    return url.hostname === "bestshop.lge.co.kr" && (listedInEventIndex || /\uC774\uBCA4\uD2B8\s*\uAE30\uAC04/.test(normalizeText(pageText)));
  } catch {
    return false;
  }
}

function isEventLanding({ finalUrl, pageText = "", listedInEventIndex = false }) {
  return /\/benefits\/exhibitions\/detail-PE\d+/i.test(String(finalUrl || "")) || isBestshopEventLanding({ finalUrl, pageText, listedInEventIndex });
}

function dateUtc(year, month, day) {
  const value = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return Number.isNaN(value.getTime()) ? null : value;
}

function parseDateRange(text, checkedAt = new Date()) {
  const source = normalizeText(text).replace(/\([\uC77C\uC6D4\uD654\uC218\uBAA9\uAE08\uD1A0]\)/g, "");
  const full = source.match(/(20\d{2})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})\s*(?:~|\uFF5E|-|to)\s*(20\d{2})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/i);
  if (full) return { startDate: dateUtc(full[1], full[2], full[3]), endDate: dateUtc(full[4], full[5], full[6]), evidence: full[0] };
  const short = source.match(/(\d{1,2})[.\-/]\s*(\d{1,2})\s*(?:~|\uFF5E|-|to)\s*(\d{1,2})[.\-/]\s*(\d{1,2})/i);
  if (!short) return null;
  const year = checkedAt.getUTCFullYear();
  const endYear = Number(short[3]) < Number(short[1]) ? year + 1 : year;
  return { startDate: dateUtc(year, short[1], short[2]), endDate: dateUtc(endYear, short[3], short[4]), evidence: short[0] };
}

function formatDate(date) {
  return date ? date.toISOString().slice(0, 10) : "NO_SCHEDULE";
}

function classifySchedule(range, checkedAt = new Date(), thresholdDays = 7) {
  if (!range?.endDate) return { status: "NO_SCHEDULE", daysRemaining: null };
  const today = Date.UTC(checkedAt.getUTCFullYear(), checkedAt.getUTCMonth(), checkedAt.getUTCDate());
  const daysRemaining = Math.ceil((range.endDate.getTime() - today) / 86400000);
  if (daysRemaining < 0) return { status: "EXPIRED", daysRemaining };
  if (daysRemaining <= thresholdDays) return { status: `D-${daysRemaining}`, daysRemaining };
  return { status: "NORMAL", daysRemaining };
}

module.exports = { canonicalUrl, classifySchedule, eventIdFromUrl, formatDate, isBestshopEventLanding, isEventLanding, normalizeText, parseDateRange };
