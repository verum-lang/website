---
sidebar_position: 27
title: storage
description: Abstract object-store subsystem — ObjectStore protocol + concrete adapters (S3-compatible today; GCS / Azure Blob / local-filesystem future).
---

# `core.storage` — Abstract object-storage subsystem

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
    key:           Text,
    size:          Int,
    content_type:  Text,
    etag:          Text,                  // strong validator
    last_modified: Int,                   // Unix seconds
    custom:        Map<Text, Text>,       // x-amz-meta-* / equivalent
    storage_class: Maybe<Text>,           // STANDARD / GLACIER / etc.
};
```

`etag` is the strong validator from the backend (typically MD5 for
single-part uploads, opaque hash for multipart). Consumers
needing optimistic concurrency check `etag` round-trip via
`PutOptions::if_match` / `GetOptions::if_none_match`.

## Error surface

```verum
public type StorageError is
      NotFound(Text)
    | AlreadyExists(Text)
    | PreconditionFailed(Text)           // etag mismatch on if-match
    | Forbidden(Text)
    | Network(Text)
    | InvalidKey(Text)
    | Backend(Text);
```

## Options

### PutOptions

```verum
public type PutOptions is {
    content_type:    Text,
    custom:          Map<Text, Text>,    // x-amz-meta-* / equivalent
    storage_class:   Maybe<Text>,        // STANDARD / GLACIER / ...
    if_match:        Maybe<Text>,        // 412 on mismatch (optimistic CAS)
    if_none_match:   Maybe<Text>,        // 412 on match (create-only)
};
```

### GetOptions

```verum
public type GetOptions is {
    range:           Maybe<(Int, Int)>,  // (start, end) — inclusive
    if_none_match:   Maybe<Text>,
    if_modified_since: Maybe<Int>,
};
```

### ListOptions

```verum
public type ListOptions is {
    prefix:          Text,
    delimiter:       Text,                // "/" for hierarchy
    max_keys:        Int,
    continuation:    Maybe<Text>,         // for pagination
};

public type ListPage is {
    keys:            List<Text>,
    common_prefixes: List<Text>,          // delimiter-based "directories"
    next_continuation: Maybe<Text>,       // None on last page
    is_truncated:    Bool,
};
```

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
      PresignGet
    | PresignPut
    | PresignDelete;

public type PresignOptions is {
    method:        PresignMethod,
    expires_in:    Int,                   // seconds
    content_type:  Maybe<Text>,           // signed-in if Some
    custom_headers: Map<Text, Text>,      // additional signed headers
};
```

Presigned URLs are time-limited authorisation handles a service
can hand to third-parties (e.g. browser direct-uploads). The
returned URL embeds the signed expiration, method, key, and any
signed headers — alterations invalidate the signature.

## ObjectStore protocol

```verum
public type ObjectStore is protocol {
    async fn put(&self, key, data, options)
        -> Result<ObjectMetadata, StorageError>;
    async fn get(&self, key, options)
        -> Result<(ObjectMetadata, List<Byte>), StorageError>;
    async fn head(&self, key)
        -> Result<ObjectMetadata, StorageError>;
    async fn delete(&self, key)
        -> Result<(), StorageError>;
    async fn list(&self, options)
        -> Result<ListPage, StorageError>;
    fn presign(&self, key, options)
        -> Result<Text, StorageError>;
    async fn head_bucket(&self)
        -> Result<(), StorageError>;
};
```

`delete` is idempotent — succeeds even when the object does not
exist (matching S3 + GCS semantics). `head_bucket` is the readiness
probe used at startup to surface auth + region errors before the
first real request.

`presign` is the only non-async method — URL generation is purely
local (SHA-256 + HMAC + base64), no network round-trip.

## Multipart uploads

For very large objects (≥ 5 MiB on S3), `put` buffers the entire
payload into one request. Concrete adapters expose multipart
helpers (`s3::multipart_create` / `multipart_part` / `multipart_complete`)
for streaming upload of arbitrarily large objects.

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
   `StorageError::Backend(msg)` for unmappable cases — never
   silently swallow.
4. Surface continuation-based pagination via `ListPage::next_continuation`;
   one full backend list-call per `list()` invocation. NEVER
   server-side-buffer the full key set.
5. Add a regression test under `core-tests/storage/<backend>/`
   exercising the full protocol surface against a backend stub
   (S3-shaped reply fixtures are available under
   `core-tests/storage/s3/fixtures/`).
