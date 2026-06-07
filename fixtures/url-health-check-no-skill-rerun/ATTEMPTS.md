# Manifest write attempts — ops.url-health-check (no-skill rerun)

## Attempt 1

```json
{
  "id": "ops.url-health-check",
  "version": "0.1.0",
  "description": "Checks the health of a user-supplied URL by issuing a GET request and reporting the HTTP status code and elapsed latency in milliseconds.",
  "capabilities": [
    { "kind": "net.http", "reason": "Issue GET requests to user-supplied URLs" },
    { "kind": "clock", "reason": "Measure request latency in milliseconds" }
  ],
  "actions": [
    {
      "id": "check",
      "description": "Issue a GET to the supplied URL and return status code and latency in ms",
      "destructive": false,
      "input": {
        "type": "object",
        "properties": {
          "url": { "type": "string", "format": "uri" }
        },
        "required": ["url"]
      },
      "output": {
        "type": "object",
        "properties": {
          "status": { "type": "integer" },
          "latencyMs": { "type": "number" }
        },
        "required": ["status", "latencyMs"]
      }
    }
  ]
}
```

**Result: REFUSED**

```json
{
  "errors": [
    {
      "code": "manifest.schema_version",
      "where": "$.schemaVersion",
      "expected": "1",
      "actual": "undefined",
      "fixHint": "Set schemaVersion to 1."
    },
    {
      "code": "string.required",
      "where": "$.title",
      "expected": "non-empty string",
      "actual": "undefined",
      "fixHint": "Set $.title to a non-empty string."
    },
    {
      "code": "manifest.permissions.type",
      "where": "$.permissions",
      "expected": "array",
      "actual": "undefined",
      "fixHint": "Set permissions to an array (use [] if none, but actions cannot reference any)."
    },
    {
      "code": "string.required",
      "where": "$.actions[0].handler",
      "expected": "non-empty string",
      "actual": "undefined",
      "fixHint": "Set $.actions[0].handler to a non-empty string."
    },
    {
      "code": "action.permissions.type",
      "where": "$.actions[0].permissions",
      "expected": "array of permission ids",
      "actual": "undefined",
      "fixHint": "List the permission ids this action may use (use [] for pure actions)."
    },
    {
      "code": "manifest.implementation.type",
      "where": "$.implementation",
      "expected": "object",
      "actual": "undefined",
      "fixHint": "Set implementation to { type: \"module\", entry: \"<path>\" }."
    }
  ]
}
```

## Attempt 2

```json
{
  "schemaVersion": 1,
  "id": "ops.url-health-check",
  "title": "URL Health Check",
  "version": "0.1.0",
  "description": "Checks the health of a user-supplied URL by issuing a GET request and reporting the HTTP status code and elapsed latency in milliseconds.",
  "permissions": [
    { "id": "http-get", "kind": "net.http", "reason": "Issue GET requests to user-supplied URLs" },
    { "id": "clock", "kind": "clock", "reason": "Measure request latency in milliseconds" }
  ],
  "actions": [
    {
      "id": "check",
      "description": "Issue a GET to the supplied URL and return status code and latency in ms",
      "handler": "checkUrl",
      "destructive": false,
      "permissions": ["http-get", "clock"],
      "input": {
        "type": "object",
        "properties": {
          "url": { "type": "string", "format": "uri" }
        },
        "required": ["url"]
      },
      "output": {
        "type": "object",
        "properties": {
          "status": { "type": "integer" },
          "latencyMs": { "type": "number" }
        },
        "required": ["status", "latencyMs"]
      }
    }
  ],
  "implementation": {
    "type": "module",
    "entry": "./impl.js"
  }
}
```

**Result: REFUSED**

```json
{
  "errors": [
    {
      "code": "permission.type",
      "where": "$.permissions[0].type",
      "expected": "one of network, network-dynamic, storage, ui, clock, audit",
      "actual": "undefined",
      "fixHint": "Use a supported permission type."
    },
    {
      "code": "permission.type",
      "where": "$.permissions[1].type",
      "expected": "one of network, network-dynamic, storage, ui, clock, audit",
      "actual": "undefined",
      "fixHint": "Use a supported permission type."
    },
    {
      "code": "action.permission_ref.unknown",
      "where": "$.actions[0].permissions[0]",
      "expected": "a permission id declared in $.permissions",
      "actual": "\"http-get\"",
      "fixHint": "Declare a permission with id \"http-get\" or remove this reference."
    },
    {
      "code": "action.permission_ref.unknown",
      "where": "$.actions[0].permissions[1]",
      "expected": "a permission id declared in $.permissions",
      "actual": "\"clock\"",
      "fixHint": "Declare a permission with id \"clock\" or remove this reference."
    }
  ]
}
```

