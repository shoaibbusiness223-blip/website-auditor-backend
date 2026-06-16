import axios from 'axios';
import * as cheerio from 'cheerio';
import { ScrapedContent, ImageMeta } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

export async function scrapeWebsite(url: string): Promise<ScrapedContent> {
  logger.debug(`Scraping: ${url}`);

  // ── Fetch HTML ─────────────────────────────────────────────────────────────
  const response = await axios.get(url, {
    timeout: config.scraper.timeoutMs,
    maxContentLength: config.scraper.maxResponseSizeBytes,
    headers: {
      'User-Agent': 'WebsiteGrowthAuditor/1.0 (+https://websitegrowthauditor.com/bot)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    // Follow redirects but limit depth
    maxRedirects: 5,
    validateStatus: (status) => status < 500,
  });

  const html = response.data as string;
  const $ = cheerio.load(html);

  // ── Extract data ───────────────────────────────────────────────────────────

  const title = $('title').first().text().trim();
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() || '';

  const h1Tags: string[] = [];
  $('h1').each((_, el) => {
    const text = $(el).text().trim();
    if (text) h1Tags.push(text);
  });

  const h2Tags: string[] = [];
  $('h2').each((_, el) => {
    const text = $(el).text().trim();
    if (text) h2Tags.push(text.slice(0, 200));
  });

  // ── CTA Buttons: collect button/a text that looks like calls to action ────
  const ctaPatterns = /^(get|try|start|sign up|buy|subscribe|download|learn|join|book|schedule|contact|request|claim|grab|access)/i;
  const ctaButtons: string[] = [];
  $('button, a[href], input[type="submit"], input[type="button"]').each((_, el) => {
    const text = ($(el).text() || $(el).attr('value') || '').trim();
    if (text && ctaPatterns.test(text) && !ctaButtons.includes(text)) {
      ctaButtons.push(text.slice(0, 100));
    }
  });

  // ── Internal links ────────────────────────────────────────────────────────
  const baseHost = new URL(url).hostname;
  const internalLinks: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    try {
      const resolved = new URL(href, url);
      if (resolved.hostname === baseHost && !internalLinks.includes(resolved.pathname)) {
        internalLinks.push(resolved.pathname);
      }
    } catch { /* skip invalid hrefs */ }
  });

  // ── Images ────────────────────────────────────────────────────────────────
  const images: ImageMeta[] = [];
  $('img').each((_, el) => {
    const src = $(el).attr('src') || '';
    const alt = $(el).attr('alt') || '';
    images.push({ src: src.slice(0, 500), alt, hasMissingAlt: !alt.trim() });
  });

  // ── Word count (visible text) ─────────────────────────────────────────────
  $('script, style, noscript').remove();
  const visibleText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = visibleText.split(' ').filter(Boolean).length;

  return {
    url,
    title,
    metaDescription,
    h1Tags,
    h2Tags: h2Tags.slice(0, 20),        // cap at 20 H2s
    ctaButtons: ctaButtons.slice(0, 10), // cap at 10 CTAs
    internalLinks: internalLinks.slice(0, 50),
    images: images.slice(0, 30),         // cap at 30 images
    wordCount,
    hasSSL: url.startsWith('https://'),
    loadStatus: response.status,
  };
}
