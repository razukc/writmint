# Contributing

Writmint is at v0.1 and the API surface is still settling. Issues, questions,
and PRs are all welcome — small ones especially.

## Reporting issues

- Bug reports: include the version, what you ran, what happened, what you
  expected, and a minimal reproduction if possible. The triage demo
  (`fixtures/suspicious-transaction-triage/`) is a good template for shaping
  a repro.
- Security issues: see [`SECURITY.md`](./SECURITY.md) — do not open a public
  issue.

## Pull requests

PRs target `main`. Before opening one:

```bash
npm install
npm test           # 737 tests must pass
npm run demo       # 4-stage demo chain must complete
```

Keep changes scoped. If you are introducing a new pillar-level concept or
breaking the existing API surface, open an issue first so we can talk
shape before you write code.

## Development

```bash
git clone https://github.com/razukc/writmint
cd writmint
npm install
npm run test:watch     # vitest in watch mode while you work
```

Requires Node ≥ 22.
