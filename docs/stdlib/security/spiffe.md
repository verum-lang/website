---
sidebar_position: 10
title: spiffe — workload identity (SPIFFE / SPIRE)
description: SPIFFE workload identity — X.509-SVID, JWT-SVID, trust bundles, and the SPIRE workload API client.
---

# `core.security::spiffe` — workload identity

## What is SPIFFE and why does it matter?

The **Secure Production Identity Framework For Everyone** (SPIFFE)
is the industry-standard answer to a deceptively simple question:
"what identity is this workload?"

In cloud-native deployments, the old model — IP-address firewalls,
long-lived service accounts, mutual-TLS-with-certificates — breaks
down at scale:

- Pods are ephemeral; their IPs churn.
- Kubernetes service accounts can only be granted cluster-local scope.
- Hand-managed cert rotation is error-prone; cert expiry outages are
  famous (Microsoft Azure, Slack, GitHub, …).
- Multi-cluster, multi-cloud fleets need a unified identity namespace.

SPIFFE solves this with:

1. **SPIFFE ID** — a URI naming a workload uniformly across
   infrastructure: `spiffe://<trust-domain>/<path>`.
2. **SVID** — the cryptographic credential attesting the ID. Two
   flavours: X.509-SVID (certificates) and JWT-SVID (bearer tokens).
