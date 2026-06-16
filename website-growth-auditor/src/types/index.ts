// ─── Scraper ──────────────────────────────────────────────────────────────────

export interface ScrapedContent {
  url: string;
  title: string;
  metaDescription: string;
  h1Tags: string[];
  h2Tags: string[];
  ctaButtons: string[];
  internalLinks: string[];
  images: ImageMeta[];
  wordCount: number;
  hasSSL: boolean;
  loadStatus: number;
}

export interface ImageMeta {
  src: string;
  alt: string;
  hasMissingAlt: boolean;
}

// ─── AI Report ────────────────────────────────────────────────────────────────

export interface AuditIssue {
  severity: 'critical' | 'warning' | 'info';
  category: 'seo' | 'conversion' | 'trust' | 'copywriting';
  title: string;
  description: string;
}

export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  category: 'seo' | 'conversion' | 'trust' | 'copywriting';
  title: string;
  detail: string;
  estimatedImpact: string;
}

export interface ActionPlanItem {
  day: string;
  task: string;
  category: 'seo' | 'conversion' | 'trust' | 'copywriting';
}

export interface AuditReport {
  seo_score: number;          // 0-100
  conversion_score: number;   // 0-100
  trust_score: number;        // 0-100
  copywriting_score: number;  // 0-100
  overall_score: number;      // weighted average
  issues: AuditIssue[];
  recommendations: Recommendation[];
  action_plan: ActionPlanItem[];
  summary: string;
}

// ─── Database Rows ─────────────────────────────────────────────────────────────

export interface AuditRow {
  id: string;
  user_id: string;
  website_url: string;
  seo_score: number;
  conversion_score: number;
  trust_score: number;
  copywriting_score: number;
  overall_score: number;
  report_json: AuditReport;
  scraped_data: ScrapedContent;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  created_at: string;
  updated_at: string;
}

// ─── API Responses ─────────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: string;
  code?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  created_at: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

// ─── Express augmentation ─────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
