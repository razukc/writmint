# Writmint positioning reframe: the author-time gate

**Date:** 2026-06-26
**Status:** Design — approved in brainstorming, pending written-spec review
**Type:** Positioning / strategy reframe (no code changes)

## Problem

Writmint currently presents as an *issuance authority / governance runtime* built on five
co-equal pillars (feature manifest, capability enforcement, structured errors, replay,
approval + audit). The framing answers "validate, review, execute safely without trusting
the author" — but it does not stake a defensible claim, and it puts Writmint adjacent to
free runtime-governance tools (Microsoft Agent Governance Toolkit, Cisco MCP Scanner) that
own the runtime-enforcement territory.

Deep research (2026-06-26, 104 agents, 22 sources, 24/25 claims adversarially confirmed)
established where Writmint can stand that nothing else does:

- The market's agent-approval ritual has settled at two points: **runtime** (per-tool-invocation
  gates in Claude Code, the MCP spec, Microsoft's toolkit) and **downstream PR/merge review**
  of generated artifacts (Harness AI ships exactly this). **Nobody gates at author-time over
  the manifest itself.**
- Every adjacent tool stops one step short of agent-consumable remediation: MCPB's validator
  returns human-readable prose; `sync-agents-settings` emits structured JSON **but explicitly
  has no fixHint field**; MCP Inspector's strict validation is unbuilt (issue #1005, open,
  unassigned) and framed as human-readable CLI text.
- **The band Writmint targets — author-time + agent-consumable structured validation feedback
  with fixHints an agent self-corrects against before a human approves — is genuinely empty**
  among all surveyed products and standards.

The strategic decision (made in brainstorming): **own the author-time gate** (high-conviction
bet on a new ritual) rather than ride the existing PR-review ritual or reposition as a passive
standard. And **dogfood the behavioral premise as proof** rather than assume it.

## What this reframe is — and is not

This is a **positioning/narrative reframe**. It changes how Writmint is described and what
leads the story. It does **not** change any code:

- No changes to `errors.ts`, `approval.ts`, `capabilities.ts`, `replay.ts`, or the manifest
  schema.
- If the (separately specced) dogfood proof corpus later reveals the fixHint *API* needs
  ergonomic changes, that is a **separate spec triggered by evidence** — not this one.

## Core statement

**Writmint is the author-time gate where an AI agent makes its own capability manifest
approvable.**

The agent drafts a manifest; Writmint rejects it with deterministic machine-readable errors +
fixHints; the agent self-corrects against them in a loop; and *only a manifest that has passed
that loop reaches a human for approval.*

One-line version: **"Writmint is where AI agents fix their capability manifests before a human
ever sees them."**

## Pillar hierarchy under the reframe

The five pillars stop being a peer list. They split into the gate and the trust scaffolding
around it:

**Tier 1 — The gate (the headline; the band the market leaves empty):**
- **Structured errors** (`errors.ts` — `{code, where, expected, actual, fixHint}`) — promoted
  from pillar #3 to the protagonist. This is the differentiated claim.
- **Feature Manifest** (`feature-manifest.ts`) — the artifact the agent is making approvable.
  Sits beside the gate as necessary context.

**Tier 2 — What makes a passed manifest trustworthy (why a human can approve in one look):**
- **Approval lifecycle + audit** (`approval.ts`) — hash-bound approval turns "agent says it's
  clean" into "human signed these exact bytes." The *payoff* of the gate.
- **Capability model + enforcement** (`capabilities.ts`) — proves declared scope is actually
  enforced.
- **Replay** (`replay.ts`) — proves the approved manifest behaves deterministically.

**Narrative shift:** stop saying "5 pillars for safe execution." Start saying: "an agent fixes
its manifest against machine-readable rejections (Tier 1), and because the result is hash-bound,
enforced, and replayable (Tier 2), a human can approve it in one look." We deliberately do not
lead with Tier 2 — that is the territory Microsoft/Cisco own at runtime. We lead with the Tier 1
band they don't touch.

## Deliverables (in scope)

1. **Positioning statement document** — the canonical reference for the author-time-gate framing,
   the Tier-1/Tier-2 re-ranking, and the one-liner. Lives in the repo under `docs/`. Everything
   else points to it.

2. **README lede rewrite** — open on the gate, not a pillar peer list. The current lede
   ("Writmint is a verifier for capabilities an author can't author past… tells the agent
   exactly what to fix when it tries") already leans toward the reframe, so this is a
   **sharpening, not a teardown**: make the author-time-before-human-approval sequence explicit
   and move Tier 2 pillars below the fold as "trust scaffolding." Code blocks and the
   "Show, by failing" demo stay; only the top framing/order changes.

3. **Competitive band note** — a short doc distilled from the 2026-06-26 research, citing the
   empty-band finding and carrying the two honest caveats so positioning rests on cited evidence:
   - *Negative-existence scope:* "empty band" is scoped to the 8 surveyed products/standards
     (Anthropic MCPB, GitHub MCP server, amtiYo/agents, sync-agents-settings, Claude Agent SDK,
     Microsoft Agent Governance Toolkit, MCP Inspector, MCP spec) — not proof nothing exists
     anywhere.
   - *Cisco MCP Scanner unverified:* named in the prior market memo but did not surface with
     primary evidence; its output format is unconfirmed here.

## Out of scope (YAGNI guards)

- **Dogfood proof corpus** — extending pass 05b into a measured series (round-trips to
  convergence, codes-per-step, paste-verbatim check, skill on/off, with disconfirming outcomes
  named) is **deferred to its own brainstorm + spec.** It is measurement work with its own
  experimental design and does not belong in a positioning spec. This spec only *references* it
  as the planned proof of the behavioral premise.
- No changes to any source file or the manifest schema.
- No new product surface, dashboard, benchmark framework, or metrics pipeline.
- No customer-facing outreach material. Risks #3 (willingness-to-pay) and #4 (closed-loop
  self-correction at scale) need real customer conversations, which research cannot settle —
  that is a later front.

## The premise this reframe rests on (stated honestly)

The positioning leans on a behavioral claim that is **empirically untested in shipping products**:
that AI agents actually self-correct manifests in a closed loop against structured rejections at
scale. Evidence so far is one data point — dogfood pass 05b (a skill-*disabled* agent landed the
`network-dynamic` shape in 2 round-trips / 2 codes on rejections alone). The reframe is a
high-conviction bet that this generalizes; the (separate) dogfood corpus is how we test it. If
that corpus shows agents thrash, or converge only when the authoring *skill* is enabled (i.e. the
value is in prose guidance, not the structured contract), the positioning must be revisited.

## Success criteria

- A reader of the README's first screen understands Writmint as the place an agent fixes its
  manifest before human approval — without reading the pillar deep-dives.
- The positioning doc gives every external surface (README, future outreach, docs) one consistent
  framing to point at.
- The competitive note lets anyone challenge the "empty band" claim against cited sources and the
  named caveats, rather than taking it on assertion.

## References

- Deep research report, 2026-06-26 (run id `wf_ef6079ea-bdc`): authoring-workflow evidence,
  runtime-vs-author-time contrast, empty-band finding, caveats, open questions.
- Prior market reality-check, 2026-06-13 (memory `project_writmint_market_reality`): the four
  open risks; this reframe addresses #1 (who authors) and #2 (commoditization) and explicitly
  defers #3/#4 to customer conversations.
- Dogfood pass 05b (`fixtures/url-health-check-no-skill-rerun/`): the single existing data point
  for the behavioral premise.
