---
sidebar_position: 11
title: secrets — Vault / cloud secret stores
description: Unified SecretStore protocol with AWS Secrets Manager, GCP Secret Manager, and HashiCorp Vault backends.
---

# `core::security::secrets` — secret stores

## Why a secrets module?

Every real-world application has secrets: database passwords, API
tokens, TLS private keys, OAuth client secrets, encryption keys.
They come with non-negotiable requirements:

1. **Not in source code.** Not in Git. Not in Docker images. Not in
   a `config.toml` shipped with the binary.
2. **Not in environment variables** — they're exposed to child
   processes, can appear in `/proc/<pid>/environ`, get logged by
   crash reporters.
3. **Rotatable.** Compromised secrets get replaced. Your code must
   pick up the rotation without a restart.
4. **Audited.** Who accessed what secret, when, from which machine.
5. **Access-controlled.** Services get the secrets they need and no
   others.

The industry converged on **external secret stores**: Vault, AWS
Secrets Manager, GCP Secret Manager, Kubernetes Secrets (with CSI
drivers), 1Password Connect, …. Applications fetch secrets at
startup (or on-demand), never store them at rest, never log them.

## What this module provides

- A **unified `SecretStore` protocol** — `get`, `put`, `delete`,
  `list` — that abstracts over the three major cloud backends.
- **Typed errors** — uniform `SecretError` taxonomy; backend-
  specific errors (`VaultError`, …) map to the shared type.
- **Backends:** HashiCorp Vault, AWS Secrets Manager, GCP Secret
  Manager.

The abstraction means: write your application against `SecretStore`,
swap the concrete backend in config. Cross-cloud deployment becomes
a configuration detail, not a code change.

## Core types — `core.security.secrets.core_protocol`

### `SecretError`

```verum
public type SecretError is
    | NotFound { name: Text }
    | PermissionDenied(Text)                   // 403 / IAM denied
    | Unavailable(Text)                         // 5xx / network
    | AuthenticationFailed(Text)                // local auth missing/expired
    | Malformed(Text)                           // bad payload shape
    | RateLimited { retry_after: Duration }     // backend told us to back off
    | VersionNotFound { name: Text, version: SecretVersion }
    | CryptoError(Text)                         // KMS unwrap / decrypt failed
    | Backend(Text);                            // backend-specific catch-all
```

### `SecretVersion`

```verum
public type SecretVersion is
    | Latest
    | Number(UInt64)           // Vault KV v2 numeric version
    | Stage(Text);             // AWS SecretsManager VersionStage
```

`Latest` is almost always what you want. `Number` / `Stage` are for
pinning to historical versions (reproducible builds, rollback).

### `SecretReference`

```verum
public type SecretReference is {
    name: Text,                // backend-specific path
    version: SecretVersion,
};

impl SecretReference {
    pub fn latest(name: Text) -> SecretReference;
    pub fn at(name: Text, version: SecretVersion) -> SecretReference;
}
```

### `Secret` — what you get back

```verum
public type Secret is {
    reference: SecretReference,
    data: List<Byte>,             // the payload
    metadata: Text,                // opaque backend-specific JSON
    created_at: Instant,
    expires_at: Instant,           // Instant.max if non-expiring
};

impl Secret {
    pub fn reference(&self) -> &SecretReference;
    pub fn data(&self) -> &List<Byte>;
    pub fn metadata(&self) -> &Text;
    pub fn created_at(&self) -> Instant;
    pub fn expires_at(&self) -> Instant;
    pub fn as_text(&self) -> Result<Text, SecretError>;
}
```

### `SecretStore` — the protocol

```verum
public type SecretStore is protocol {
    async fn get(&self, reference: &SecretReference) -> Result<Secret, SecretError>;
    async fn put(&self, name: &Text, value: &[Byte]) -> Result<SecretVersion, SecretError>;
    async fn delete(&self, name: &Text) -> Result<(), SecretError>;
    async fn list(&self, prefix: &Text) -> Result<List<Text>, SecretError>;
    fn description(&self) -> Text;
};
```

All three concrete clients (`VaultClient`, `AwsSecretsClient`,
`GcpSecretsClient`) implement `SecretStore`.

---

## Backend — HashiCorp Vault

`core.security.secrets.vault`. Supports KV v2 store (the most
common Vault use-case) with AppRole, Token, and Kubernetes auth
methods.

