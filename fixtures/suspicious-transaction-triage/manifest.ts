import type { CapabilityManifest } from '../../src/capability-manifest.js';

export const manifest: CapabilityManifest = {
  schemaVersion: 1,
  id: 'ops.fraud.suspicious_transaction_triage',
  version: '0.1.0',
  title: 'Suspicious Transaction Triage',
  description:
    'Triage workflow for an analyst reviewing a flagged transaction: pulls the transaction and customer record, account history, and a sanctions/watchlist check; presents a multi-step review screen; writes the analyst decision back to the case management system.',

  permissions: [
    {
      type: 'network',
      id: 'core.transactions',
      hosts: ['core-banking.internal'],
      methods: ['GET'],
      reason:
        'Read the flagged transaction and the customer record needed to evaluate it.',
    },
    {
      type: 'network',
      id: 'core.account_history',
      hosts: ['core-banking.internal'],
      methods: ['GET'],
      reason:
        'Read recent account history for the customer to assess whether the flagged transaction is anomalous.',
    },
    {
      type: 'network',
      id: 'sanctions.watchlist',
      hosts: ['watchlist.vendor.example.com'],
      methods: ['POST'],
      reason:
        'Submit the counterparty for a sanctions/watchlist check. Third-party vendor; isolated capability so the call surface is auditable.',
    },
    {
      type: 'network',
      id: 'cases.write',
      hosts: ['cases.internal'],
      methods: ['POST'],
      reason:
        'Write the analyst decision back to the case-management system of record. Destructive; gated separately at approval time.',
    },
    {
      type: 'storage',
      id: 'tenant.thresholds',
      scope: 'tenant/risk-thresholds',
      mode: 'read',
      reason:
        'Read tenant-scoped risk thresholds (e.g. high-value cutoff, watchlist score floor) used to label the alert.',
    },
    {
      type: 'ui',
      id: 'review.screen',
      reason: 'Render the multi-step review screen for the analyst.',
    },
    {
      type: 'audit',
      id: 'audit.triage',
      reason:
        'Emit structured audit events for compliance: every external read, the decision, and the write-back. Required by the regulated-ops compliance regime.',
    },
    {
      type: 'clock',
      id: 'clock.deterministic',
      reason:
        'Stamp decisions with a wall-clock time. Routed through the runtime clock capability so replays are deterministic.',
    },
  ],

  config: {
    sanctionsApiKey: {
      type: 'string',
      required: true,
      description: 'API key for the sanctions/watchlist vendor.',
      sensitive: true,
    },
    highValueThreshold: {
      type: 'number',
      required: false,
      description:
        'Override for the tenant-default high-value threshold (in account currency). If omitted, falls back to tenant.thresholds storage.',
    },
    historyWindowDays: {
      type: 'number',
      required: false,
      description: 'How many days of account history to pull. Defaults to 30.',
      default: 30,
    },
  },

  actions: [
    {
      id: 'triage.load_alert',
      description:
        'Load the flagged transaction, the customer record, and recent account history for the alert under review.',
      input: {
        type: 'object',
        required: ['alertId'],
        properties: {
          alertId: {
            type: 'string',
            description: 'Identifier of the alert to load.',
          },
        },
      },
      output: {
        type: 'object',
        required: ['transaction', 'customer', 'history'],
        properties: {
          transaction: {
            type: 'object',
            description: 'The flagged transaction.',
          },
          customer: {
            type: 'object',
            description: 'Customer record (PII; partially redacted in audit).',
          },
          history: {
            type: 'array',
            description: 'Recent account history within the configured window.',
            items: { type: 'object' },
          },
        },
      },
      permissions: ['core.transactions', 'core.account_history', 'tenant.thresholds', 'audit.triage'],
      handler: 'loadAlert',
      redact: ['customer.taxId', 'customer.dob', 'customer.address', 'customer.email'],
    },
    {
      id: 'triage.run_watchlist_check',
      description:
        'Submit the counterparty to the sanctions/watchlist vendor and return a normalized score plus matched lists.',
      input: {
        type: 'object',
        required: ['counterparty'],
        properties: {
          counterparty: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' },
              country: { type: 'string' },
              accountRef: { type: 'string' },
            },
          },
        },
      },
      output: {
        type: 'object',
        required: ['score', 'matches'],
        properties: {
          score: {
            type: 'number',
            description: 'Normalized 0..1 watchlist score.',
          },
          matches: {
            type: 'array',
            description: 'Matched lists (name, list id, jurisdiction).',
            items: { type: 'object' },
          },
        },
      },
      permissions: ['sanctions.watchlist', 'audit.triage'],
      handler: 'runWatchlistCheck',
      redact: ['counterparty.accountRef'],
    },
    {
      id: 'triage.submit_decision',
      description:
        'Write the analyst decision (clear / escalate / block) back to the case management system. Destructive: requires a separate approval lane.',
      input: {
        type: 'object',
        required: ['alertId', 'decision', 'reason'],
        properties: {
          alertId: { type: 'string' },
          decision: {
            type: 'string',
            enum: ['clear', 'escalate', 'block'],
            description: 'Analyst decision.',
          },
          reason: {
            type: 'string',
            description: 'Free-text justification entered by the analyst.',
          },
          watchlistScore: {
            type: 'number',
            description: 'Score recorded with the decision for audit.',
          },
        },
      },
      output: {
        type: 'object',
        required: ['caseId', 'recordedAt'],
        properties: {
          caseId: { type: 'string' },
          recordedAt: {
            type: 'string',
            description: 'ISO timestamp recorded by the case system.',
          },
        },
      },
      permissions: ['cases.write', 'clock.deterministic', 'audit.triage'],
      destructive: true,
      handler: 'submitDecision',
    },
  ],

  screens: [
    {
      id: 'triage.review',
      title: 'Review Alert',
      component: 'TriageReviewScreen',
      steps: ['summary', 'history', 'watchlist', 'decision'],
    },
  ],

  events: {
    emits: [
      'triage.alert_loaded',
      'triage.watchlist_completed',
      'triage.decision_recorded',
    ],
    subscribes: ['cases.alert_assigned'],
  },

  implementation: {
    type: 'module',
    entry: './implementation.js',
  },
};

export default manifest;