3. **Workload API** — a local Unix-domain-socket agent
   (typically [SPIRE](https://spiffe.io/docs/latest/spire-about/))
   that hands out short-lived SVIDs and rotates them automatically.
4. **Trust bundles** — the public keys used to verify SVIDs from
   peer workloads.

### The three-part promise

1. **Short-lived credentials** — SVIDs typically valid for 1 hour,
   rotated at the 30-minute mark. Lost keys become worthless fast.
2. **Zero ambient authority** — a process that wants an identity
   must attach to the local workload-API socket, proving its
   kernel-attested identity (UID, executable path, K8s pod
   metadata). The agent then issues an SVID.
3. **Cross-platform** — identities federate across K8s clusters,
   VMs, bare-metal, serverless. One protocol; `spiffe://prod/service`
   has a stable meaning regardless of whether the workload runs on
   AWS EKS, GKE, a VM, or a bare-metal rack.

## Verum's integration

Three files in `core/security/spiffe/`:

| File | Role |
|---|---|
| `id.vr` | `SpiffeId` type — parse, validate, render `spiffe://...` URIs |
| `svid.vr` | `X509Svid`, `JwtSvid`, trust bundles — typed credentials + verifier state |
| `workload_api.vr` | SPIRE Workload API client — fetches SVIDs, streams rotation updates |

Plus a higher-level Weft middleware
([`net/weft/spiffe.vr`](/docs/stdlib/net/weft/overview) — not in this
subtree) that wraps these into an HTTP authentication layer.

---

## `SpiffeId` — the identity

### Shape

```verum
mount core.security.spiffe.id.{SpiffeId, SpiffeIdError};

public type SpiffeId is {
    trust_domain: Text,        // DNS-like, e.g. "prod.example.com"
    path: Text,                 // path component, e.g. "/ns/team/sa/billing"
};
```

A SPIFFE ID URI looks like:

```
spiffe://prod.example.com/ns/billing/sa/api-gateway
       \__________________/\____________________/
         trust domain              path
```

### API

```verum
impl SpiffeId {
    // Construction
    pub fn new(trust_domain: Text, path: Text) -> Result<SpiffeId, SpiffeIdError>;
    pub fn from_trust_domain(trust_domain: Text) -> Result<SpiffeId, SpiffeIdError>;
    pub fn parse(input: &Text) -> Result<SpiffeId, SpiffeIdError>;

    // Accessors
    pub fn trust_domain(&self) -> &Text;
    pub fn path(&self) -> &Text;
    pub fn is_trust_domain_id(&self) -> Bool;   // true iff no path component

    // Rendering
    pub fn to_uri(&self) -> Text;               // "spiffe://td/path"

    // Queries
    pub fn is_member_of(&self, trust_domain: &Text) -> Bool;
}
```

### Validation rules (from the SPIFFE spec)

Trust domain:

- 1–255 bytes.
- Only `a-z`, `0-9`, `-`, `.`, `_`.
- Case-insensitive but canonically lowercase.
- No leading / trailing dots; no two consecutive dots.

Path:

- Begins with `/` (or is empty for trust-domain-only IDs).
- Each segment is URL-safe: `a-z`, `A-Z`, `0-9`, `-`, `.`, `_`, `~`,
  sub-delims, `:`, `@`, `%`.
- Total length ≤ 2048 bytes.

Invalid input returns a typed error:

```verum
public type SpiffeIdError is
    | Empty
    | MissingScheme
    | InvalidScheme(Text)
    | EmptyTrustDomain
    | InvalidTrustDomain { reason: Text }
    | PathTooLong { len: Int }
    | InvalidCharacters { at: Int, character: Byte };
```

### Quick example

```verum
use core.security.spiffe.id.{SpiffeId};

let id = SpiffeId.parse(&"spiffe://prod.example.com/ns/billing/sa/api")?;
assert_eq!(id.trust_domain(), &"prod.example.com");
assert_eq!(id.path(), &"/ns/billing/sa/api");
assert!(id.is_member_of(&"prod.example.com".to_string()));
```

---

## SVIDs — credentials

Two flavours, each with a matching *trust bundle* type.

### `X509Svid` — certificate-based

```verum
// svid.vr reuses the TLS stack's certificate and key types rather
// than defining its own DER-blob variants — one parser, one audit.
mount core.net.tls.{Certificate, PrivateKey};

public type X509Svid is {
    /// SPIFFE ID bound in the leaf cert's URI SAN.
    id: SpiffeId,
    /// Leaf cert first, followed by the intermediate chain.
    cert_chain: List<Certificate>,
    /// Private key for the leaf cert (ECDSA-P256 or Ed25519 typically).
    /// SENSITIVE — wipe on drop.
    private_key: PrivateKey,
    /// NotAfter of the leaf cert.
    expires_at: Instant,
};

impl X509Svid {
    pub fn new(id: SpiffeId, cert_chain: List<Certificate>,
               private_key: PrivateKey, expires_at: Instant) -> X509Svid;
    pub fn id(&self) -> &SpiffeId;
    pub fn cert_chain(&self) -> &List<Certificate>;
    pub fn private_key(&self) -> &PrivateKey;
    pub fn expires_at(&self) -> Instant;
    pub fn is_expired(&self, now: Instant) -> Bool;
}

public type X509Bundle is {
    trust_domain: Text,
    /// CA certs authorised to sign peer SVIDs for this trust domain.
    cas: List<Certificate>,
};

impl X509Bundle {
    pub fn new(trust_domain: Text, cas: List<Certificate>) -> X509Bundle;
    pub fn trust_domain(&self) -> &Text;
    pub fn cas(&self) -> &List<Certificate>;
}

public type X509BundleSet is {
    /// One entry per trust domain — federated deployments hold many;
    /// single-domain deployments hold exactly one.
    bundles: List<X509Bundle>,
};
```

Use case — **mutual TLS with SPIFFE identity in the cert SAN**.
The TLS handshake's client-cert is an `X509Svid`; the server
verifies it against its `X509BundleSet`. Peer identity = SPIFFE
URI SAN in the verified cert.

### `JwtSvid` — token-based

```verum
public type JwtSvid is {
    /// Subject SPIFFE ID (copy of the JWT "sub" claim).
    id: SpiffeId,
    /// Audience list — JWT "aud" claim.
    audiences: List<Text>,
    /// Compact-serialised JWT ("header.payload.signature").
    token: Text,
    /// Parsed "exp" claim.
    expires_at: Instant,
    /// Parsed "iat" claim, if present.
    issued_at: Maybe<Instant>,
    /// Remaining claims as opaque JSON passthrough.
    extra_claims: Text,
};

impl JwtSvid {
    pub fn id(&self) -> &SpiffeId;
    pub fn token(&self) -> &Text;
    pub fn audiences(&self) -> &List<Text>;
    pub fn expires_at(&self) -> Instant;
    pub fn issued_at(&self) -> &Maybe<Instant>;
    pub fn is_expired(&self, now: Instant) -> Bool;
}

public type JwtBundle is {
    trust_domain: Text,
    /// JWKS-format JSON of trusted signing keys (RFC 7517).
    jwks: Text,
};

impl JwtBundle {
    pub fn new(trust_domain: Text, jwks: Text) -> JwtBundle;
    pub fn trust_domain(&self) -> &Text;
    pub fn jwks(&self) -> &Text;
}
```

Use case — **HTTP `Authorization: Bearer ...` for service-to-service
auth** where mTLS is inconvenient (a proxy strips client certs, a
browser client, etc.). The JWT carries the SPIFFE ID in its `sub`
claim.

### Bundle sets

`X509BundleSet` and `JwtBundleSet` hold a bundle per trust domain
— workloads typically need to verify peers from their own trust
domain AND any federated domains they interoperate with.

---

## Workload API client — `core.security.spiffe.workload_api`

The SPIRE workload API runs as a local agent, listening on a Unix
domain socket (default `unix:/tmp/spire-agent/public/api.sock` or
`unix:/run/spire/sockets/agent.sock`). Processes attach and receive
SVIDs + bundles, automatically rotated.

### Socket discovery

```verum
mount core.security.spiffe.workload_api.{
    endpoint_socket, WorkloadApiClient, WorkloadApiError,
    X509SvidStream, JwtBundlesStream,
};

public fn endpoint_socket() -> Result<Text, WorkloadApiError>;
```

Resolves the socket path per the SPIFFE spec:

1. `SPIFFE_ENDPOINT_SOCKET` env var (highest priority).
2. Default OS path (`/tmp/spire-agent/public/api.sock`).
3. Error if neither.

### Client

```verum
mount core.async.cancellation.{CancellationToken};

public type WorkloadApiClient is {
    socket_path: Text,
    handle: UInt64,
};

impl WorkloadApiClient {
    /// Connect using the env-var / default socket path.
    pub async fn connect() -> Result<WorkloadApiClient, WorkloadApiError>;

    /// Connect to an explicit UDS path (tests / non-standard deploys).
    pub async fn connect_to(socket_path: &Text)
        -> Result<WorkloadApiClient, WorkloadApiError>;

    pub fn socket_path(&self) -> &Text;

    /// One-shot X.509-SVID fetch. For rotation-aware apps use
    /// `x509_svid_stream` which yields updates on each rotation.
    pub async fn fetch_x509_svid(&self)
        -> Result<X509SvidResponse, WorkloadApiError>;

    /// Streaming X.509-SVID updates. Yields on every rotation and
    /// trust-bundle change. Honour `token` for cancellation.
    pub fn x509_svid_stream(&self, token: &CancellationToken) -> X509SvidStream;

    /// Fetch a signed JWT-SVID for the given audiences. `subject`
    /// is optional — when omitted, the agent picks the default
    /// identity for this workload.
    pub async fn fetch_jwt_svid(
        &self,
        audiences: &[Text],
        subject: Maybe<&SpiffeId>,
    ) -> Result<JwtSvidResponse, WorkloadApiError>;

    /// Stream JWT trust-bundle updates.
    pub fn jwt_bundles_stream(&self, token: &CancellationToken) -> JwtBundlesStream;

    /// Validate a JWT-SVID against the given audience using the
    /// agent's own bundle — convenient when you don't want to manage
    /// bundles yourself.
    pub async fn validate_jwt_svid(
        &self,
        audience: &Text,
        token: &Text,
    ) -> Result<JwtSvid, WorkloadApiError>;

    pub async fn close(&self) -> Result<(), WorkloadApiError>;
}
```

`X509SvidStream` and `JwtBundlesStream` both implement
[`Stream`](/docs/stdlib/async#stream) and
[`AsyncIterator`](/docs/stdlib/async#stream) — use either
`.poll_next(cx)` or `for await item in stream { ... }`.

### Errors

```verum
public type WorkloadApiError is
    | NoEndpointConfigured              // SPIFFE_ENDPOINT_SOCKET unset/empty + no default
    | ConnectFailed(UnixError)          // socket connect failed
    | HandshakeFailed(Text)             // gRPC handshake / TLS error
    | RpcError { code: Int, message: Text }
    | ResponseMalformed(Text)
    | SvidParseError(SpiffeIdError)     // bad SPIFFE ID in a returned SVID
    | NoIdentityAvailable               // agent has no SVID for this workload
    | Cancelled                          // cancellation token fired
    | Closed;                            // client already closed
```

### Quick example — fetch an SVID once

```verum
use core.security.spiffe.workload_api.{WorkloadApiClient};

async fn get_my_identity() -> Result<(), Error> {
    // connect() automatically resolves the SPIFFE_ENDPOINT_SOCKET
    // env var or falls back to the default path.
    let client = WorkloadApiClient.connect().await?;
    let resp = client.fetch_x509_svid().await?;

    let me = &resp.svids[0];
    println!("I am: {}", me.id().to_uri());
    println!("My cert expires at: {}", me.expires_at());
    Ok(())
}
```

### Quick example — rotate automatically

```verum
use core.async.task;
use core.async.cancellation.{CancellationToken};

async fn run_with_rotation(mut app_tls_config: TlsConfig) {
    let token = CancellationToken.new();
    let client = WorkloadApiClient.connect().await.unwrap();

    // The stream yields fresh SVIDs each time SPIRE rotates them.
    let mut stream = client.x509_svid_stream(&token);

    // Background task that reloads TLS config whenever a new SVID
    // arrives. Cancel `token` to tear the stream down cleanly.
    task.spawn(async move {
        for await update in stream {
            match update {
                Ok(resp) => reload_tls(&mut app_tls_config, &resp.svids[0]),
                Err(e)   => log_error(&f"SVID stream error: {e}"),
            }
        }
    });

    // Your application runs...
}
```

This is the pattern behind
[`net/weft/spiffe.vr`](/docs/stdlib/net/weft/overview)'s `SpiffeAuthLayer`
and `SpiffeClientTransport` — they manage the SVID stream in the
background and hand fresh credentials to the TLS stack.

---

## Deployment patterns

### mTLS with SPIFFE (service-to-service)

```
     ┌───────────┐   ┌────────────┐   ┌───────────┐
     │ Service A │   │   SPIRE    │   │ Service B │
     │           │   │   agent    │   │           │
     └─────┬─────┘   └─────┬──────┘   └─────┬─────┘
           │ attach()       │                │ attach()
           ▼                ▼                ▼
       X509Svid        (rotates             X509Svid
       (bundle)         every 30min)         (bundle)
                                          
       A speaks TLS to B:
         handshake:  A presents its X509Svid (client cert)
                     B verifies with its bundle
                     A verifies B's cert with its bundle
         authorise:  A checks the SPIFFE ID in B's cert SAN
                     against its allow-list; B reciprocates
```

### JWT-SVID bearer-token

```
     ┌───────────┐      ┌────────────┐    ┌──────────┐
     │ Service A │      │   SPIRE    │    │  API GW  │
     └─────┬─────┘      └─────┬──────┘    └────┬─────┘
           │ fetch_jwt_svid    │                 │
           │  (audience=gw)    ▼                 │
           │◀──── jwt ────┐                      │
           │              ▼                      │
           │       jwt:{sub:"spiffe://prod/A",   │
           │            aud:["gw"],              │
           │            exp:Instant+1h}          │
           │                                     │
           │ GET /api  Authorization: Bearer <jwt>
           │─────────────────────────────────────▶
           │                                     │ verify signature with bundle
           │                                     │ check sub match ACL
           │                                     │ check aud contains "gw"
           │                                     │ proceed
```

---

## Security considerations

### Trust-domain discipline

Workloads within one trust domain implicitly trust each other's
SPIRE-issued SVIDs. Federating across trust domains requires
exchanging *bundles* — a trust-domain administrator publishes their
bundle; peers import it to trust their SVIDs.

Do not mix trust domains casually. Creating `spiffe://staging/`
and `spiffe://prod/` with a shared bundle is equivalent to granting
staging workloads production identity.

### SVID rotation

A workload that doesn't pick up bundle rotation will outage when
its SVID expires. Always subscribe to the stream — don't just
`fetch_*` once and cache forever.

### Private-key protection

`X509Svid.private_key` is sensitive. Never:

- Log it.
- Transmit it outside the workload.
- Write to disk without encryption.

SPIRE's delivery over the local Unix-domain socket is designed to
keep the key in process memory; it never touches disk.

Wipe memory on drop using [`zeroise`](/docs/stdlib/security/util)
(planned P1).

### Clock skew

SVID expiration is absolute time. A workload with a severely skewed
clock will either over-use an expired cert (attacker wins) or
reject valid SVIDs (denial of service on itself). Run NTP. Refuse
to start with a clock > 5 min off.

### What this module doesn't do

- It doesn't run SPIRE. You need a SPIRE deployment — server
  (issuing SVIDs), agent (the local socket this module talks to),
  and attestors (the mechanism by which the agent verifies what
  process is attaching).
- It doesn't manage trust-bundle distribution. Bundles come from
  the SPIRE agent (same workload-API), with bundle-federation
  handled at the server level.
- It's not a replacement for standard TLS cert validation in
  higher-layer code — use it as the source of material for
  `TlsConfig`, not a separate verifier.

---

## File layout

| File | Role |
|---|---|
| `core/security/spiffe/id.vr` | `SpiffeId` type — parse + validate — 167 LOC |
| `core/security/spiffe/svid.vr` | `X509Svid`, `JwtSvid`, bundles, responses |
| `core/security/spiffe/workload_api.vr` | SPIRE Workload API client |
| `core/security/spiffe/mod.vr` | Public re-exports |

## Related modules

- [`net.weft.spiffe`](/docs/stdlib/net/weft/overview#spiffe) — HTTP middleware
  that wraps these types for per-request SPIFFE auth.
- [`core.net.tls`](/docs/stdlib/net/tls/) — consumes `X509Svid` as
  identity cert + `X509BundleSet` as trust roots.
- [`core.security.secrets`](/docs/stdlib/security/secrets) — if you
  need a secret in addition to an identity (e.g. a DB password),
  fetch it from a secret store.

## References

- [SPIFFE specification](https://github.com/spiffe/spiffe/blob/main/standards/SPIFFE.md)
- [SPIFFE-ID specification](https://github.com/spiffe/spiffe/blob/main/standards/SPIFFE-ID.md)
- [X509-SVID specification](https://github.com/spiffe/spiffe/blob/main/standards/X509-SVID.md)
- [JWT-SVID specification](https://github.com/spiffe/spiffe/blob/main/standards/JWT-SVID.md)
- [SPIRE project](https://spiffe.io/docs/latest/spire-about/)
