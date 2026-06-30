import axios from 'axios';
import { ScrapedContent, AuditReport } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

interface KeyState {
  key: string;
  cooldownUntil: number;
}

const keyStates: KeyState[] = config.groq.apiKeys.map(key => ({ key, cooldownUntil: 0 }));
let nextKeyIndex = 0;

function getNextAvailableKey(): KeyState | null {
  const now = Date.now();
  for (let i = 0; i < keyStates.length; i++) {
    const idx = (nextKeyIndex + i) % keyStates.length;
    if (keyStates[idx].cooldownUntil <= now) {
      nextKeyIndex = (idx + 1) % keyStates.length;
      return keyStates[idx];
    }
  }
  return null;
}

function markCooldown(key: string, seconds: number) {
  const state = keyStates.find(k => k.key === key);
  if (state) {
    state.cooldownUntil = Date.now() + seconds * 1000;
  }
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

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

Respond with ONLY valid JSON matching this exact schema. No markdown, no explanation, no code fences:
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

async function callGroqWithKey(prompt: string, apiKey: string) {
  return axios.post(
    GROQ_URL,
    {
      model: config.groq.model,
      messages: [
        {
          role: 'system',
          content: 'You are a JSON-only API. You always respond with valid, parseable JSON and nothing else — no markdown formatting, no code fences, no explanation text before or after the JSON.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: config.groq.maxTokens,
      temperature: 0.3,
      top_p: 0.8,
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );
}

export async function analyzeWithGroq(content: ScrapedContent): Promise<AuditReport> {
  const prompt = buildPrompt(content);
  const totalKeys = keyStates.length;

  let lastError: unknown = null;

  for (let attempt = 0; attempt < totalKeys; attempt++) {
    const keyState = getNextAvailableKey();

    if (!keyState) {
      const soonest = Math.min(...keyStates.map(k => k.cooldownUntil));
      const waitMs = Math.max(0, soonest - Date.now());
      logger.warn(`All Groq keys cooling down — waiting ${Math.ceil(waitMs / 1000)}s`);
      await new Promise(r => setTimeout(r, waitMs + 500));
      continue;
    }

    try {
      logger.debug(`Calling Groq with key ending in ...${keyState.key.slice(-6)}`);
      const response = await callGroqWithKey(prompt, keyState.key);

      const rawText: string = response.data?.choices?.[0]?.message?.content || '';
      if (!rawText) throw new Error('Empty response from Groq API');

      const cleaned = rawText.replace(/```json\n?|```\n?/g, '').trim();

      let report: AuditReport;
      try {
        report = JSON.parse(cleaned) as AuditReport;
      } catch {
        logger.error('Failed to parse Groq JSON', { rawText: rawText.slice(0, 500) });
        throw new Error('AI returned invalid JSON — please retry');
      }

      const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
      report.seo_score = clamp(report.seo_score);
      report.conversion_score = clamp(report.conversion_score);
      report.trust_score = clamp(report.trust_score);
      report.copywriting_score = clamp(report.copywriting_score);
      report.overall_score = clamp(report.overall_score);

      logger.debug('Groq analysis complete', {
        keyUsed: `...${keyState.key.slice(-6)}`,
        seo: report.seo_score,
        conversion: report.conversion_score,
        trust: report.trust_score,
        copywriting: report.copywriting_score,
      });

      return report;

    } catch (err: any) {
      lastError = err;
      const status = err?.response?.status;

      if (status === 429) {
        logger.warn(`Groq key ...${keyState.key.slice(-6)} hit 429 — cooling down 65s`, { attempt });
        markCooldown(keyState.key, 65);
        continue;
      }

      if (status === 404 || status === 400) {
        logger.error(`Groq model "${config.groq.model}" error (${status})`, {
          detail: err?.response?.data,
        });
        throw new Error(`Groq request failed: ${err?.response?.data?.error?.message || 'check model name'}`);
      }

      if (status === 401) {
        logger.error(`Groq key ...${keyState.key.slice(-6)} is invalid (401)`);
        continue;
      }

      logger.warn(`Groq key ...${keyState.key.slice(-6)} failed`, { status, message: err.message });
    }
  }

  logger.error('All Groq API keys exhausted or failed', { totalKeys });
  throw new Error(
    lastError instanceof Error
      ? `AI analysis failed: ${lastError.message}`
      : 'AI analysis failed — all API keys are rate limited. Please try again shortly.'
  );
}