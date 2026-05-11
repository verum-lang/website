---
sidebar_position: 24
title: search
description: Abstract search subsystem — SearchIndex protocol + concrete adapters (MeiliSearch today; Elasticsearch / Typesense / SQLite FTS5 / in-memory future).
---

# `core.search` — Abstract search subsystem

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
    query:        Text,                              // full-text query string
    filter:       Maybe<SearchFilter>,               // optional filter expression
    sort:         List<SortSpec>,                    // multi-field sort
    facets:       List<Text>,                        // facet field names
    limit:        Int,
    offset:       Int,
    highlight_pre_tag:  Text,                        // e.g. "<em>"
    highlight_post_tag: Text,                        // e.g. "</em>"
};

public type SearchFilter is
      Eq(Text, Data)                                 // field = value
    | Neq(Text, Data)
    | Lt(Text, Data)
    | Lte(Text, Data)
    | Gt(Text, Data)
    | Gte(Text, Data)
    | In(Text, List<Data>)
    | Exists(Text)
    | And(List<SearchFilter>)
    | Or(List<SearchFilter>)
    | Not(Box<SearchFilter>);

public type SortDirection is Asc | Desc;
public type SortSpec is { field: Text, direction: SortDirection };
```

The filter algebra is intentionally minimal — every backend can
lower it to its native query language without lossy
approximations. Backends that don't support a particular filter
combinator (e.g. SQLite FTS5 doesn't have native `In` for arbitrary
arrays) MUST surface `SearchError::FilterNotSupported` rather than
silently degrade.

## Hit + Results

```verum
public type SearchHit is {
    document:        Document,
    score:           Maybe<Float>,                   // relevance score; None if backend doesn't expose
    highlights:      Map<Text, List<Text>>,          // per-field highlighted snippets
};

public type FacetDistribution is {
    field:  Text,
    counts: Map<Text, Int>,                          // value → document count
};

public type SearchResults is {
    hits:        List<SearchHit>,
    total:       Int,                                // total matching count (across pages)
    facet_distribution: List<FacetDistribution>,
    query_time_ms: Int,
};
```

`score` is `Maybe<Float>` because not every backend exposes a
relevance score (SQLite FTS5's rank is exposed; some adapters'
default-mode queries are unranked). Consumers branching on
relevance MUST handle the `None` case explicitly.

## IndexConfig

```verum
public type IndexConfig is {
    name:                Text,
    primary_key:         Maybe<Text>,
    searchable_fields:   List<Text>,
    filterable_fields:   List<Text>,
    sortable_fields:     List<Text>,
    distinct_field:      Maybe<Text>,
    typo_tolerance:      Bool,
    ranking_rules:       List<Text>,                 // engine-specific
    stop_words:          List<Text>,
    synonyms:            Map<Text, List<Text>>,
};
```

Backend adapters validate the config against their capabilities at
`create_index` time and surface `SearchError::IndexConfigUnsupported`
for unsupported options.

## SearchIndex protocol

```verum
public type SearchIndex is protocol {
    async fn create_index(&self, config: &IndexConfig) -> Result<(), SearchError>;
    async fn delete_index(&self, name: &Text) -> Result<(), SearchError>;
    async fn add_documents(&self, name: &Text, docs: &List<Document>)
        -> Result<(), SearchError>;
    async fn delete_documents(&self, name: &Text, ids: &List<Text>)
        -> Result<(), SearchError>;
    async fn get_document(&self, name: &Text, id: &Text)
        -> Result<Maybe<Document>, SearchError>;
    async fn search(&self, name: &Text, query: &SearchQuery)
        -> Result<SearchResults, SearchError>;
    async fn list_indexes(&self) -> Result<List<Text>, SearchError>;
};
```

All ops are `async fn`. Errors surface via `Result<T, SearchError>`
so callers can pattern-match on the failure mode.

## Error surface

```verum
public type SearchError is
      IndexNotFound(Text)
    | IndexAlreadyExists(Text)
    | DocumentNotFound(Text)
    | InvalidQuery(Text)
    | FilterNotSupported(Text)
    | IndexConfigUnsupported(Text)
    | Network(Text)
    | Encoding(Text)
    | Backend(Text);
```

## Status

| File | Status | Notes |
|---|---|---|
| `mod.vr` | **stable** | re-exports only |
| `types.vr` | **stable** | full protocol + model |
| `meilisearch/` | **partial** | MeiliSearch v1 REST adapter; basic CRUD + search; per-field facet config + custom-ranking-rules TBD |

## Adapter contract for new backends

To add a backend `XYZ`:

1. Add `core/search/xyz/` directory with `mod.vr`.
2. Implement `SearchIndex` for `XyzAdapter`.
3. Surface `SearchError::FilterNotSupported(<filter-shape>)` for
   any combinator the backend can't lower losslessly; NEVER silently
   degrade to a permissive query.
4. Surface `SearchError::IndexConfigUnsupported(<option-name>)` at
   `create_index` time for unsupported config flags.
5. Add a regression test under `core-tests/search/xyz/` that
   exercises the full protocol surface against a backend stub.
