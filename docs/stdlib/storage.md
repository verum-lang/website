---
sidebar_position: 27
title: storage
description: Abstract object-store subsystem — ObjectStore protocol + concrete adapters (S3-compatible today; GCS / Azure Blob / local-filesystem future).
status: regression-only
---

import StdlibStatus from '@site/src/components/StdlibStatus';

# `core.storage` — Abstract object-storage subsystem

<StdlibStatus status="regression-only" />

`core.storage` provides a backend-agnostic object-store interface
(S3-style get / put / head / delete / list / presign). Consumers
program against the `ObjectStore` protocol and pick a concrete
adapter at construction time.

Same composition discipline as `core.cache` and `core.search`:
protocol-level concerns (object metadata, errors, options) live in
`types.vr`; adapters delegate to engine-specific code (`core.storage.s3`
for any S3-compatible backend: AWS S3, MinIO, Cloudflare R2,
Wasabi, Backblaze B2; future adapters for GCS, Azure Blob,
local-filesystem).

## Layout

| File | What's in it |
|---|---|
| `mod.vr` | re-exports |
| `types.vr` | `ObjectStore` protocol + Metadata / Error / Options model |
| `s3/` | S3-compatible adapter (AWS sigv4, MinIO, R2, Wasabi, B2) |

## ObjectMetadata model

```verum
public type ObjectMetadata is {
    key:            Text,
    content_length: Int { >= 0 },         // bytes; refined, not a bare Int
    content_type:   Text,                 // default application/octet-stream
    etag:           Text,                 // hex-encoded strong validator
    last_modified:  Rfc3339Time,          // a time type, not Unix seconds
    user_metadata:  Map<Text, Text>,      // x-amz-meta-* / equivalent
};
```

There is no `storage_class`: `core.storage` does not model tiering.
`content_length` carries a refinement — a negative length is not
representable rather than merely unexpected — and `last_modified` is an
`Rfc3339Time`, so a caller reads it as a time rather than parsing an
integer.

`etag` is the strong validator from the backend (typically MD5 for
single-part uploads, `MD5(MD5(part1) || …)` for multipart). Consumers
needing optimistic concurrency round-trip it through
`PutOptions.if_match_etag` / `GetOptions.if_none_match`.

## Error surface

```verum
public type StorageError is
    | NotFound(Text)
    | AccessDenied(Text)
    | Network(Text)
    | InvalidKey(Text)
    | TooLarge { size: Int, limit: Int }
    | Conflict(Text)                     // includes a failed if-match
    | ChecksumMismatch { expected: Text, computed: Text }
    | Backend(Text);
```

`Conflict` covers what an HTTP backend would answer 409 or 412 to —
there is no separate `AlreadyExists` or `PreconditionFailed` arm — and
the two payload-bearing arms carry the numbers a caller needs to report
without a second round trip. `Display` renders every arm.

## Options

### PutOptions

```verum
public type PutOptions is {
    content_type:  Text,
    user_metadata: Map<Text, Text>,      // x-amz-meta-* / equivalent
    if_none_match: Bool,                 // a FLAG: "create only"
    if_match_etag: Maybe<Text>,          // conflict on mismatch
};
```

The two conditionals are deliberately asymmetric. `if_none_match` is a
`Bool`, not a `Maybe<Text>` — the only useful form of it is
"create-only", which S3 spells `*`. `if_match_etag` carries the etag
because there the caller has a specific version in mind.

`put_options_default()` gives `application/octet-stream`, an empty
metadata map, and neither conditional set.

### GetOptions

```verum
public type GetOptions is {
    range:         Maybe<(Int, Int)>,    // RFC 7233 (start, end_inclusive)
    if_none_match: Maybe<Text>,
};
```

There is no `if_modified_since` — conditional reads go through the etag
alone. `get_options_default()` sets neither field.

### ListOptions

```verum
public type ListOptions is {
    prefix:             Maybe<Text>,
    delimiter:          Maybe<Text>,      // "/" for hierarchy
    continuation_token: Maybe<Text>,      // opaque, from the previous page
    max_keys:           Int { >= 1, <= 1000 },
};

public type ListPage is {
    objects:         List<ObjectMetadata>,   // metadata, not bare keys
    common_prefixes: List<Text>,             // delimiter-based "directories"
    next_token:      Maybe<Text>,            // None when the listing is done
};
```

