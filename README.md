# Reel

An AI-native film pre-production platform. Upload a script and get, within
minutes, a scene breakdown, a projected cast & crew list, and a first-pass
budget with every line priced from live web research and cited sources —
navigable through a project dashboard and a chat agent that proposes
changes you approve before anything commits.

This is the MVP scaffold: script-to-budget, trustworthy and sourced, before
anything else. See the engineering brief this was built from for full
scope and non-goals.

## Stack

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind v4
- **Backend/data**: Supabase (Postgres + Auth + Storage)
- **Agents**: `@anthropic-ai/sdk` for one-shot structured extraction
  (breakdown agent); `@anthropic-ai/claude-agent-sdk` for the budgeting
  agent (`WebSearch` tool) and the Reel chat agent (in-process MCP server,
  session resume/fork, `canUseTool` approval gate)

## Setup

1. **Supabase**: create a project, then run `supabase/migrations/0001_init.sql`
   against it (SQL editor, or `supabase db push` if you link the CLI). It
   creates every table, RLS policy, and the private `scripts` storage
   bucket.
2. **Env**: copy `.env.example` to `.env.local` and fill in your Supabase
   URL/keys (Settings → API) and `ANTHROPIC_API_KEY`.
3. **Install & run**:
   ```
   npm install
   npm run dev
   ```

### A note on where this needs to run

The budgeting and chat agents run through `@anthropic-ai/claude-agent-sdk`,
which shells out to the Claude Code CLI binary and persists session state
to local disk (that's what makes `resume`/`fork` work). That means:

- Run Reel on a **long-lived Node server** (a VM, a container, `next start`
  behind a process manager), not a short-timeout serverless platform — the
  upload pipeline (extraction → breakdown → per-line web-search pricing)
  takes real minutes, and a cold, ephemeral serverless function can't host
  the SDK's session store anyway.
- **Single-instance only, for now.** Session resume reads local disk, so
  if you ever run more than one app instance, pin each project's chat to
  the instance that created its session (sticky routing by `project_id`),
  or this breaks. Fine for an MVP; revisit before scaling horizontally.

## Design decisions worth knowing about

- **Approval flow is "deny + record," not "hold open."** The Reel chat
  agent's write tools (`propose_budget_change`, `propose_schedule_change`,
  `propose_crew_change`) are never auto-approved, per the brief — but
  rather than have `canUseTool` block on an unresolved promise until a
  producer clicks Approve (which would hang the HTTP request indefinitely),
  `canUseTool` denies the call immediately *and* writes a `pending_changes`
  row in the same breath. The agent's turn completes normally; the pending
  change renders as an `ApprovalCard`; approval is a separate request
  (`POST /api/projects/[id]/chat/resolve`) that performs the actual
  Postgres write and logs to `change_log` for the first time. Net effect
  for the producer is identical to the brief's spec — nothing commits
  until they approve — just implemented so it's safe to run over plain
  HTTP request/response instead of a long-held connection.
- **Breakdown agent uses the plain Anthropic SDK, not the Agent SDK.**
  Structured scene extraction doesn't need WebSearch, session memory, or
  tool approval — a single forced tool-call for JSON output is simpler and
  more reliable. The Agent SDK is reserved for budgeting (needs
  `WebSearch`) and chat (needs resume/fork/`canUseTool`), per the brief.
- **`chat_messages` table isn't in the brief's data model** but was added
  because the SDK's own session transcript lives in its local store, not
  something this app can cheaply query for re-rendering history on page
  load. `chat_sessions.agent_session_id` is still the source of truth for
  the agent's own working memory (what `resume` loads); `chat_messages` is
  purely a display cache.
- **Next 16's Cache Components model is turned off** (`next.config.ts`).
  Reel is a dashboard where nearly every route is user-specific
  (cookie-based auth), so the default static/cacheable model would need
  Suspense or `"use cache"` boundaries on every single page for no benefit
  here. Revisit if parts of the app become genuinely cacheable.
- **System font stack, not a build-time Google Fonts fetch.** `next/font/google`
  needs network access to fonts.googleapis.com at build time, which some
  sandboxed/managed-network build environments block outright. Reel instead
  declares `--font-sans: "Inter", -apple-system, "SF Pro Text", "Segoe UI", …`
  — Inter if the user has it installed, a native system font otherwise. Add
  `next/font/google` back (or a self-hosted font file) once you've confirmed
  your build environment can reach Google Fonts, or don't bother — the
  fallback stack already satisfies the design system's "Inter/SF Pro" intent.

## What's deliberately thin for v1

- **Movie Magic export**: only flat CSV export is implemented
  (`GET /api/projects/[id]/export/csv`). Movie Magic Budgeting's
  JSON/XML-Basic interchange format is real work to get right and is
  explicitly "if time allows" in the brief — not started.
- **Script encryption at rest**: scripts land in a *private* Supabase
  Storage bucket scoped by RLS to project members, which is real access
  control, but that's bucket-level privacy, not field-level encryption.
  Supabase encrypts storage at rest by default at the infrastructure
  layer; if you need customer-managed keys or app-level encryption on top,
  that's unbuilt.
- **Rate card numbers** (`lib/agents/rate-card.ts`) are rough
  industry-typical placeholders for an MVP, not real comps. They're the
  fallback when web search can't confirm a price (always marked
  `low_confidence`) — replace with real numbers before trusting them in a
  financing conversation.
- **Schedule view** drag-and-drop uses native HTML5 DnD (no library) and
  only supports moving a whole scene card between days — no in-day
  reordering yet.

