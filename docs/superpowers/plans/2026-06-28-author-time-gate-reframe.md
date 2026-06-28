# Author-Time Gate Positioning Reframe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe Writmint's public positioning from a five-pillar governance runtime to author-time verification of AI-generated capability manifests, across three documents (positioning statement, competitive-band note, README teardown) — no code changes.

**Architecture:** Pure documentation work. Create two new docs under `docs/`, then rewrite the top of `README.md` to point at them and restructure its "five pillars" section into a Tier-1 (the gate) / Tier-2 (trust scaffolding) split. The canonical copy already exists verbatim in the design spec; this plan transcribes and wires it. "Verification" is a per-task consistency check against the spec, not a unit test — there is no executable code, so no `npm test` cycle applies to the deliverables (though the repo's existing tests must still pass untouched, since we change zero source files).

**Tech Stack:** Markdown only. Git for commits. No build, no test framework changes.

## Global Constraints

Copied verbatim from the spec (`docs/superpowers/specs/2026-06-26-author-time-gate-reframe-design.md`). Every task implicitly includes these:

- **No code changes.** Do not touch `src/`, `tests/`, `fixtures/`, or the manifest schema. If any deliverable seems to need a code change, stop and flag it — that is a separate, evidence-triggered spec.
- **Locked headline (Option A), verb's subject is Writmint:** *"Verifies every capability manifest your AI agents write, then hands you a clean one to approve."*
- **Tone rules:** (1) Open on Writmint's verb (Writmint as implied subject), with the reader's action following as payoff — never "Writmint is a…" and never a category noun phrase as the opener. (2) Address the reader as "you"; name concrete roles ("your reviewer," "the approver"); never narrate about "a human." Exception: keep "human-readable" where it is the technical antonym of "machine-readable."
- **Tier 2 is left as a surprise** — do not foreshadow the trust-scaffolding payoff in Tier 1 copy.
- **Honesty is a positioning principle:** keep the "v0.5.x — early" status banner; always state the "empty band" claim with its negative-existence scope; state the untested behavioral premise plainly where leaned on.
- **No Anthropic footer in commit messages** (standing user preference).
- **Branch:** all commits land on `docs/author-time-gate-reframe` (already checked out).

---

## File Structure

- **Create:** `docs/positioning.md` — the canonical positioning reference (core statement, debugger→approver, Tier-1/Tier-2 hierarchy, honesty principle, behavioral premise). Everything else links here.
- **Create:** `docs/competitive-landscape.md` — the research-distilled competitive-band note with the two honest caveats and source citations.
- **Modify:** `README.md` — rewrite lines 1–7 (H1 + tagline + lead, keep the status banner), restructure the `## The five pillars` section (lines 107–185) into a Tier-1/Tier-2 split, edit the demo closing line (line 103), and sweep the seven residual "pillar" cross-references (lines 109, 191, 320, 346–351, 363, 388) for coherence. Add links to the two new docs.

Order rationale: the positioning doc is the canonical source the other two reference, so it is built first; the competitive note is independent of the README but referenced by it; the README is last because it links both new docs.

---

### Task 1: Positioning statement document

**Files:**
- Create: `docs/positioning.md`
- Reference (read-only): `docs/superpowers/specs/2026-06-26-author-time-gate-reframe-design.md`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a stable relative path `docs/positioning.md` and two anchor headings other docs link to — `## Core statement` and `## The gate, and what makes it trustworthy`. The README (Task 3) links to this file; keep these heading texts exact so the anchors (`#core-statement`, `#the-gate-and-what-makes-it-trustworthy`) resolve.

- [ ] **Step 1: Write the document**

Create `docs/positioning.md` with this exact content:

```markdown
# Writmint positioning

The canonical framing for Writmint. Every external surface — README, docs, outreach —
points here and uses this language. Last reviewed 2026-06-28.

## Core statement

**Verifies every capability manifest your AI agents write, then hands you a clean one to approve.**

An AI agent declares what a capability may do — every host it reaches, every field it touches,
every action it takes. Writmint checks that declaration as the agent writes it and rejects anything
underspecified, overscoped, or unsafe, returning deterministic, machine-readable errors the agent
fixes on its own. By review time, you sign off on verified work instead of hunting for what the
agent got wrong.

Most agent platforms surface manifest mistakes at runtime, when the capability tries to act, or
downstream, when the manifest reaches a pull request — leaving your reviewer to debug the agent.
Writmint moves the correction earlier and makes it deterministic, so review stays a place to
approve, not repair.

One-liner, for tight contexts: *Verifies AI-generated capability manifests at author time — so
review is a sign-off, not a cleanup.*

## Debugger → approver

The difference Writmint makes is not *whether* someone reviews the manifest — in today's
pull-request ritual they do — but *what state it is in when they do*: raw agent output (today) vs.
a machine-verified artifact (Writmint). That repositions the reviewer's job from debugger to
approver.

This is a compliance fit, not a hedge. In banking, healthcare, and insurance — Writmint's anchor
scenario — segregation of duties requires that the approver is not the author. A standing approval
step is mandatory there, so "you still approve" is alignment, not weakness. The agent authors and
corrects its own work; you approve a manifest that arrives already verified and cryptographically
bound to what you signed.

## The gate, and what makes it trustworthy

**The gate — verification an agent corrects against.** Two things carry it:
- **Structured errors** — every failure is `{code, where, expected, actual, fixHint}`. Deterministic,
  machine-readable, the same shape for every rejection. This is the differentiated claim: the agent
  corrects against the contract, not against a reviewer's comments.
- **The capability manifest** — the declarative contract the agent is making approvable: the only
  surface a capability has on the host system.

**What makes a verified manifest trustworthy.** Verification gets the manifest correct; these three
make a correct manifest worth approving:
- **Approval — hash-bound, lifecycle-tracked, audited.** Approval binds to the SHA-256 of the
  manifest, so "you signed these exact bytes," not "the agent says it's clean."
- **Permissions — the broker boundary.** The declared scope is actually enforced at runtime; nothing
  outside the manifest reaches the host system.
- **Replay — every execution is reproducible.** Any run can be replayed against its recording to
  prove what happened, with strict-ordered divergence detection.

The first band is what the market leaves empty (see
[competitive landscape](./competitive-landscape.md)). The second is the territory runtime-governance
tools already occupy — so we lead with the first and let the second land as the reason a verified
manifest is also a trustworthy one.

## The premise this rests on (stated plainly)

The positioning leans on a behavioral claim that is empirically untested in shipping products: that
AI agents actually self-correct manifests in a closed loop against structured rejections at scale.
Evidence so far is one data point — a dogfood pass where a skill-disabled agent landed a new
permission shape in two round-trips on the structured rejections alone. The reframe is a
high-conviction bet that this generalizes; a measured dogfood corpus (separate work) is how we test
it. If agents thrash, or converge only when the authoring skill is enabled (i.e. the value is in
prose guidance, not the structured contract), this positioning must be revisited — and we will say
so rather than quietly drop the claim.

## Honesty as a principle

Writmint's buyer values transparency and has been burned by tools that overclaim, so candor is a
deliberate choice, not fine print: pre-stable software is labelled pre-stable; the "empty band"
claim always carries its scope; the untested premise above is stated wherever the positioning leans
on it. A vendor that tells you what is not yet proven is one you can trust about what is.
```

- [ ] **Step 2: Verify against the spec**

Run: open the spec's "Core statement", "Pillar hierarchy", "Honesty as a positioning principle", and "The premise this reframe rests on" sections side by side with `docs/positioning.md`.
Expected: the headline matches Option A verbatim; no occurrence of "a human" / "Writmint is a"; the status/premise/empty-band honesty points are all present. Confirm with:

```bash
cd C:/code/playground/extensions/runtime
grep -ni "a human\|Writmint is a" docs/positioning.md   # expect: no output
grep -c "Verifies every capability manifest your AI agents write, then hands you a clean one to approve." docs/positioning.md   # expect: 1
```

- [ ] **Step 3: Commit**

```bash
cd C:/code/playground/extensions/runtime
git add docs/positioning.md
git commit -m "docs: canonical positioning statement (author-time gate reframe)"
```

---

### Task 2: Competitive-landscape note

**Files:**
- Create: `docs/competitive-landscape.md`
- Reference (read-only): the deep-research report findings transcribed in the spec's "Problem" and "Competitive band note" sections.

**Interfaces:**
- Consumes: `docs/positioning.md` exists (Task 1) — this note links back to it with `[positioning](./positioning.md)`.
- Produces: stable path `docs/competitive-landscape.md` with heading `## The empty band` (anchor `#the-empty-band`), which `docs/positioning.md` already links to via `./competitive-landscape.md`.

- [ ] **Step 1: Write the document**

Create `docs/competitive-landscape.md` with this exact content:

```markdown
# Competitive landscape

Where Writmint stands that nothing else does, and the honest limits of that claim. Distilled from
deep research dated 2026-06-26 (104 agents, 22 sources, 24/25 claims adversarially confirmed). See
[positioning](./positioning.md) for what we do with this.

## Two rituals, both downstream of authoring

The market's agent-approval ritual has settled at two points, and neither is author-time over the
manifest:

- **Runtime** — per-tool-invocation gates. Claude Code, the MCP spec, and Microsoft's Agent
  Governance Toolkit all put the human-in-the-loop check at execution, when the capability tries to
  act.
- **Downstream pull-request review** — a reviewer reads the generated artifact after the fact.
  Harness AI ships exactly this: generate spec → present for review → create via API.

Both cast the reviewer as the agent's debugger. Neither verifies the manifest *as the agent writes
it*.

## The empty band

Every adjacent tool stops one step short of agent-consumable remediation:

- **Anthropic MCPB** validator returns a flat list of human-readable prose strings — no error codes,
  no fixHint field, no taxonomy.
- **`sync-agents-settings`** emits structured JSON with severity and codes — the closest analog — but
  explicitly has no fixHint field; correction is via `--fix` flags, not an agent-consumable loop.
- **MCP Inspector** does not validate strictly today; the strict-validation feature is an open,
  unassigned request, and even its proposed output is framed as human-readable CLI text.
- **Microsoft Agent Governance Toolkit** emits structured scan/threat reports, but its gateway
  decisions are human-readable reasons ("Tool X is on the deny list") — detection, not prescriptive
  self-correction.

The band Writmint targets — author-time, agent-consumable structured validation feedback with
fixHints an agent self-corrects against before you approve — is empty among all surveyed products and
standards.

## Honest limits of this claim

- **Negative-existence scope.** "Empty band" is scoped to the eight products and standards actually
  surveyed (Anthropic MCPB, GitHub MCP server, amtiYo/agents, sync-agents-settings, Claude Agent
  SDK, Microsoft Agent Governance Toolkit, MCP Inspector, the MCP spec). It is not proof that no such
  tool exists anywhere.
- **Cisco MCP Scanner unverified.** Named in our prior market memo but it did not surface with primary
  evidence in this research; its output format is unconfirmed here.
- **Commoditization from below is real but narrow.** MCP now defaults tool schemas to JSON Schema
  2020-12, making basic schema validity a free protocol primitive. That reaches schema-dialect
  validity — not the agent-consumable structured-rejection-with-fixHint loop. If MCP Inspector's
  strict validation ships with a machine-readable error mode, part of this band could narrow from
  below; we re-check this quarterly.

## Source

Deep research run id `wf_ef6079ea-bdc`, 2026-06-26. Prior market reality-check 2026-06-13.
```

- [ ] **Step 2: Verify against the spec**

Run: confirm both honest caveats from the spec's "Competitive band note" are present, and the tone rules hold.

```bash
cd C:/code/playground/extensions/runtime
grep -ci "negative-existence\|Cisco MCP Scanner" docs/competitive-landscape.md   # expect: 2 or more
grep -ni "a human" docs/competitive-landscape.md   # expect: no output (note: "human-readable" is allowed and present)
```

Expected: caveats present; no stray "a human" narration. ("human-readable" appearing is correct — it is the technical antonym.)

- [ ] **Step 3: Commit**

```bash
cd C:/code/playground/extensions/runtime
git add docs/competitive-landscape.md
git commit -m "docs: competitive-landscape note — the empty band, with honest caveats"
```

---

### Task 3: README teardown

**Files:**
- Modify: `README.md` — lines 1–7 (H1/tagline/lead/status), line 103 (demo closing line), lines 107–185 (the "five pillars" section), and the residual "pillar" references at lines 109, 191, 320, 346–351, 363, 388.

**Interfaces:**
- Consumes: `docs/positioning.md` (Task 1) and `docs/competitive-landscape.md` (Task 2) — the README links to both.
- Produces: the final public-facing README. No later task depends on it.

- [ ] **Step 1: Replace the H1, tagline, and lead (lines 1–7)**

Replace the current lines 1–7:

```markdown
# Writmint

**Writmint is a verifier for capabilities an author can't author past.**

You let an AI agent write a capability. Writmint refuses to let the capability do anything its manifest doesn't account for — and tells the agent exactly what to fix when it tries.

> Status: **v0.5.x — early.** API surface is stable enough for the demo below, not yet stable enough to depend on. Issues and feedback welcome.
```

with:

```markdown
# Writmint

**Verifies every capability manifest your AI agents write, then hands you a clean one to approve.**

When an AI agent builds a capability, it declares what that capability may do — every host it reaches, every field it touches, every action it takes. Writmint checks that declaration *as the agent writes it* and rejects anything underspecified, overscoped, or unsafe, returning a deterministic, machine-readable error the agent fixes on its own — before the manifest ever reaches you.

That changes what review *is*. Most agent platforms surface manifest mistakes at runtime, when the capability tries to act, or downstream, when the manifest lands in a pull request — leaving your reviewer to debug the agent. Writmint moves the correction earlier and makes it deterministic, so review stays a place to approve, not repair.

In banking, healthcare, and insurance, that approval step is mandatory: segregation of duties requires that the approver is not the author. Writmint is built for exactly that boundary. The agent authors and corrects its own work; you approve a manifest that arrives already verified and cryptographically bound to what you signed.

> Status: **v0.5.x — early.** API surface is stable enough for the demo below, not yet stable enough to depend on. Issues and feedback welcome.

See [positioning](./docs/positioning.md) for the full framing and [competitive landscape](./docs/competitive-landscape.md) for where this stands against runtime-governance tools and MCP's own standards.
```

- [ ] **Step 2: Edit the demo closing line (line 103)**

The current line 103 reads:

```markdown
That is the entire loop: **declare → submit (hardened) → approve (hashed) → run (brokered) → replay (recorded)**. An agent who cannot read these errors cannot ship a capability past Writmint.
```

Replace with (ties back to verification-then-approval, drops the old five-pillar framing implication):

```markdown
That is the entire loop: **declare → submit (hardened) → approve (hashed) → run (brokered) → replay (recorded)**. The agent corrects against the structured error on its own; what reaches you is a manifest that already passed. An agent that cannot read these errors cannot ship a capability past Writmint.
```

- [ ] **Step 3: Restructure the "five pillars" section header and intro (lines 107–109)**

Replace:

```markdown
## The five pillars

Each pillar is one file in `src/` (pillar 2 gained a second, `host-policy.ts`, in v0.5.0).
```

with:

```markdown
## How it works

Writmint is one verification gate and the scaffolding that makes a passed manifest trustworthy. Each piece below is one file in `src/` (the broker boundary gained a second, `host-policy.ts`, in v0.5.0).

### The gate — verification an agent corrects against
```

Then **reorder** the existing pillar subsections so the gate leads. Move the current `### 3. Structured errors` block (lines 155–171) and the current `### 1. Capability manifest` block (lines 111–143) to sit under the new `### The gate` heading, in that order (structured errors first, manifest second). Change their sub-headings from numbered pillars to:

- `### 3. Structured errors — every failure has a fix-hint` → `#### Structured errors — every failure has a fix-hint`
- `### 1. Capability manifest — the declarative contract` → `#### The capability manifest — the declarative contract`

Keep the body prose of each block **verbatim** (including the `network-dynamic` example, the `hardenManifest()` bullets, and all `Source:` links).

- [ ] **Step 4: Add the Tier-2 subsection and reorder the remaining three blocks**

After the two gate blocks, insert this transition heading:

```markdown
### What makes a verified manifest trustworthy

Verification gets the manifest correct. These three make a correct manifest worth approving: the approval is bound to the exact bytes, the declared scope is actually enforced at runtime, and every run can be replayed to prove what happened.
```

Then place the three remaining existing blocks under it, in this order, re-leveled from `###` to `####` and renamed off the pillar numbers:

- current `### 5. Approval — hash-bound, lifecycle-tracked, audited` (lines 179–185) → `#### Approval — hash-bound, lifecycle-tracked, audited`
- current `### 2. Permissions — the broker boundary` (lines 145–153) → `#### Permissions — the broker boundary`
- current `### 4. Replay — every execution is reproducible` (lines 173–177) → `#### Replay — every execution is reproducible`

Keep each block's body prose verbatim, including `Source:` links.

- [ ] **Step 5: Sweep the residual "pillar" cross-references**

Update each remaining reference so nothing dangles after the restructure:

- **Line 191** (canonical demo): change "It exercises all five pillars across 24 phases (A–H)" → "It exercises the full verification-and-trust path across 24 phases (A–H)".
- **Line 320** (MCP server): change "exposing the same pillars:" → "exposing the same surface:".
- **Line 388** (roadmap): change "The five pillars, the canonical demo, and the MCP server are all in." → "The verification gate, the trust scaffolding, the canonical demo, and the MCP server are all in."
- **Lines 346–351 and 363** (repository layout): these label *files* ("Pillar 1 — declarative contract", etc.). Leave the file descriptions but drop the now-orphaned "Pillar N" numbering — e.g. `capability-manifest.ts   Pillar 1 — declarative contract + hardenManifest()` → `capability-manifest.ts   Declarative contract + hardenManifest()`. Apply the same de-numbering to all six lines (capability-manifest, permissions, host-policy, errors, replay, approval) and to line 363 (`mcp/  MCP server exposing the pillars` → `mcp/  MCP server exposing the API`).

- [ ] **Step 6: Verify the restructure**

Run a structural and tone check:

```bash
cd C:/code/playground/extensions/runtime
grep -ni "Writmint is a\|the five pillars\|all five pillars" README.md   # expect: no output
grep -ni "a human" README.md   # expect: no output
grep -c "Verifies every capability manifest your AI agents write, then hands you a clean one to approve." README.md   # expect: 1
grep -n "^## \|^### \|^#### " README.md | head -40   # eyeball: "How it works" → gate (2 ####) → trustworthy (3 ####)
```

Expected: no old-framing phrases remain; headline present once; the gate subsection lists structured-errors then manifest; the trustworthy subsection lists approval, permissions, replay. Confirm both new-doc links resolve:

```bash
test -f docs/positioning.md && test -f docs/competitive-landscape.md && echo "links OK"   # expect: links OK
```

- [ ] **Step 7: Confirm no source code was touched**

```bash
cd C:/code/playground/extensions/runtime
git status --porcelain   # expect: only README.md modified (M), nothing under src/ tests/ fixtures/
git diff --stat HEAD~2 -- src tests fixtures   # expect: no output (no changes in those trees)
```

Expected: the only working-tree change is `README.md`; the two new docs are already committed from Tasks 1–2.

- [ ] **Step 8: Commit**

```bash
cd C:/code/playground/extensions/runtime
git add README.md
git commit -m "docs: README teardown — lead on verification, Tier-1/Tier-2 restructure"
```

---

## Self-Review

**1. Spec coverage** — every spec section maps to a task:
- Core statement / supporting sentence / one-liner → Task 1 Step 1 + Task 3 Step 1.
- Pillar hierarchy (Tier-1/Tier-2) → Task 1 ("The gate, and what makes it trustworthy") + Task 3 Steps 3–4.
- Deliverable 1 (positioning doc) → Task 1. Deliverable 2 (README teardown) → Task 3. Deliverable 3 (competitive band note) → Task 2.
- Honesty principle → Task 1 "Honesty as a principle" + retained status banner (Task 3 Step 1).
- Behavioral premise stated plainly → Task 1 "The premise this rests on".
- Tone rules (verb-led, Writmint-subject, no "a human") → Global Constraints + verify steps in all three tasks.
- Out-of-scope (dogfood corpus, no code) → Global Constraints + Task 3 Steps 7 guard.

**2. Placeholder scan** — no TBD/TODO; all document bodies are given in full; all README edits show exact before/after text. Clear.

**3. Type/name consistency** — file paths `docs/positioning.md` and `docs/competitive-landscape.md` are used identically across tasks; the cross-link `./competitive-landscape.md` (Task 1) and `./positioning.md` (Task 2) match the created filenames; README links use `./docs/…` from repo root. Anchor headings referenced by links (`## Core statement`, `## The gate, and what makes it trustworthy`, `## The empty band`) match their definitions. Consistent.

Note on the writing-plans TDD template: these tasks are documentation, so "write failing test → make it pass" is replaced by "write document → verify against spec with grep/structural checks." The repo's existing 1050 tests are untouched (Task 3 Step 7 proves no source changed); they are not re-run as part of a doc deliverable's cycle.
