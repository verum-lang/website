---
sidebar_position: 24
title: search
description: Abstract search subsystem — SearchIndex protocol + concrete adapters (MeiliSearch today; Elasticsearch / Typesense / SQLite FTS5 / in-memory future).
status: regression-only
---

import StdlibStatus from '@site/src/components/StdlibStatus';

# `core.search` — Abstract search subsystem

<StdlibStatus status="regression-only" />

`core.search` provides a backend-agnostic full-text search
interface. Consumers program against the `SearchIndex` protocol
and pick a concrete adapter at construction time.

Same composition discipline as `core.cache`: protocol-level
concerns (query shape, hit format, filter language) live in
`types.vr`; adapters delegate to engine-specific subsystems
(`core.search.meilisearch` over MeiliSearch v1 REST; future
adapters over Elasticsearch / Typesense / SQLite FTS5 / in-memory).

## Layout

| File | What's in it |
|---|---|
| `mod.vr` | re-exports |
| `types.vr` | `SearchIndex` protocol + Document / Query / Filter / Hit / Results model |
| `meilisearch/` | MeiliSearch v1 REST adapter |

## Document model

```verum
public type Document is {
    id:     Text,                                    // unique key
    fields: Map<Text, Data>,                         // JSON-like field map
};
```

Documents are schema-flexible — `fields: Map<Text, Data>` accepts
any `core.base.data::Data` value (string / number / bool / null /
array / object). Backends are expected to index across all
fields' textual content by default; per-field filterable /
sortable / searchable attributes are configured via `IndexConfig`.

## Query model

```verum
public type SearchQuery is {
    q:         Text,                                 // full-text query string
    filter:    Maybe<SearchFilter>,                  // optional filter expression
    sort:      List<SortSpec>,                       // multi-field sort
    facets:    List<Text>,                           // facet field names
    limit:     Int { >= 1, <= 1000 },
    offset:    Int { >= 0 },
    fields:    List<Text>,                           // projection; empty = all
    highlight: List<Text>,                           // fields to highlight
};

// Every comparison arm is a RECORD with named `field` / `value`, and
// values are `JsonValue`, not a `Data` type.
public type SearchFilter is
    | Eq  { field: Text, value: JsonValue }
    | Gt  { field: Text, value: JsonValue }
    | Gte { field: Text, value: JsonValue }
    | Lt  { field: Text, value: JsonValue }
    | Lte { field: Text, value: JsonValue }
    | In  { field: Text, values: List<JsonValue> }
    | And(List<SearchFilter>)
    | Or(List<SearchFilter>)
    | Not(Heap<SearchFilter>)
    | RawFilter(Text);                               // backend passthrough

public type SortDirection is Asc | Desc;
public type SortSpec is { field: Text, direction: SortDirection };
```

There is no `Neq` and no `Exists` — negate with `Not(Heap(Eq{..}))` —
and the escape hatch is `RawFilter(Text)`, which hands a backend its own
query language verbatim. `Not` wraps a `Heap`, not a `Box`.

Highlighting is a list of field names on the query, not a pair of
markup tags: the backend chooses its own delimiters, and the marked-up
copy comes back in `SearchHit.formatted`.

`limit` and `offset` are refined (`1..=1000`, `>= 0`), so an
out-of-range page is a type error rather than a backend rejection, and
`search_query_match_all(limit, offset)` is the empty-query shorthand.

The filter algebra is intentionally minimal — every backend can
lower it to its native query language without lossy
approximations. Backends that don't support a particular filter
combinator (e.g. SQLite FTS5 doesn't have native `In` for arbitrary
arrays) MUST surface `SearchError.InvalidQuery(...)` naming the
combinator it could not lower, rather than silently degrade. (This
paragraph named a `FilterNotSupported` variant until 2026-09-06;
`core/search/types.vr` has never declared one, so the rule was
unfollowable as written.)

## Hit + Results

```verum
public type SearchHit is {
    id:        Text,                                 // primary key of the hit
    document:  JsonValue,
    score:     Maybe<Float>,                         // None if the backend has none
    formatted: Maybe<JsonValue>,                     // the document with highlights
};

// An ordered list of (value, count), not a Map: a facet distribution
// has an order the backend chose, and a Map would discard it.
public type FacetDistribution is {
    field:  Text,
    values: List<(Text, Int)>,
};

public type SearchResults is {
    hits:                 List<SearchHit>,
    estimated_total_hits: Int { >= 0 },              // ESTIMATED, not exact
    offset:               Int { >= 0 },              // echoes the query
    facets:               List<FacetDistribution>,
    processing_ms:        Int { >= 0 },
};
```

