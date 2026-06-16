import { isPrivate, isLoopback } from 'ip';
import { URL } from 'url';
import dns from 'dns/promises';

// ─── Block localhost variants ──────────────────────────────────────────────────
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  'metadata.google.internal', // GCP metadata
  '169.254.169.254',           // AWS/Azure metadata IP
]);

// ─── Block private/internal IP ranges via CIDR check ─────────────────────────
function isPrivateOrLoopback(ip: string): boolean {
  try {
    return isPrivate(ip) || isLoopback(ip);
  } catch {
    return true; // default block on parse failure
  }
}

export async function validateAndSanitizeUrl(rawUrl: string): Promise<{ safe: true; url: URL } | { safe: false; reason: string }> {
  // ── 1. Parse ──────────────────────────────────────────────────────────────
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: 'Invalid URL format' };
  }

  // ── 2. Protocol whitelist ────────────────────────────────────────────────
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { safe: false, reason: 'Only http/https URLs are allowed' };
  }

  // ── 3. Hostname blocklist ────────────────────────────────────────────────
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { safe: false, reason: 'URL hostname is blocked' };
  }

  // ── 4. Direct IP address check ───────────────────────────────────────────
  // If hostname looks like an IP, block private ranges immediately
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(hostname)) {
    if (isPrivateOrLoopback(hostname)) {
      return { safe: false, reason: 'Private or loopback IP addresses are not allowed' };
    }
  }

  // ── 5. DNS resolution check (prevents SSRF via DNS rebinding) ────────────
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const { address } of addresses) {
      if (isPrivateOrLoopback(address) || BLOCKED_HOSTNAMES.has(address)) {
        return { safe: false, reason: 'URL resolves to a private or blocked address' };
      }
    }
  } catch {
    return { safe: false, reason: 'Could not resolve hostname' };
  }

  return { safe: true, url: parsed };
}
