# Solr Integration Tests

Automated tests that verify the extension's Solr integration end-to-end against a live Solr instance.

## Prerequisites

1. **Running Solr instance** – Apache Solr 9.x with the `smart-search-results` core created and configured.
2. **Core schema applied** – the managed-schema and `solrconfig.xml` from `solr/smart-search-results/conf/` must be deployed to the core.
3. **Node / npm** – same toolchain used for the rest of the extension.

## Configuration

| Method | Details |
|---|---|
| VS Code setting | `smart-search.solrUrl` (default `http://localhost:8983/solr`) |
| Environment variable | `SOLR_URL=http://host:port/solr` |

The helpers check the environment variable first, then fall back to the VS Code setting.

## Running

```bash
# Compile first (TypeScript → JavaScript)
npm run compile-tests

# Run ALL tests (unit + integration)
npm run test:integration

# Run only unit tests (default, skips integration)
npm test
```

On **Windows** the `test:integration` script sets the `SOLR_INTEGRATION` environment variable automatically via `set`.

If Solr is **not reachable** when integration tests run, every integration suite will be skipped gracefully (not failed).

## Test Files

| File | Prompt | Description |
|---|---|---|
| `solrConnection.integration.test.ts` | 01 | Solr connectivity & health checks |
| `solrIndexing.integration.test.ts` | 02 | Document indexing via `IndexManager` |
| `solrSearch.integration.test.ts` | 03 | Search queries via Solr |
| `solrHighlighting.integration.test.ts` | 04 | Highlighting integration |
| `solrSessionManager.integration.test.ts` | 05 | Session CRUD operations |
| `solrQueryBuilder.integration.test.ts` | 06 | Query builder against live Solr |
| `solrFiltersPresets.integration.test.ts` | 07 | Filters & presets |
| `solrResultsPanel.integration.test.ts` | 08 | Results panel data flow |
| `solrEndToEnd.integration.test.ts` | 09 | Full end-to-end workflow |

## Shared Infrastructure

| File | Purpose |
|---|---|
| `constants.ts` | Timeouts, prefixes, required fields, boost values |
| `testHelpers.ts` | Solr connectivity checks, seed/cleanup, query helpers |
| `testDataFactory.ts` | Document & session factories for test data |

## Cleanup

Every test suite cleans up its own data in `suiteTeardown` using `deleteByQuery()` or `deleteSession()`.  
All test documents use `original_query` values prefixed with `__integration_test__` so they can be bulk-deleted if needed:

```
POST /solr/smart-search-results/update?commit=true
{ "delete": { "query": "original_query:__integration_test__*" } }
```
