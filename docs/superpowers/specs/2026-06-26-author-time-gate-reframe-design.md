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

**Writmint is an author-time verification layer for AI-generated capability manifests.**

An AI agent declares what a capability may do — the hosts it reaches, the data it touches, the
actions it takes. Writmint rejects any manifest that is underspecified, overscoped, or unsafe,
returning deterministic, machine-readable errors the agent corrects against on its own. By the
time a manifest reaches a human, approval is a **sign-off on verified work, not a search for the
agent's mistakes.**

**Supporting sentence (the competitive contrast, made defensible):**

> Most agent platforms catch manifest mistakes at runtime, when the capability tries to act, or
> downstream, when a human reads the generated artifact at review. Both cast the human as the
> agent's debugger. Writmint moves the correction earlier and makes it deterministic — and keeps
> the human as the approver, where regulated environments require them.

**Compressed one-liner (for tight contexts):**

> Author-time verification for AI-generated capability manifests — so human approval is a
> sign-off, not a cleanup.

### Why this register, and why the human stays in the loop

The earlier draft's "before a human ever sees them" was wrong: in the settled PR-review ritual,
humans *do* see the manifest. The real difference is not *whether* a human sees it but *what state
it is in when they do* — raw agent output (today) vs. a machine-verified artifact (Writmint). The
framing keeps the human in the loop and repositions their job: **debugger → approver.**

This is not a hedge. In regulated environments — bank, healthcare, insurance, Writmint's anchor
scenario — **segregation of duties requires the approver not be the author.** A human approval gate
is mandatory there, so "the human still approves" is compliance alignment, not weakness. The honest
framing and the enterprise-credible framing are the same framing.

Two deliberate language choices for the enterprise buyer:
- Lead with the **category** ("author-time verification"), the term a security team will file us
  under — not a metaphor. "Gate" describes the place; "verification layer" names the category.