### Configuration

```verum
mount core.security.secrets.vault.{VaultConfig, VaultAuth, VaultClient};

public type VaultAuth is
    /// Static token (from VAULT_TOKEN env or explicit).
    | Token(Text)
    /// AppRole login — exchange (role_id, secret_id) for a client token.
    /// `mount_path` is the auth mount (default "approle").
    | AppRole { role_id: Text, secret_id: Text, mount_path: Text }
    /// Kubernetes SA login — exchange the pod JWT for a client token.
    /// `jwt_path` is typically
    /// `/var/run/secrets/kubernetes.io/serviceaccount/token`.
    /// `mount_path` is the auth mount (default "kubernetes").
    | Kubernetes { role: Text, jwt_path: Text, mount_path: Text };

public type VaultConfig is {
    address: Text,               // "https://vault.internal:8200"
    namespace: Maybe<Text>,      // Vault Enterprise namespace header
    auth: VaultAuth,
    kv_mount: Text,              // default "secret"
    tls_skip_verify: Bool,       // never true in production
    request_timeout: Duration,   // default 30s
};

impl VaultConfig {
    pub fn new(address: Text, auth: VaultAuth) -> VaultConfig;
    pub fn with_namespace(self, ns: Text) -> VaultConfig;
    pub fn with_kv_mount(self, mount_path: Text) -> VaultConfig;
    pub fn with_tls_skip_verify(self, skip: Bool) -> VaultConfig;
}
```

### Client

```verum
public type VaultClient is { handle: UInt64, config: VaultConfig };

impl VaultClient {
    pub async fn connect(config: VaultConfig) -> Result<VaultClient, VaultError>;
    pub async fn kv_read(&self, path: &Text, version: SecretVersion) -> Result<Secret, VaultError>;
    pub async fn kv_write(&self, path: &Text, value: &[Byte]) -> Result<UInt64, VaultError>;
    pub async fn kv_delete(&self, path: &Text) -> Result<(), VaultError>;
    pub async fn kv_list(&self, prefix: &Text) -> Result<List<Text>, VaultError>;
}
```

The client holds a background-renewed token lease; `connect` starts
the renewer, `close` (invoked on Drop) revokes the lease cleanly.

### Quick example — fetch a DB password

```verum
use core.security.secrets.vault.{VaultConfig, VaultAuth, VaultClient};
use core.security.secrets.core_protocol.{SecretReference};

async fn load_db_password() -> Result<Text, Error> {
    let config = VaultConfig.new(
        "https://vault.prod.internal:8200".into(),
        VaultAuth.Kubernetes {
            role: "billing-api".into(),
            jwt_path: "/var/run/secrets/kubernetes.io/serviceaccount/token".into(),
            mount_path: "kubernetes".into(),
        },
    );
    let client = VaultClient.connect(config).await?;

    let secret = client.kv_read(&"db/prod/password".into(), SecretVersion.Latest).await?;
    secret.as_text().map_err(|e| e.into())
}
```

### Errors

```verum
public type VaultError is
    | ConfigError(Text)
    | AuthFailure { code: Int, message: Text }
    | PathNotFound(Text)
    | PermissionDenied(Text)
    | Sealed
    | Forwarded { to_active_node: Text }
    | TooManyRedirects
    | BackendMismatch { expected: Text, actual: Text };
```

Use `vault.to_secret_error(e: VaultError) -> SecretError` to unify
into the shared taxonomy when your code is generic over the store.

---

## Backend — AWS Secrets Manager

`core.security.secrets.aws`. Uses AWS SigV4 over `core.net.http`;
credentials come from environment, IMDSv2 (EC2/ECS/Fargate), IRSA
(EKS), an explicit `AwsCredentials` value, or a chain that tries
several in order.

### Configuration

