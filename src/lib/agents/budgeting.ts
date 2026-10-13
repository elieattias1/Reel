import { query } from "@anthropic-ai/claude-agent-sdk";
import { RATE_CARD } from "@/lib/agents/rate-card";
import { createServiceClient } from "@/lib/supabase/service";
import type { BudgetLineRow, Confidence, SourceType } from "@/lib/supabase/types";

export interface BudgetLineRequest {
  category: string;
  description: string;
  rate_card_key?: string;
  quantity?: number;
}

interface PricedLine {
  amount: number;
  source_type: SourceType;
  source_url: string | null;
  confidence: Confidence;
}

/** How long a cached price for the same query is considered fresh. */
const CACHE_WINDOW_MS = 1000 * 60 * 60 * 24; // 24h — pricing research doesn't need to be more real-time than that.

/**
 * Prices a single budget line with Claude via the Agent SDK's built-in
 * WebSearch tool, cross-checked against the seeded rate card, with a cache
 * so the same query within the cache window doesn't trigger a second paid
 * search. Falls back to the rate card (marked low_confidence) if search
 * can't find a confident number — never guesses silently.
 */
export async function priceBudgetLine(req: BudgetLineRequest): Promise<PricedLine> {
  const cacheKey = normalizeQueryKey(req.description);
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const rateCardFallback = req.rate_card_key ? RATE_CARD[req.rate_card_key] : undefined;

  let priced: PricedLine | null = null;

  try {
    priced = await searchPrice(req.description, req.quantity ?? 1);
  } catch (err) {
    console.error(`[budgeting] WebSearch failed for "${req.description}":`, err);
  }

  if (!priced) {
    if (!rateCardFallback) {
      // No search result and nothing to fall back to — this line needs a
      // human. Surface it as low_confidence at $0 rather than inventing a
      // number.
      priced = { amount: 0, source_type: "rate_card", source_url: null, confidence: "low_confidence" };
    } else {
      priced = {
        amount: rateCardFallback.amount * (req.quantity ?? 1),
        source_type: "rate_card",
        source_url: null,
        confidence: "low_confidence",
      };
    }
  }

  await setCached(cacheKey, priced);
  return priced;
}

async function searchPrice(description: string, quantity: number): Promise<PricedLine | null> {
  const prompt = `Find a current, real U.S. market price for this film-production budget line: "${description}" (quantity/days: ${quantity}). Search the web for a real source — a rental house, union rate card, vendor listing, or industry rate guide. Respond with ONLY one line of JSON at the very end of your reply, no markdown fences, in exactly this shape: {"amount": <total USD number for the full quantity>, "source_url": "<url>", "confidence": "confirmed"|"estimated"}. Use "confirmed" only if the source directly quotes this price; otherwise "estimated".`;

  let finalText = "";

  for await (const message of query({
    prompt,
    options: {
      allowedTools: ["WebSearch"],
      maxTurns: 4,
      model: process.env.REEL_BUDGETING_MODEL || "claude-sonnet-4-5",
    },
  })) {
    const m = message as { type: string; subtype?: string; result?: string };
    if (m.type === "result" && m.subtype === "success" && typeof m.result === "string") {
      finalText = m.result;
    }
  }

  const match = finalText.match(/\{[^{}]*"amount"[^{}]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as { amount: number; source_url: string; confidence: "confirmed" | "estimated" };
    if (typeof parsed.amount !== "number" || !Number.isFinite(parsed.amount) || parsed.amount <= 0) return null;
    return {
      amount: parsed.amount,
      source_type: "web_search",
      source_url: parsed.source_url ?? null,
      confidence: parsed.confidence === "confirmed" ? "confirmed" : "estimated",
    };
  } catch {
    return null;
  }
}

function normalizeQueryKey(description: string) {
  return description.trim().toLowerCase().replace(/\s+/g, " ");
}

async function getCached(key: string): Promise<PricedLine | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("price_cache").select("*").eq("query_key", key).maybeSingle();
  if (!data) return null;
  if (Date.now() - new Date(data.fetched_at).getTime() > CACHE_WINDOW_MS) return null;
  return {
    amount: data.amount,
    source_type: data.source_type,
    source_url: data.source_url,
    confidence: data.confidence,
  };
}

async function setCached(key: string, priced: PricedLine) {
  const supabase = createServiceClient();
  await supabase.from("price_cache").upsert({
    query_key: key,
    amount: priced.amount,
    source_type: priced.source_type,
    source_url: priced.source_url,
    confidence: priced.confidence,
    fetched_at: new Date().toISOString(),
  });
}

/** Prices every line for a project's budget request list and inserts the rows. */
export async function runBudgetingAgent(
  projectId: string,
  requests: BudgetLineRequest[]
): Promise<BudgetLineRow[]> {
  const supabase = createServiceClient();
  const rows: Omit<BudgetLineRow, "id" | "created_at" | "updated_at">[] = [];

  for (const req of requests) {
    const priced = await priceBudgetLine(req);
    rows.push({
      project_id: projectId,
      category: req.category,
      description: req.description,
      amount: priced.amount,
      source_type: priced.source_type,
      source_url: priced.source_url,
      source_fetched_at: new Date().toISOString(),
      confidence: priced.confidence,
      original_amount: null,
      original_source_type: null,
    });
  }

  const { data, error } = await supabase.from("budget_lines").insert(rows).select();
  if (error) throw error;
  return data as BudgetLineRow[];
}

/** Builds the list of budget lines to price from a project's breakdown + projected crew/cast. */
export function buildBudgetRequests(input: {
  locations: string[];
  crew: { role_type: string; headcount: number }[];
  shootDays: number;
  castCount: number;
}): BudgetLineRequest[] {
  const requests: BudgetLineRequest[] = [];

  for (const loc of input.locations) {
    requests.push({
      category: "Locations",
      description: `Location rental, ${input.shootDays} day(s): ${loc}`,
      rate_card_key: "Generic interior location rental",
      quantity: input.shootDays,
    });
  }

  for (const c of input.crew) {
    requests.push({
      category: "Crew",
      description: `${c.role_type} day rate x ${c.headcount} x ${input.shootDays} day(s)`,
      rate_card_key: `${c.role_type} day rate`,
      quantity: c.headcount * input.shootDays,
    });
  }

  requests.push({
    category: "Equipment",
    description: `Camera package rental, ${Math.ceil(input.shootDays / 7)} week(s)`,
    rate_card_key: "Camera package rental",
    quantity: Math.ceil(input.shootDays / 7),
  });
  requests.push({
    category: "Equipment",
    description: `Lighting package rental, ${Math.ceil(input.shootDays / 7)} week(s)`,
    rate_card_key: "Lighting package rental",
    quantity: Math.ceil(input.shootDays / 7),
  });
  requests.push({
    category: "Catering",
    description: `Catering, ${input.castCount + input.crew.reduce((n, c) => n + c.headcount, 0)} people x ${input.shootDays} day(s)`,
    rate_card_key: "Catering",
    quantity: (input.castCount + input.crew.reduce((n, c) => n + c.headcount, 0)) * input.shootDays,
  });
  requests.push({
    category: "Insurance",
    description: "Production insurance (general liability + equipment)",
    rate_card_key: "Production insurance",
    quantity: 1,
  });

  return requests;
}