## Project structure

```
src/
  app/                     Routes (App Router)
    projects/[id]/         Workspace: script, cast-crew, budget, schedule, chat
    api/projects/[id]/     Upload, export, chat, chat/resolve, schedule/move
  components/
    reel/                  The Reel design system component kit
    layout/                Shared chrome (top nav, workspace tabs)
  lib/
    agents/                breakdown.ts, budgeting.ts, chat-agent.ts, apply-change.ts, rate-card.ts
    overheads/             schema.ts (Zod) — set/camera/actor/shot, shared by DB, agent tools, renderer
    scripts/extract.ts     PDF (pdf-parse) + Final Draft XML (.fdx) extraction
    scripts/line-numbers.ts  Scene line-range detection, backfills scenes.line_start/line_end
    supabase/              client/server/service/middleware + hand-written types
supabase/migrations/       0001_init.sql, 0002_overhead_shots.sql
scripts/backfill-scene-lines.ts  One-off: re-derive line_start/line_end for scenes that predate 0002
```

## Overhead Shots

An AI-native blocking workspace layered onto an existing scene: the
blocking agent drafts top-down camera diagrams shot by shot, the producer
browses with arrow keys while later shots keep streaming in, and refines
by chat or by hand. Built from `design/overheads/` (handoff, tokens,
components, sample scene, screen mockups) and the stack/data-safety rules
already established by this codebase (README above, `0001_init.sql`,
`lib/agents/chat-agent.ts`'s deny-and-persist approval pattern) — no
separate `engineering-brief.md`/`reel-mvp-scaffold-notes.md` file existed
in this repo to build from, so those rules serve as the de facto brief.

### Progress

Built in the order the brief specifies, stopping after each step:

- [x] **Step 1 — schema, migration, fixture.** `lib/overheads/schema.ts`
  (Zod: Set/Camera/Actor/Shot + the full scene-fixture shape), migration
  `0002_overhead_shots.sql` (`sets`, `shots`, `overhead_versions`,
  `overhead_corrections`, `chat_sessions.kind`, `scenes.line_start/line_end`),
  and `design/overheads/sample-scene.json` validated byte-for-byte against
  the schema in `lib/overheads/schema.test.ts`. `npx tsc --noEmit`,
  `npm run build`, `npm run lint`, `npm test` all clean.
- [ ] Step 2 — geometry and validators, with tests
- [ ] Step 3 — renderer and read-only viewer with keyboard navigation
- [ ] Step 4 — blocking agent with streaming
- [ ] Step 5 — edit mode, versions, corrections
- [ ] Step 6 — coverage, setup estimate, schedule-impact approval
- [ ] Step 7 — print view

### Producer decisions (open questions resolved 2026-10-13)

The design handoff's four open questions were resolved by the producer
before any rendering code was written:

1. **FOV cone length** — adds `focusDistanceFt` (optional) to `Camera` in
   `lib/overheads/schema.ts`. When set, `FovCone` draws to the actual
   subject distance instead of the fixed ~5ft schematic length from
   `components.md`.
2. **Arrow keys at the scene's first/last shot (12A/12F)** — clamp (the
   handoff's own stated default); no wrap into an adjacent scene's shots.
3. **Character colors reading the same gray in black-and-white print** —
   acceptable as-is; identity stays carried by the initial letter only,
   consistent with the design's stated intent elsewhere (`tokens.md`).
4. **All-setups mode with many setups** — cap and fade by shot order
   beyond ~10–12 setups, consistent with the existing ghosted/onion-skin
   treatment already defined for non-active setups. No manual pinning.

### Design gaps

Filled in with the closest consistent option where the design package
didn't specify, rather than inventing new visual language:

- **`shotSize` vocabulary.** `sample-scene.json` only uses five values
  (`wide`, `medium_wide`, `medium`, `close_up`, `insert`). Since the shot
  strip treats this as a closed-vocabulary pill (`components.md`'s "one
  fixed vocabulary" note), `lib/overheads/schema.ts`'s `ShotSizeSchema`
  extends it with standard industry sizes (`extreme_wide`,
  `medium_close_up`, `extreme_close_up`, `two_shot`, `over_the_shoulder`)
  so the blocking agent isn't limited to five sizes on a real scene.
- **`height`/`support` are free text, not enums.** `components.md` only
  specifies that they render as plain pill labels ("Eye", "Sticks") with
  no fixed vocabulary or per-value styling, unlike `shotSize` — so the
  schema validates them as non-empty strings rather than guessing a closed
  list (e.g. whether "gimbal" or "handheld" should exist alongside
  "sticks"/"dolly"/"crane").
- Several screens referenced by `DESIGN_HANDOFF.md`'s file index
  (`edit-mode-1440.html`, `validation-1440.html`, `approval-1440.html`,
  `version-history-1440.html`, `print-scene-12.html`, `symbol-sheet.html`,
  `default-1024.html`) aren't present under `design/overheads/screens/` —
  only `default-1440`, `all-setups-1440`, `generating-1440`, and
  `empty-states-1440` exist. Those states are built straight from
  `components.md`'s state tables (every `CameraGlyph`/`FovCone` state is
  specified there even without a dedicated mockup); flagged here in case
  the missing mockups turn up and should be reconciled against what got
  built.

### Conflicts between design and brief

None found so far — the design package and the brief's product decisions
(three-layer model, coordinate system, FOV formula, draft-layer versioning,
streaming shots, approval-gated schedule impact) agree everywhere they
overlap.