```verum
mount core.security.secrets.aws.{
    AwsRegion, AwsCredentials, AwsCredentialProvider, AwsSecretsClient,
};

public type AwsRegion is { code: Text };   // e.g. "us-east-1"

impl AwsRegion {
    pub fn new(code: Text) -> AwsRegion;
    pub fn code(&self) -> &Text;
    pub fn us_east_1() -> AwsRegion;     // convenience
    pub fn eu_west_1() -> AwsRegion;
}

public type AwsCredentials is {
    access_key_id: Text,
    secret_access_key: Text,   // sensitive — zeroise on drop
    session_token: Maybe<Text>,
};

impl AwsCredentials {
    pub fn new(access_key_id: Text, secret_access_key: Text) -> AwsCredentials;
    pub fn with_session_token(self, t: Text) -> AwsCredentials;
}

public type AwsCredentialProvider is
    /// Static credentials (tests, explicit config).
    | Explicit(AwsCredentials)
    /// AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN.
    | Environment
    /// IMDSv2 on EC2 — instance role / task role on ECS / Fargate.
    | InstanceMetadata
    /// IRSA — EKS Kubernetes IAM Roles for Service Accounts.
    | IRSA
    /// Try in order; first to succeed wins.
    | Chain(List<AwsCredentialProvider>);
```

### Client

```verum
public type AwsSecretsClient is { handle: UInt64, region: AwsRegion };

impl AwsSecretsClient {
    pub async fn connect(
        region: AwsRegion,
        provider: AwsCredentialProvider,
    ) -> Result<AwsSecretsClient, SecretError>;

    /// Accepts a full `SecretReference` so the version is part of
    /// the call — matches the SecretStore protocol shape directly.
    pub async fn get_secret_value(&self, reference: &SecretReference)
        -> Result<Secret, SecretError>;

    pub async fn put_secret_value(&self, name: &Text, value: &[Byte])
        -> Result<SecretVersion, SecretError>;

    pub async fn delete_secret(&self, name: &Text, recovery_window: Duration)
        -> Result<(), SecretError>;

    pub async fn list_secrets(&self, prefix: &Text) -> Result<List<Text>, SecretError>;

    pub async fn close(&self) -> Result<(), SecretError>;
}

// AwsSecretsClient implements SecretStore:
impl SecretStore for AwsSecretsClient { /* delegates to methods above */ }
```

### Quick example

```verum
use core.security.secrets.aws.{AwsRegion, AwsCredentialProvider, AwsSecretsClient};
use core.security.secrets.core_protocol.{SecretReference, SecretVersion};

async fn load_prod_credentials() -> Result<Secret, SecretError> {
    let client = AwsSecretsClient.connect(
        AwsRegion.us_east_1(),
        AwsCredentialProvider.InstanceMetadata,
    ).await?;

    client.get_secret_value(
        &SecretReference.latest("prod/api/oauth".into()),
    ).await
}
```

### Notes

- **IMDSv2** is mandatory for EC2 — v1 is deprecated and
  session-token-less. The `InstanceMetadata` provider uses v2.
- **IRSA** is the recommended way for EKS pods to assume an IAM
  role via projected SA tokens.
- `Chain([Environment, InstanceMetadata])` is a common pattern —
  use env vars locally, instance-role in production, same code.
- Cross-account access via `assume_role` is a future enhancement;
  today configure the client with credentials already in the
  target account.

---

## Backend — GCP Secret Manager

`core.security.secrets.gcp`. OAuth2 bearer-token auth via
application-default credentials, a service-account JSON file, or
an explicit bearer token.

### Configuration

```verum
mount core.security.secrets.gcp.{GcpAuth, GcpSecretsClient};

public type GcpAuth is
    /// Path to a service-account JSON key file.
    | ServiceAccountJson(Text)
    /// Use ADC — resolves in order:
    ///   GOOGLE_APPLICATION_CREDENTIALS env → metadata server → gcloud.
    | ApplicationDefault
    /// Raw OAuth2 access token (tests / local impersonation).
    | Bearer(Text);
```

### Client

```verum
public type GcpSecretsClient is { handle: UInt64, project: Text };

impl GcpSecretsClient {
    pub async fn connect(project: Text, auth: GcpAuth)
        -> Result<GcpSecretsClient, SecretError>;

    pub async fn access_secret_version(&self, reference: &SecretReference)
        -> Result<Secret, SecretError>;

    pub async fn add_secret_version(&self, name: &Text, value: &[Byte])
        -> Result<SecretVersion, SecretError>;

    pub async fn delete_secret(&self, name: &Text) -> Result<(), SecretError>;
    pub async fn list_secrets(&self, prefix: &Text) -> Result<List<Text>, SecretError>;
    pub async fn close(&self) -> Result<(), SecretError>;
}

// GcpSecretsClient implements SecretStore.
impl SecretStore for GcpSecretsClient { /* delegates */ }
```