## Attempt 3

```json
{
  "schemaVersion": 1,
  "id": "ops.url-health-check",
  "title": "URL Health Check",
  "version": "0.1.0",
  "description": "Checks the health of a user-supplied URL by issuing a GET request and reporting the HTTP status code and elapsed latency in milliseconds.",
  "permissions": [
    { "id": "http-get", "type": "network-dynamic", "reason": "Issue GET requests to user-supplied URLs provided at call time" },
    { "id": "clock", "type": "clock", "reason": "Measure request latency in milliseconds" }
  ],
  "actions": [
    {
      "id": "check",
      "description": "Issue a GET to the supplied URL and return status code and latency in ms",
      "handler": "checkUrl",
      "destructive": false,
      "permissions": ["http-get", "clock"],
      "input": {
        "type": "object",
        "properties": {
          "url": { "type": "string", "format": "uri" }
        },
        "required": ["url"]
      },
      "output": {
        "type": "object",
        "properties": {
          "status": { "type": "integer" },
          "latencyMs": { "type": "number" }
        },
        "required": ["status", "latencyMs"]
      }
    }
  ],
  "implementation": {
    "type": "module",
    "entry": "./impl.js"
  }
}
```

**Result: REFUSED**

```json
{
  "errors": [
    {
      "code": "permission.network-dynamic.host_policy",
      "where": "$.permissions[0].hostPolicy",
      "expected": "object",
      "actual": "undefined",
      "fixHint": "Add a hostPolicy object with at least { registrableDomain: [\"example.com\"] }."
    }
  ]
}
```

## Attempt 4

```json
{
  "schemaVersion": 1,
  "id": "ops.url-health-check",
  "title": "URL Health Check",
  "version": "0.1.0",
  "description": "Checks the health of a user-supplied URL by issuing a GET request and reporting the HTTP status code and elapsed latency in milliseconds.",
  "permissions": [
    {
      "id": "http-get",
      "type": "network-dynamic",
      "reason": "Issue GET requests to user-supplied URLs provided at call time",
      "hostPolicy": { "registrableDomain": ["*"] }
    },
    { "id": "clock", "type": "clock", "reason": "Measure request latency in milliseconds" }
  ],
  "actions": [
    {
      "id": "check",
      "description": "Issue a GET to the supplied URL and return status code and latency in ms",
      "handler": "checkUrl",
      "destructive": false,
      "permissions": ["http-get", "clock"],
      "input": {
        "type": "object",
        "properties": {
          "url": { "type": "string", "format": "uri" }
        },
        "required": ["url"]
      },
      "output": {
        "type": "object",
        "properties": {
          "status": { "type": "integer" },
          "latencyMs": { "type": "number" }
        },
        "required": ["status", "latencyMs"]
      }
    }
  ],
  "implementation": {
    "type": "module",
    "entry": "./impl.js"
  }
}
```

**Result: REFUSED**

```json
{
  "errors": [
    {
      "code": "permission.network-dynamic.registrable_domain_invalid",
      "where": "$.permissions[0].hostPolicy.registrableDomain[0]",
      "expected": "a literal registrable domain (no wildcards, no leading/trailing dots)",
      "actual": "\"*\"",
      "fixHint": "Wildcards are not permitted; list the registrable domain literally (e.g. \"acme.com\", not \"*.acme.com\" or \".acme.com\")."
    }
  ]
}
```

## Attempt 5

```json
{
  "schemaVersion": 1,
  "id": "ops.url-health-check",
  "title": "URL Health Check",
  "version": "0.1.0",
  "description": "Checks the health of a user-supplied URL by issuing a GET request and reporting the HTTP status code and elapsed latency in milliseconds.",
  "permissions": [
    {
      "id": "http-get",
      "type": "network-dynamic",
      "reason": "Issue GET requests to user-supplied URLs provided at call time",
      "hostPolicy": { "registrableDomain": ["example.com"] }
    },
    { "id": "clock", "type": "clock", "reason": "Measure request latency in milliseconds" }
  ],
  "actions": [
    {
      "id": "check",
      "description": "Issue a GET to the supplied URL and return status code and latency in ms",
      "handler": "checkUrl",
      "destructive": false,
      "permissions": ["http-get", "clock"],
      "input": {
        "type": "object",
        "properties": {
          "url": { "type": "string", "format": "uri" }
        },
        "required": ["url"]
      },
      "output": {
        "type": "object",
        "properties": {
          "status": { "type": "integer" },
          "latencyMs": { "type": "number" }
        },
        "required": ["status", "latencyMs"]
      }
    }
  ],
  "implementation": {
    "type": "module",
    "entry": "./impl.js"
  }
}
```

**Result: ACCEPTED**
