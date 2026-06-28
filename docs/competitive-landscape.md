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
