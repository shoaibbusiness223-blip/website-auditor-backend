-- ============================================================
-- Website Growth Auditor — Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension (already enabled by default in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── USERS ────────────────────────────────────────────────────────────────────
-- Supabase Auth manages auth.users automatically.
-- This public.users table stores app-level profile data.

CREATE TABLE IF NOT EXISTS public.users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL UNIQUE,
  full_name   TEXT,
  plan        TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  audit_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── AUDITS ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audits (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  website_url      TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  -- Scores (null until completed)
  seo_score        SMALLINT CHECK (seo_score BETWEEN 0 AND 100),
  conversion_score SMALLINT CHECK (conversion_score BETWEEN 0 AND 100),
  trust_score      SMALLINT CHECK (trust_score BETWEEN 0 AND 100),
  copywriting_score SMALLINT CHECK (copywriting_score BETWEEN 0 AND 100),
  overall_score    SMALLINT CHECK (overall_score BETWEEN 0 AND 100),

  -- Full JSON blobs
  report_json      JSONB,
  scraped_data     JSONB,

  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS audits_user_id_idx ON public.audits(user_id);
CREATE INDEX IF NOT EXISTS audits_status_idx ON public.audits(status);
CREATE INDEX IF NOT EXISTS audits_created_at_idx ON public.audits(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audits_updated_at
  BEFORE UPDATE ON public.audits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── ROW LEVEL SECURITY ────────────────────────────────────────────────────────
-- Users can only read/write their own data

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- Audits table policies
CREATE POLICY "Users can view own audits"
  ON public.audits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own audits"
  ON public.audits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Note: Updates/deletes to audits go through service role only (backend)