`estimated_total_hits` is named for what it is. A search backend
answering an approximate count is the normal case, and a field called
`total` would invite a reader to paginate off it exactly.

`score` is `Maybe<Float>` because not every backend exposes a
relevance score (SQLite FTS5's rank is exposed; some adapters'
default-mode queries are unranked). Consumers branching on
relevance MUST handle the `None` case explicitly.

## IndexConfig

```verum
public type IndexConfig is {
    primary_key:           Text,                     // required, not Maybe
    searchable_attributes: List<Text>,
    filterable_attributes: List<Text>,
    sortable_attributes:   List<Text>,
    stop_words:            List<Text>,
    synonyms:              List<(Text, List<Text>)>,
    distinct_attribute:    Maybe<Text>,
    ranking_rules:         List<Text>,               // engine-specific
};
```

The fields are `*_attributes`, not `*_fields`. There is no `name` — the
index is named by whoever creates it, not by its config — and no
`typo_tolerance` flag; typo behaviour rides in `ranking_rules`.
`primary_key` is a plain `Text` because an index without one cannot be
addressed. `synonyms` is an ordered list of pairs rather than a `Map`.
`index_config_default(primary_key)` fills the ranking rules with
words / typo / proximity / attribute and leaves the rest empty.

Backend adapters validate the config against their capabilities at
`create_index` time and surface `SearchError.SchemaConflict(...)`
for unsupported options — the variant the library actually declares.

## SearchIndex protocol

```verum
public type Document is { id: Text, fields: JsonValue };

// The protocol IS one index. No method takes an index name, and there
// is no create/delete/list of indexes here — an implementation is
// handed to you already bound to one.
public type SearchIndex is protocol {
    async fn search(&self, query: &SearchQuery)
        -> Result<SearchResults, SearchError>;
    async fn upsert_documents(&self, docs: &List<Document>)
        -> Result<(), SearchError>;
    async fn delete_document(&self, id: &Text) -> Result<(), SearchError>;
    async fn delete_by_filter(&self, filter: &SearchFilter)
        -> Result<Int, SearchError>;
    async fn configure(&self, config: &IndexConfig) -> Result<(), SearchError>;
    async fn health(&self) -> Result<(), SearchError>;
};
```

Every op is `async fn` and errors surface as `Result<T, SearchError>`,
so callers pattern-match on the failure mode.

Three shapes worth noting. Writing is `upsert_documents` — documents
are matched on the primary key and replaced, so there is no separate
add-versus-update. Deletion comes in two forms, one document by id or a
whole filter's worth with `delete_by_filter`, which answers how many it
removed. And there is no `get_document`: reading one document is a
`search` with a filter on the primary key.

`configure` applies an `IndexConfig` to the live index; each adapter
documents the subset it supports, and silently ignores the rest.

## Error surface

```verum
public type SearchError is
    | Network(Text)
    | InvalidQuery(Text)
    | IndexNotFound(Text)
    | DocumentNotFound(Text)
    | SchemaConflict(Text)
    | TooManyDocuments { count: Int, limit: Int }
    | Backend(Text);
```

Transcribed from `core/search/types.vr`. This page carried four
variants the library does not declare — `IndexAlreadyExists`,
`FilterNotSupported`, `IndexConfigUnsupported` and `Encoding` — and
omitted the two it does: `SchemaConflict` and the struct-shaped
`TooManyDocuments { count, limit }`. Match on the list above; a match
arm naming any of the four will not compile.

## Status

| File | Status | Notes |
|---|---|---|
| `mod.vr` | **undocumented** | re-exports only — no conformance suite yet |
| `types.vr` | **unverified** | full protocol + model — [core-tests/search/types](https://github.com/verum-lang/verum/tree/main/core-tests/search/types) |
| `meilisearch/` | **undocumented** | MeiliSearch v1 REST adapter; basic CRUD + search; per-field facet config + custom-ranking-rules TBD — no conformance suite yet |

## Adapter contract for new backends

To add a backend `XYZ`:

1. Add `core/search/xyz/` directory with `mod.vr`.
2. Implement `SearchIndex` for `XyzAdapter`.
3. Surface `SearchError.InvalidQuery(<filter-shape>)` for
   any combinator the backend can't lower losslessly; NEVER silently
   degrade to a permissive query.
4. Surface `SearchError.SchemaConflict(<option-name>)` at
   `create_index` time for unsupported config flags. (This item named
   an `IndexConfigUnsupported` variant until 2026-09-06;
   `core/search/types.vr` does not declare one, so the instruction
   could not be followed.)
5. Add a regression test under `core-tests/search/xyz/` that
   exercises the full protocol surface against a backend stub.