### Quick example

```verum
use core.security.secrets.gcp.{GcpAuth, GcpSecretsClient};
use core.security.secrets.core_protocol.{SecretReference};

async fn load_stripe_key() -> Result<Text, SecretError> {
    let client = GcpSecretsClient.connect(
        "my-project-123".into(),
        GcpAuth.ApplicationDefault,
    ).await?;

    let secret = client.access_secret_version(
        &SecretReference.latest(
            "projects/my-project-123/secrets/stripe-key".into(),
        ),
    ).await?;
    secret.as_text()
}
```

---

## Using the `SecretStore` protocol generically

Write your application against the protocol; pick the backend in
wiring code:

```verum
async fn load_database_password<S: SecretStore>(
    store: &S,
) -> Result<Text, Error> {
    let secret = store.get(&SecretReference.latest("db/password".into())).await?;
    secret.as_text().map_err(|e| e.into())
}

// In main / wiring:
let store = if cfg.prod {
    VaultClient.connect(prod_vault_cfg).await?
} else {
    AwsSecretsClient.connect(region, AwsCredentialProvider.Environment).await?
};
let db_password = load_database_password(&store).await?;
```

---

## Best practices

### Fetch once, rotate on expiry

Do NOT fetch on every request. Cache the secret with its
`expires_at`; re-fetch when the cache is `< 10 minutes` from expiry.

```verum
type CachedSecret is {
    value: Secret,
    refresh_at: Instant,         // 10 min before expires_at
};

impl CachedSecret {
    async fn get_or_refresh<S: SecretStore>(&mut self, store: &S) -> &Secret {
        if Instant.now() >= self.refresh_at {
            self.value = store.get(&self.value.reference).await.unwrap();
            self.refresh_at = self.value.expires_at.checked_sub(Duration.from_mins(10)).unwrap_or(Instant.max());
        }
        &self.value
    }
}
```

### Zeroise on drop

Secrets in `Secret.data` and derivatives should be wiped from
memory when no longer needed:

```verum
impl Drop for Secret {
    fn drop(&mut self) {
        // Best effort — requires util::zeroise (planned P1)
        core.security.util.zeroise(&mut self.data);
    }
}
```

### Never log secrets

The `Secret` type does not implement `Debug`. If you need a
log-friendly identifier, log the **reference** (`secret.reference.name`)
— safe metadata.

### Rotate secrets, rotate access

A secret stored in Vault is only as secure as the process that can
read it. Run least-privilege ACLs: "the billing API can read
`kv/prod/db/billing-password`, nothing else". Revoke access when a
team member leaves.

### Separate secrets from configuration

Secrets belong in a secret store. **Non-secret** configuration
(timeouts, feature flags, endpoint URLs) belongs in a config file,
`Verum.toml`, or a config service. Mixing the two makes auditing
harder.

### Dev / test backends

A local `InMemorySecretStore` mock for tests is a future
enhancement. Today, tests either run against a local Vault dev
server (`vault server -dev`) or inject a mock implementing
`SecretStore`.

---

## File layout

| File | Role |
|---|---|
| `core/security/secrets/core_protocol.vr` | `SecretStore` protocol, `Secret`, `SecretError` |
| `core/security/secrets/aws.vr` | AWS Secrets Manager client |
| `core/security/secrets/gcp.vr` | GCP Secret Manager client |
| `core/security/secrets/vault.vr` | HashiCorp Vault (KV v2) client |
| `core/security/secrets/mod.vr` | Public re-exports |

## Related modules

- [`core.security.spiffe`](/docs/stdlib/security/spiffe) — workload
  identity; often the auth method for Vault (Kubernetes auth via
  the projected SA token).
- [`core.security.aead`](/docs/stdlib/security/aead) — for encrypting
  short-lived secrets at rest if you cache them outside the store.

## References

- [HashiCorp Vault — KV v2 API](https://developer.hashicorp.com/vault/api-docs/secret/kv/kv-v2)
- [AWS Secrets Manager API](https://docs.aws.amazon.com/secretsmanager/latest/apireference/)
- [GCP Secret Manager API](https://cloud.google.com/secret-manager/docs/apis)
- [OWASP — Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
