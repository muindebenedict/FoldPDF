import type { SupabaseClient } from "@supabase/supabase-js";

// No hardcoded fallbacks. Vercel injects VITE_ variables at build time and they
// silently win over any default written here, so a fallback only ever hides a
// misconfiguration. If these are missing the app should say so plainly.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim();
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

let client: SupabaseClient | null = null;
let loading: Promise<SupabaseClient> | null = null;
let announceLoaded: (client: SupabaseClient) => void = () => {};
const loaded = new Promise<SupabaseClient>((resolve) => (announceLoaded = resolve));

// Resolves once something has called loadSupabase(), without loading it itself.
// Lets the session listener wait for the first sign-in instead of downloading
// the library on every visit.
export function whenSupabaseLoaded(): Promise<SupabaseClient> {
  return loaded;
}

// True when this browser holds a Supabase session (stored by the client under
// "sb-<project>-auth-token"), i.e. when the library is needed straight away.
export function hasStoredSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("sb-") && key.endsWith("-auth-token")) return true;
    }
  } catch {
    // Storage blocked: there can be no stored session either.
  }
  return false;
}

// The Supabase library is large (about 200 KB compressed), so it is downloaded only when
// sign-in or saving data needs it, instead of with every page. It is also never loaded
// during the prerender, where auth is never used.
export function loadSupabase(): Promise<SupabaseClient> {
  if (!isSupabaseConfigured) {
    return Promise.reject(
      new Error("Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.")
    );
  }
  if (client) return Promise.resolve(client);
  if (!loading) {
    loading = import("@supabase/supabase-js")
      .then(({ createClient }) => {
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
        announceLoaded(client);
        return client;
      })
      .catch((err) => {
        loading = null; // allow a retry after a network failure
        throw err;
      });
  }
  return loading;
}
