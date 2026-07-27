"use strict";

const fs = require("fs");
const { chromium } = require("playwright");
const { canonicalUrl, classifySchedule, eventIdFromUrl, formatDate, isEventLanding, normalizeText, parseDateRange } = require("./upcoming-monitor-core");

const WEBHOOK_URL = process.env.UPCOMING_WEBHOOK_URL;
const WEBHOOK_TOKEN = process.env.UPCOMING_WEBHOOK_TOKEN;
const THRESHOLD_DAYS = Number(process.env.UPCOMING_DAYS || 7);
const REPORT_PATH = process.env.UPCOMING_REPORT_PATH || "upcoming-report.json";
if (!WEBHOOK_URL || !WEBHOOK_TOKEN) throw new Error("UPCOMING_WEBHOOK_URL and UPCOMING_WEBHOOK_TOKEN GitHub Secrets are required.");

async function webhook(action, payload = {}) {
  const response = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: WEBHOOK_TOKEN, action, ...payload }) });
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new Error(body.message || `Webhook failed: ${response.status}`);
  return body;
}

function contextOptions(device) {
  return String(device).toUpperCase().includes("MO")
    ? { viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true, locale: "ko-KR" }
    : { viewport: { width: 1440, height: 1000 }, locale: "ko-KR" };
}

async function extractBrandLinks(page) {
  return page.evaluate(() => {
    const seen = new Set();
    return [...document.querySelectorAll('a[href*="ader.naver.com"]')].map((anchor, index) => ({
      position: index + 1,
      area: anchor.closest("li") ? "brand-search-list" : "brand-search-area",
      text: (anchor.innerText || anchor.getAttribute("aria-label") || anchor.querySelector("img")?.alt || "image-link").replace(/\s+/g, " ").trim(),
      trackingUrl: anchor.href,
      y: anchor.getBoundingClientRect().top + window.scrollY
    })).filter(item => /[?&]c=(?:naver\.search\.(?:pc|mo)\.brand|mnaver\.search\.brand)(?:&|$)/i.test(item.trackingUrl))
      .filter(item => { const key = `${item.text}\n${item.trackingUrl}`; if (seen.has(key)) return false; seen.add(key); return true; });
  });
}

async function loadBenefitsScheduleIndex(browser, checkedAt) {
  const context = await browser.newContext(contextOptions("PC"));
  const page = await context.newPage();
  try {
    await page.goto("https://www.lge.co.kr/benefits", { waitUntil: "domcontentloaded", timeout: 30000 });
    const cards = await page.evaluate(() => [...document.querySelectorAll('a[href*="/benefits/exhibitions/detail-PE"]')].map(anchor => ({
      href: anchor.href,
      text: (anchor.innerText || anchor.textContent || "").replace(/\s+/g, " ").trim()
    })));
    return Object.fromEntries(cards.map(card => {
      const eventId = eventIdFromUrl(card.href);
      const range = parseDateRange(card.text, checkedAt);
      return eventId && range ? [eventId, range] : null;
    }).filter(Boolean));
  } finally {
    await context.close();
  }
}

async function inspectLanding(context, link, checkedAt, benefitsScheduleIndex) {
  const page = await context.newPage();
  try {
    await page.goto(link.trackingUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    const finalUrl = page.url();
    if (!isEventLanding({ finalUrl })) return null;
    const title = await page.title();
    const text = await page.locator("main, body").first().innerText({ timeout: 10000 }).catch(() => "");
    const eventId = eventIdFromUrl(finalUrl);
    // The benefits list is the canonical source for an event's published
    // period. It also covers permanent-looking detail pages whose body does
    // not display the period at all (for example first-subscription benefits).
    const range = benefitsScheduleIndex[eventId] || parseDateRange(text, checkedAt);
    const schedule = classifySchedule(range, checkedAt, THRESHOLD_DAYS);
    return { area: link.area, text: normalizeText(link.text), trackingUrl: link.trackingUrl, finalUrl, canonicalUrl: canonicalUrl(finalUrl), eventId, eventName: normalizeText(title), startDate: formatDate(range?.startDate), endDate: formatDate(range?.endDate), dateEvidence: range?.evidence || "", status: schedule.status, daysRemaining: schedule.daysRemaining };
  } finally { await page.close(); }
}

async function inspectTarget(browser, target, checkedAt, benefitsScheduleIndex) {
  const context = await browser.newContext(contextOptions(target.device));
  const page = await context.newPage();
  try {
    await page.goto(target.searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    const links = await extractBrandLinks(page);
    const events = [];
    for (const link of links) {
      const event = await inspectLanding(context, link, checkedAt, benefitsScheduleIndex).catch(error => ({ area: link.area, text: normalizeText(link.text), finalUrl: link.trackingUrl, canonicalUrl: link.trackingUrl, eventId: "", eventName: "CHECK_FAILED", startDate: "CHECK_FAILED", endDate: "CHECK_FAILED", status: "CHECK_FAILED", daysRemaining: null, detail: normalizeText(error.message) }));
      if (event) events.push(event);
    }
    const deduped = [...new Map(events.map(event => [event.eventId || event.canonicalUrl, event])).values()];
    return { rowNumber: target.rowNumber, item: target.item, device: target.device, searchUrl: target.searchUrl, checkedLinkCount: links.length, eventCount: deduped.length, upcomingCount: deduped.filter(event => /^D-\d+$/.test(event.status)).length, events: deduped };
  } finally { await context.close(); }
}

async function main() {
  const checkedAt = new Date();
  const { targets = [] } = await webhook("getUpcomingTargets");
  const browser = await chromium.launch({ headless: true });
  try {
    const benefitsScheduleIndex = await loadBenefitsScheduleIndex(browser, checkedAt).catch(error => {
      console.warn(`Benefits schedule index unavailable: ${error.message}`);
      return {};
    });
    const results = [];
    for (const target of targets) results.push(await inspectTarget(browser, target, checkedAt, benefitsScheduleIndex));
    const report = { checkedAt: checkedAt.toISOString(), thresholdDays: THRESHOLD_DAYS, results };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    await webhook("saveUpcomingResults", report);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
