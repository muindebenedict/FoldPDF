import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// No hardcoded fallbacks. Vercel injects VITE_ variables at build time and they
// silently win over any default written here, so a fallback only ever hides a
// misconfiguration. If these are missing the app should say so plainly.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim();
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

let client: SupabaseClient | null = null;

// Created lazily rather than at import time: the prerender step imports App.tsx
// in Node, where auth is never used, and createClient throws on a missing URL.
// Every real call happens in a browser effect or event handler.
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY."
    );
  }
  if (!client) {
    client = createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
      auth: {
        // Implicit, not PKCE. A PKCE link can only be completed in the browser
        // that asked for it, so a password reset requested on a laptop and
        // opened on a phone would silently fail. Implicit links carry the
        // session in the URL fragment and work on any device. Fragments are
        // never sent to servers or in Referer headers, and the library clears
        // them from the address bar as soon as it reads them.
        flowType: "implicit",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return client;
}
