import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client with no RLS enforcement. Use ONLY in trusted
 * server-side code that has already checked project membership itself —
 * specifically the Reel chat agent's MCP tool handlers (see
 * lib/agents/chat-agent.ts), which run outside a user's request-scoped
 * session cookie but must still only touch the project they were invoked
 * against. Never expose this client, or the service role key, to the
 * browser.
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
