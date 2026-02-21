import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'TAPN: Missing Supabase env vars (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).\n' +
    'Auth features will not work. See .env.example for setup.'
  );
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/*
  ──────────────────────────────────────────
  SUPABASE SETUP — Run this SQL in your Supabase SQL editor:
  ──────────────────────────────────────────

  create table profiles (
    id uuid references auth.users on delete cascade primary key,
    email text,
    full_name text,
    phone text,
    location text,
    linkedin_url text,
    portfolio_url text,
    current_title text,
    years_experience text,
    target_roles text[],
    target_industries text[],
    bio text,
    technical_skills text[],
    top_strengths text[],
    education_degree text,
    education_field text,
    education_school text,
    education_year text,
    work_authorization text,
    work_type_preference text,
    min_salary text,
    company_size text,
    must_have_criteria text[],
    deal_breaker_keywords text[],
    blacklisted_companies text[],
    available_hours text,
    timezone text,
    communication_style text,
    user_md_content text,
    onboarding_complete boolean default false,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  alter table profiles enable row level security;

  create policy "Users can view own profile"
    on profiles for select using (auth.uid() = id);

  create policy "Users can insert own profile"
    on profiles for insert with check (auth.uid() = id);

  create policy "Users can update own profile"
    on profiles for update using (auth.uid() = id);
*/
