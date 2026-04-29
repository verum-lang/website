---
sidebar_position: 11
title: SPIFFE workload identity & zero trust
description: X.509-SVID and JWT-SVID validation, mTLS-everywhere, automatic certificate rotation, HBONE-aware mode for service-mesh ambient deployments. Zero-trust at the framework boundary.
---

# `core.net.weft.spiffe`

Per-workload identity in the SPIFFE / SPIRE model. X.509-SVID for
mTLS, JWT-SVID for HTTP-auth. Rotation through a SPIRE agent
(default TTL 1 hour, refresh at half-TTL). Verum 2026 datacenter
default: mTLS everywhere with workload-identity-as-principal.

Source: `core/net/weft/spiffe.vr` (281 LOC).

## `Principal` — the authenticated identity context

```verum
context Principal {
    fn spiffe_id(&self) -> &SpiffeId;
    fn expires_at(&self) -> Instant;
    fn claims(&self) -> &Map<Text, Text>;
}
```

`Principal` is a context (DI value), not a request field. The
`SpiffeAuthLayer` validates the incoming SVID and `provide`s
`Principal` so downstream handlers receive it as a typed context.

## `SpiffeAuthLayer<P>` — the gate

```verum
public type SpiffeAuthLayer<P: TrustBundleProvider> is { /* ... */ };

implement<P: TrustBundleProvider + Send + Sync + 'static> SpiffeAuthLayer<P> {
    public fn new(provider: P) -> SpiffeAuthLayer<P>
    public fn jwt(secret: Bytes) -> SpiffeAuthLayer<JwtProvider>
    public fn mtls(trust_bundle: TrustBundle) -> SpiffeAuthLayer<X509Provider>
}
```

Behaviour:

- For mTLS termination: validates the client certificate chain
  against the SPIRE trust bundle, extracts the SPIFFE URI SAN.
- For JWT: validates the `Authorization: Bearer` token signature,
  extracts the SPIFFE ID claim.
- On success: `provide Principal = ...` for the request scope.
- On failure: returns `WeftError.Forbidden`.

## Usage

```verum
let app = Router.new()
    .route("/admin", Method.Get, admin_handler)
    .layer(SpiffeAuthLayer.new(trust_bundle));

async fn admin_handler(
    Ctx(p): Ctx<Principal>,
) -> Result<Response, ApiError> {
    if !p.spiffe_id().matches("spiffe://prod/*/sa/admin") {
        return Err(ApiError.Forbidden);
    }
    // ...
}
```

## `TrustBundleProvider` — the trust source

```verum
public type TrustBundleProvider is protocol {
    async fn current_bundle(&self) -> Result<TrustBundle, AuthError>;
    fn rotation_signal(&self) -> RotationChannel;
}
```

The default implementation polls the SPIRE Workload API
(`unix:///run/spire/sockets/agent.sock`) for the current trust
bundle and SVID. Cache plus rotation:

- Fetches at startup, populates the cache.
- Sets a timer for `expiry / 2`.
- On timer: re-fetches; on success, atomically swaps the cache and
  notifies the `rotation_signal` channel.
- On fetch failure: keeps the current bundle, retries with
  exponential backoff, alerts if the bundle is within 10 minutes
  of expiry.

Subscribers to `rotation_signal` (the connection pool, in particular)
re-key their TLS sessions on rotation rather than letting them
silently expire mid-session.

## `SpiffeClientTransport` — outgoing mTLS

For service-to-service calls, `SpiffeClientTransport` uses the
local SVID as a client certificate:

```verum
let transport = SpiffeClientTransport.new(provider);
let upstream = HttpClient.new(transport);
let resp = upstream.get("https://billing.internal/api/...").send().await?;
```

The transport handles SVID rotation transparently — when the
underlying `Principal` rotates, the transport rebuilds its TLS
config and the next connection picks up the new SVID.

## HBONE-aware mode for service-mesh ambient deployments

When the request arrives wrapped in an HBONE tunnel (Istio ambient
data-plane), the layer detects the wrapper signature and:

1. Decapsulates the inner HTTP CONNECT plus mTLS.
2. Validates the inner SVID against the trust bundle.
3. Provides the **inner** SVID as `Principal`, so the application
   sees the originating workload identity, not the ztunnel mesh
   identity.

This makes Weft a drop-in waypoint target without sidecar
configuration changes.

## SPIFFE ID matching

The `SpiffeId.matches(pattern)` accepts glob patterns:

| Pattern | Matches |
|---|---|
| `spiffe://prod/ns/billing/sa/svc` | exact |
| `spiffe://prod/ns/billing/sa/*` | any service in billing namespace |
| `spiffe://prod/ns/*/sa/admin` | any admin in any namespace |
| `spiffe://*/ns/billing/sa/svc` | billing service in any trust domain |

Use exact matching for production gates; use globs for development
or for catch-alls in policy.

## Rotation telemetry

On rotation, the layer emits metrics:

```
weft.spiffe.rotation.success{trust_domain="prod"} 1
weft.spiffe.rotation.duration_ms{trust_domain="prod"} 142
weft.spiffe.rotation.bundle_size_bytes{trust_domain="prod"} 8192
```

Failed rotations:

```
weft.spiffe.rotation.failure{trust_domain="prod", reason="connect-refused"} 1
```

The `near-expiry` alarm fires when the active SVID is within 10
minutes of expiry without successful rotation:

```
weft.spiffe.expiry_warning{trust_domain="prod", remaining_seconds=540} 1
```

## Capability narrowing through Principal

`Principal` is a context type, so it can be transformed through
context-system operators:

```verum
async fn admin_handler(
    Ctx(p): Ctx<Principal.with_role("admin")>,
) -> Response { ... }
```

The `with_role` transformer narrows the context to require a
specific claim. Compile-time check: a handler that requires
`with_role("admin")` cannot be reached without a layer that has
already validated the role.

## Status

- **Implementation**: complete (X.509 + JWT validation,
  TrustBundleProvider, rotation signal, HBONE-aware mode).
- **Conformance**: `spiffe_basic` test passing.
- **Phase**: 6 closed.
- **Out of scope**: Federation across multiple trust domains is a
  Phase 7 follow-up.

## Related documentation

- [Service / Layer / ServiceBuilder](./service)
- [TLS](./tls)
- [Error model](./error)