Two differences worth pausing on. A page returns full
`ObjectMetadata`, not a `List<Text>` of keys, so a listing already
carries sizes and etags. And there is no `is_truncated` flag: the end of
a listing is `next_token == Maybe.None`, one fact instead of two that
can disagree. `max_keys` is refined to 1..=1000, so an out-of-range page
size is a type error rather than a backend rejection.

Pagination is continuation-based; the loop pattern is

```verum
let mut cont = Maybe.None;
loop {
    let opts = ListOptions { prefix, delimiter, max_keys: 1000, continuation: cont };
    let page = store.list(&opts).await?;
    // process page.keys / page.common_prefixes
    if !page.is_truncated { break; }
    cont = page.next_continuation;
}
```

### Presign

```verum
public type PresignMethod is
    | Get
    | Put
    | Head
    | Delete;

public type PresignOptions is {
    method:          PresignMethod,
    expires_seconds: Int { >= 1, <= 604800 },   // 1 second .. 7 days
    extra_query:     Map<Text, Text>,           // response-* overrides
};
```

The variants are unprefixed — `PresignMethod.Get`, not `PresignGet` —
and `Head` exists alongside the other three. The validity window is
refined to S3's 7-day ceiling, so an over-long expiry is refused at the
type level. Overrides ride in `extra_query` (a signed `Content-Type` for
a PUT, a `response-Content-Disposition` for a GET) rather than in a
separate header map. `presign_options_get(expires_seconds)` is the
shorthand.

Presigned URLs are time-limited authorisation handles a service
can hand to third-parties (e.g. browser direct-uploads). The
returned URL embeds the signed expiration, method, key, and any
signed headers — alterations invalidate the signature.

## ObjectStore protocol

```verum
public type ObjectStore is protocol {
    async fn put(&self, key: &Text, data: &List<Byte>, options: &PutOptions)
        -> Result<ObjectMetadata, StorageError>;
    async fn get(&self, key: &Text, options: &GetOptions)
        -> Result<(ObjectMetadata, List<Byte>), StorageError>;
    async fn head(&self, key: &Text)
        -> Result<ObjectMetadata, StorageError>;
    async fn delete(&self, key: &Text)
        -> Result<(), StorageError>;
    async fn list(&self, options: &ListOptions)
        -> Result<ListPage, StorageError>;
    fn presign(&self, key: &Text, options: &PresignOptions)
        -> Result<Text, StorageError>;
    async fn head_bucket(&self)
        -> Result<(), StorageError>;
};
```

Each method takes its own options type; there is no shared `Options`.
`put` takes a `&List<Byte>`, not a slice.

`delete` is idempotent — succeeds even when the object does not
exist (matching S3 + GCS semantics). `head_bucket` is the readiness
probe used at startup to surface auth + region errors before the
first real request.

`presign` is the only non-async method — URL generation is purely
local (SHA-256 + HMAC + base64), no network round-trip.

:::caution Multipart is not shipped
There is no `multipart_create`, `multipart_part` or
`multipart_complete` — not on `S3Client`, not anywhere in `core/`. An
earlier version of this page named all three.

`put` buffers the whole payload into one request, so today the largest
object `core.storage` can write is the largest one a single request will
carry (5 GiB on S3). Streaming upload of arbitrarily large objects needs
the multipart API to exist first.
:::

The S3 adapter's surface is `s3_config(...)`, `s3_client(config, http)`,
and the `ObjectStore` implementation on `S3Client<C: HttpClient>` —
`core.storage.s3.signing` additionally exposes `sign_request` and
`presign` for callers signing their own requests.

## Status

| File | Status | Notes |
|---|---|---|
| `mod.vr` | **stable** | re-exports only |
| `types.vr` | **stable** | full protocol + options model |
| `s3/` | **partial** | sigv4 + GET / PUT / HEAD / DELETE / LIST + presign; multipart streaming on `Stream<Bytes>` source TBD |

## Adapter contract for new backends

1. Add `core/storage/<backend>/` with `mod.vr`.
2. Implement `ObjectStore` for `<Backend>Adapter`.
3. Map backend-native errors → `StorageError` variants. Use
   `StorageError.Backend(msg)` for unmappable cases — never
   silently swallow.
4. Surface continuation-based pagination via `ListPage.next_token`;
   one full backend list-call per `list()` invocation. NEVER
   server-side-buffer the full key set.
5. Add a regression test under `core-tests/storage/<backend>/`
   exercising the full protocol surface against a backend stub
   (S3-shaped reply fixtures are available under
   `core-tests/storage/s3/fixtures/`).
