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
