import axios from 'axios';
import { ScrapedContent, AuditReport } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

// ─── Gemini API endpoint (free tier uses gemini-1.5-flash) ────────────────────
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent`;

function buildPrompt(content: ScrapedContent): string {
  const imagesWithMissingAlt = content.images.filter(i => i.hasMissingAlt).length;

  return `You are a senior digital marketing and SEO expert. Analyze this website data and return a JSON audit report.

WEBSITE DATA:
URL: ${content.url}
SSL: ${content.hasSSL ? 'Yes (HTTPS)' : 'No (HTTP)'}
HTTP Status: ${content.loadStatus}
Title: "${content.title}"
Meta Description: "${content.metaDescription}"
H1 Tags: ${JSON.stringify(content.h1Tags)}
H2 Tags (first 10): ${JSON.stringify(content.h2Tags.slice(0, 10))}
CTA Buttons Found: ${JSON.stringify(content.ctaButtons)}
Word Count: ${content.wordCount}
Internal Links Count: ${content.internalLinks.length}
Total Images: ${content.images.length}
Images Missing Alt Text: ${imagesWithMissingAlt}

SCORING CRITERIA:
seo_score (0-100): title quality, meta description, H1/H2 structure, SSL, word count, alt tags
conversion_score (0-100): CTA presence/quality, value proposition clarity, content structure
trust_score (0-100): HTTPS, content depth, professional language, contact info signals
copywriting_score (0-100): headline quality, meta description copy, CTA text quality, H2 clarity

INSTRUCTIONS:
- Score each dimension 0-100 based on the data
- overall_score = weighted average: (seo*0.3 + conversion*0.3 + trust*0.2 + copywriting*0.2)
- issues: list 3-6 specific problems found, each with severity (critical/warning/info)
- recommendations: list 4-8 actionable fixes, prioritized (high/medium/low)
- action_plan: a 30-day plan with specific daily/weekly tasks
- summary: 2-3 sentence executive summary

Respond with ONLY valid JSON matching this exact schema. No markdown, no explanation:
{
  "seo_score": number,
  "conversion_score": number,
  "trust_score": number,
  "copywriting_score": number,
  "overall_score": number,
  "summary": "string",
  "issues": [
    {
      "severity": "critical|warning|info",
      "category": "seo|conversion|trust|copywriting",
      "title": "string",
      "description": "string"
    }
  ],
  "recommendations": [
    {
      "priority": "high|medium|low",
      "category": "seo|conversion|trust|copywriting",
      "title": "string",
      "detail": "string",
      "estimatedImpact": "string"
    }
  ],
  "action_plan": [
    {
      "day": "string",
      "task": "string",
      "category": "seo|conversion|trust|copywriting"
    }
  ]
}`;
}

export async function analyzeWithGemini(content: ScrapedContent): Promise<AuditReport> {
  logger.debug('Sending to Gemini for analysis');

  const response = await axios.post(
    GEMINI_URL,
    {
      contents: [{ parts: [{ text: buildPrompt(content) }] }],
      generationConfig: {
        maxOutputTokens: config.gemini.maxTokens,
        temperature: 0.3,  // Lower = more consistent, factual
        topP: 0.8,
      },
    },
    {
      params: { key: config.gemini.apiKey },
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    }
  );

  // ── Extract text from Gemini response ─────────────────────────────────────
  const candidate = response.data?.candidates?.[0];
  if (!candidate) {
    throw new Error('No response from Gemini API');
  }

  const rawText: string = candidate.content?.parts?.[0]?.text || '';
  if (!rawText) {
    throw new Error('Empty response from Gemini API');
  }

  // ── Parse JSON (strip any accidental markdown fences) ─────────────────────
  const cleaned = rawText.replace(/```json\n?|```\n?/g, '').trim();

  let report: AuditReport;
  try {
    report = JSON.parse(cleaned) as AuditReport;
  } catch {
    logger.error('Failed to parse Gemini JSON', { rawText: rawText.slice(0, 500) });
    throw new Error('AI returned invalid JSON — please retry');
  }

  // ── Validate score ranges ─────────────────────────────────────────────────
  const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
  report.seo_score = clamp(report.seo_score);
  report.conversion_score = clamp(report.conversion_score);
  report.trust_score = clamp(report.trust_score);
  report.copywriting_score = clamp(report.copywriting_score);
  report.overall_score = clamp(report.overall_score);

  logger.debug('Gemini analysis complete', {
    seo: report.seo_score,
    conversion: report.conversion_score,
    trust: report.trust_score,
    copywriting: report.copywriting_score,
  });

  return report;
}
