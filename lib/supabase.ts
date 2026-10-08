import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!_supabase) {
      // On the server, use the service-role key (bypasses RLS) so locked-down
      // tables stay accessible to API routes. In the browser this env var is
      // undefined (not NEXT_PUBLIC), so it falls back to the anon key and any
      // RLS-protected table is correctly off-limits to the public.
      const key =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      _supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (_supabase as any)[prop as string];
  },
});

export type Employee = {
  id: string;
  name: string;
  pin: string;
  avatar_color: string;
  created_at: string;
};

export type Account = {
  id: string;
  employee_id: string;
  angle: number;
  platform: string;
  username: string;
  login_email: string;
  login_method: string;
  app: string;
  device: string;
  status: string;
  notes: string;
  telegram_chat_id: string | null;
  created_at: string;
};

export type ContentGeneration = {
  id: string;
  account_id: string;
  employee_id: string;
  date: string;
  title: string;
  caption: string;
  created_at: string;
};

export type DailyMetric = {
  id: string;
  account_id: string;
  date: string;
  // TikTok
  followers: number;
  following: number;
  total_likes: number;
  posts: number;
  // Lemon8
  lm8_followers: number;
  lm8_following: number;
  lm8_total_likes: number;
  lm8_posts: number;
  created_at: string;
};