- Replace casual verbs ("fix its manifest") with precise ones ("corrects against deterministic,
  machine-readable errors") that name the differentiator.

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

**Narrative shift:** stop saying "5 pillars for safe execution." Start saying: "an agent corrects
its manifest against machine-readable verification (Tier 1), and because the result is hash-bound,
enforced, and replayable (Tier 2), a human can approve it in one look." We deliberately do not
lead with Tier 2 — that is the territory Microsoft/Cisco own at runtime. We lead with the Tier 1
band they don't touch.

## Deliverables (in scope)

1. **Positioning statement document** — the canonical reference for the author-time-gate framing,
   the Tier-1/Tier-2 re-ranking, and the one-liner. Lives in the repo under `docs/`. Everything
   else points to it.

2. **README teardown (bold)** — replace the top of the README so it opens on the category
   (author-time verification) and the debugger→approver repositioning, in enterprise register.
   The "Show, by failing" four-beat demo is retained as the proof-by-demonstration centerpiece
   (it already *is* the gate in action), but the framing around it is rewritten, and the
   "five pillars" peer list is restructured into the Tier-1/Tier-2 split. Drafted prose below.

### Proposed new README lede (draft for review)

> # Writmint
>
> **Author-time verification for AI-generated capability manifests.**
>
> When an AI agent builds a capability, it must declare what that capability may do — the hosts it
> reaches, the data it touches, the actions it takes. Writmint verifies that declaration *as the
> agent writes it*: every underspecified, overscoped, or unsafe manifest is rejected with a
> deterministic, machine-readable error the agent corrects against on its own, before any human is
> involved.
>
> The result changes what human approval *is*. Most agent platforms surface manifest mistakes at
> runtime — when the capability tries to act — or downstream, when a reviewer reads the generated
> artifact in a pull request. Both cast the human as the agent's debugger. Writmint moves the
> correction earlier and makes it deterministic, so the human stays the **approver**: they sign off
> on verified work, not hunt for what the agent got wrong.
>
> In regulated environments — banking, healthcare, insurance — that human approval gate is
> mandatory: segregation of duties requires that the approver is not the author. Writmint is built
> for exactly that boundary. The agent authors and self-corrects; the human approves a manifest
> that has already been verified and is cryptographically bound to what they signed.
>
> > **Status: v0.5.x — early.** The API surface is stable enough for the demo below, not yet stable
> > enough to depend on. Issues and feedback welcome.

The "Show, by failing" section then follows largely as-is (it demonstrates the exact loop the new
lede describes — declare → reject with structured error → correct → approve → run), with one
framing edit to its closing line so it ties back to "verification, then approval" rather than to
the old five-pillar summary.

### Proposed restructure of "The five pillars" → "The gate, and what makes it trustworthy"

Replace the flat `## The five pillars` peer list with two tiered subsections that match the spec's
hierarchy. The per-pillar technical content (the existing prose under each numbered pillar) is
preserved verbatim — only the grouping, ordering, and section headers change:

> ## How it works
>
> ### The gate: verification an agent corrects against
>
> *(leads with structured errors as the protagonist, then the manifest as the artifact being
> verified)*
> - **Structured errors — every failure has a fix-hint** *(was pillar 3; now first)*
> - **The capability manifest — the declarative contract** *(was pillar 1; now second)*
>
> ### What makes a verified manifest trustworthy
>
> *(the Tier-2 scaffolding — why a human can approve quickly, and why the approval means something)*
> - **Approval — hash-bound, lifecycle-tracked, audited** *(was pillar 5)*
> - **Permissions — the broker boundary** *(was pillar 2)*
> - **Replay — every execution is reproducible** *(was pillar 4)*

A short transition sentence opens the second subsection, e.g.: *"Verification gets the manifest
correct. These three make a correct manifest worth approving: the approval is bound to the exact
bytes, the declared scope is actually enforced at runtime, and every run can be replayed to prove
what happened."*

**Teardown boundary (what we do NOT touch):** the "Show, by failing" code beats, the per-pillar
deep-dive prose, the canonical-demo section, and all source links stay intact. "Bold" here means
the *lede and section architecture* are rebuilt; the technical body is re-grouped, not rewritten.
This keeps the README accurate to the code while changing what a first-screen reader takes away.

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

## Honesty as a positioning principle (not just a disclaimer)

Writmint's target customer is one who values honesty and transparency — a security/compliance buyer
who has been burned by tools that overclaim. We therefore treat candor as a **deliberate
positioning choice**, not an obligation to bury in fine print:

- The status banner stays ("v0.5.x — early; not yet stable enough to depend on"). We do not dress
  pre-stable software as production-ready.
- The "empty band" claim is always stated with its scope: it is a negative-existence finding over
  the products we actually surveyed, not a proof that nothing exists anywhere.
- The behavioral premise (below) is stated plainly wherever the positioning leans on it, including
  in external materials — not just in internal specs.

This is a feature for the buyer we want: a vendor who tells you what is *not* yet proven is one you
can trust about what is. Whatever the state is, it is — and we say so first.

## The premise this reframe rests on (stated plainly)

The positioning leans on a behavioral claim that is **empirically untested in shipping products**:
that AI agents actually self-correct manifests in a closed loop against structured rejections at
scale. Evidence so far is one data point — dogfood pass 05b (a skill-*disabled* agent landed the
`network-dynamic` shape in 2 round-trips / 2 codes on rejections alone). The reframe is a
high-conviction bet that this generalizes; the (separate) dogfood corpus is how we test it. If
that corpus shows agents thrash, or converge only when the authoring *skill* is enabled (i.e. the
value is in prose guidance, not the structured contract), the positioning must be revisited — and
we will say so rather than quietly drop the claim.

## Success criteria

- A reader of the README's first screen understands Writmint as author-time verification that an
  agent corrects against, leaving the human as approver rather than debugger — without reading the
  pillar deep-dives.
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
