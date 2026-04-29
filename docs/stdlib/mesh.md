---
title: mesh
description: Service-mesh integration (Envoy xDS, Kubernetes Gateway API)
---

# `core.mesh`

**Layer 5.5 — Service-mesh integration**

Proxyless service-mesh primitives. Today covers:

- **`mesh.xds`** — Envoy xDS v3 (Aggregated Discovery Service) client
  for dynamic listener / cluster / route / endpoint / secret
  configuration.
- **`mesh.k8s`** — Kubernetes API-server client plus typed views of
  the Gateway API v1 CRDs (Gateway, GatewayClass, HTTPRoute, TLSRoute).

## `mesh.xds` — Envoy xDS v3 ADS

The Aggregated Discovery Service multiplexes LDS / CDS / RDS / EDS
/ SDS resource subscriptions over a single bi-directional gRPC
stream. The Verum surface is a typed façade; the wire protocol
runs through `core.net.http2` + `core.protobuf`, bound through
the `verum.xds.*` intrinsic family.

### Module layout

| Submodule | Purpose |
|-----------|---------|
| `xds.error` | `XdsError` (connection / auth / invalid-resource / NACK / over-limit / cancelled / closed) |
| `xds.types` | `TypeUrl` constants, `ResourceName` (+ `xdstp://` naming), `Node`, `AdsConfig` + `AdsAuth` |
| `xds.resources` | Typed views of `Listener`, `Cluster`, `RouteConfiguration`, `ClusterLoadAssignment` |
| `xds.client` | `AdsClient` — stream management, subscribe / unsubscribe, ACK / NACK, discovery-event iteration |

### Connect and subscribe

```verum
mount core.mesh.xds.*;
mount core.mesh.xds.types.AdsAuth;
mount core.time.duration.Duration;

let node = Node.new("sidecar-0".into(), "my-cluster".into())
    .with_locality("us-east".into(), "us-east-1a".into(), None)
    .with_user_agent("verum-envoy".into(), "0.1".into());

let config = AdsConfig.new("istiod:15010".into(), node)
    .with_auth(AdsAuth.Bearer("token".into()))
    .with_use_delta(true)                         // Envoy 1.15+ / Istio 1.8+
    .with_keepalive(Duration.from_secs(10));

let client = AdsClient.connect(config).await?;

let names: [ResourceName; 0] = [];
let sub = client.subscribe(
    TypeUrl.new(TypeUrl.LISTENER.into()),
    &names,
).await?;
```

### Discovery loop

```verum
loop {
    match client.next_response().await? {
        DiscoveryEvent.Sotw(resp)  => apply_sotw(resp),
        DiscoveryEvent.Delta(delta) => apply_delta(delta),
        DiscoveryEvent.Reconnected { .. } => continue,
        DiscoveryEvent.Disconnected(_) => break,
    }
}
```

### Typed resources

- `Listener` — name + address + port + filter chains + TLS contexts
- `Cluster` — `ClusterDiscoveryType` (Static/Eds/Dns/OriginalDst),
  `LbPolicy` (RoundRobin/LeastRequest/Random/Maglev/RingHash),
  `UpstreamTlsContext`, `Http2Options`
- `RouteConfiguration` — `VirtualHost`, `Route`, `RouteMatch`
  (Prefix/Path/Regex/Connect), `RouteAction` (ForwardCluster /
  WeightedClusters / Redirect / DirectResponse)
- `ClusterLoadAssignment` — `LocalityLbEndpoints` + per-endpoint
  `HealthStatus`

Raw protobuf bytes preserved via `Resource.raw_bytes` for opaque
extension passthrough.

## `mesh.k8s` — Kubernetes API + Gateway API CRDs

Resource-generic kube-apiserver client: `list<T>` / `get<T>` /
`create<T>` / `patch<T>` / `delete` / `watch<T>`. Typed CRD
schemas for Gateway API v1 (Gateway, GatewayClass, HTTPRoute,
TLSRoute).

### Module layout

| Submodule | Purpose |
|-----------|---------|
| `k8s.config` | `KubeConfig` with `load_default` / `load_context` / `from_endpoint`; `AuthInfo` (Token / ClientCertificate / ExecPlugin / InCluster) |
| `k8s.client` | `KubeClient` generics, `ListOptions` builder, `WatchEvent<T>`, `Patch` (StrategicMerge / JsonMerge / JsonPatch / Apply) |
| `k8s.gateway` | `Gateway` + `GatewayClass` + `Listener` + `ListenerTls` + `AllowedRoutes` |
| `k8s.httproute` | `HTTPRoute` + `HttpRouteRule` + all 6 Gateway API v1 filter variants |
| `k8s.tlsroute` | `TLSRoute` (SNI-matched) + `TlsRouteRule` |

### Client bootstrap + watch

```verum
mount core.mesh.k8s.*;
mount core.async.cancellation.CancellationToken;

let cfg = KubeConfig.load_default().await?;
let client = KubeClient.connect(cfg).await?;

let ns = &"istio-system".into();
let token = CancellationToken.new();
let mut stream = client.watch<HTTPRoute>(
    &"gateway.networking.k8s.io/v1".into(),
    &"httproutes".into(),
    Some(ns),
    &ListOptions.new().with_labels("app=api".into()),
    &token,
);

loop {
    match stream.next().await {
        Some(WatchEvent.Added(route))    => apply(route),
        Some(WatchEvent.Modified(route)) => reconcile(route),
        Some(WatchEvent.Deleted(route))  => retire(route),
        Some(WatchEvent.Bookmark { resource_version })
            => persist_rv(resource_version),
        Some(WatchEvent.Expired(_))     => re_list().await?,
        Some(WatchEvent.StreamError(_)) | None => break,
    }
}
```

### Server-side apply

```verum
client.patch<Gateway>(
    &"gateway.networking.k8s.io/v1".into(),
    &"gateways".into(),
    Some(ns),
    &"main".into(),
    &Patch.Apply {
        field_manager: "verum-operator".into(),
        body: "apiVersion: gateway.networking.k8s.io/v1\n...".into(),
    },
).await?;
```

## Future backends

The `mesh` umbrella is intentionally extensible. Tracked backends
beyond xDS + K8s:

- Istio control-plane integration (built on xDS)
- Consul Connect
- Linkerd destination API
- Open Service Mesh (OSM)

All share the same Verum-level philosophy: typed protocol objects,
typed errors, async streams for rotation / reconcile loops, and
intrinsic-backed transport so the runtime can swap implementations
without changing application code.
