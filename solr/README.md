# Smart Search Results — Solr Configuration

This directory contains the Solr core configuration for storing and searching ripgrep results from the Smart Search VS Code extension. It is the **authoritative** Solr setup reference for the project.

## Setup Instructions

### Prerequisites

- Apache Solr **9.x** (standalone mode). The bundled `solrconfig.xml` targets Lucene 9.0.0.
- The core name **must** be `smart-search-results` — it is hardcoded in the extension and cannot be changed via settings.

### 1. Start Solr

```bash
bin/solr start
```

### 2. Copy the Project's Configuration

Copy this directory's contents into Solr's core directory so that Solr uses the project's `managed-schema` and `solrconfig.xml`.

**Linux / macOS:**
```bash
# From the project root:
cp -r solr/smart-search-results/ <SOLR_HOME>/server/solr/smart-search-results/
```

**Windows (PowerShell):**
```powershell
# From the project root — adjust <SOLR_HOME> to your Solr install path:
Copy-Item -Path "solr\smart-search-results" -Destination "<SOLR_HOME>\server\solr\smart-search-results" -Recurse -Force
```

**Windows (cmd):**
```cmd
xcopy /s /y solr\smart-search-results\* "%SOLR_HOME%\server\solr\smart-search-results\"
```

### 3. Create the Core

```bash
# Option A: Use the Solr CLI (recommended)
bin/solr create -c smart-search-results -d server/solr/smart-search-results

# Option B: Simply restart Solr — it auto-discovers cores that have a core.properties file
bin/solr restart
```

### 4. Verify the Core Is Running

```bash
curl http://localhost:8983/solr/smart-search-results/admin/ping
```

A successful response contains `"status":"OK"`.

```bash
# Quick sanity check — should return zero documents initially
curl "http://localhost:8983/solr/smart-search-results/select?q=*:*&rows=0"
```

---

## Schema Overview

The schema (`managed-schema`) is purpose-built for storing ripgrep search results with surrounding context.

### Core Fields

| Category | Fields |
|----------|--------|
| Identity | `id` (string, required, unique key) |
| Session  | `search_session_id`, `original_query`, `search_timestamp`, `workspace_path` |
| File     | `file_path`, `file_name`, `file_extension`, `file_size`, `file_modified` |
| Match    | `line_number`, `column_number`, `match_text`, `match_text_raw` |
| Context  | `context_before`, `context_after`, `context_lines_before`, `context_lines_after` |
| Content  | `full_line`, `full_line_raw`, `display_content` |
| Metadata | `match_type`, `case_sensitive`, `whole_word`, `relevance_score`, `match_count_in_file` |
| AI       | `ai_summary`, `ai_tags` |
| Combined | `content_all` (text_general), `code_all` (text_code) — populated via copyField directives |

### Field Types

| Type | Class | Purpose |
|------|-------|---------|
| `text_general` | `solr.TextField` (StandardTokenizer + LowerCase) | Standard full-text search, case-insensitive, **no stopwords** |
| `text_code` | `solr.TextField` (WhitespaceTokenizer + WordDelimiterGraph + LowerCase) | Programming-aware tokenization — splits camelCase, snake_case, preserves originals |
| `text_display` | `solr.TextField` (StandardTokenizer + LowerCase) | Optimized for highlighting display content |
| `string` | `solr.StrField` | Exact-match fields for filtering and faceting |
| `pint` / `plong` / `pdate` | Point fields | Numeric and date fields for sorting and range queries |
| `boolean` | `solr.BoolField` | Boolean flags (`case_sensitive`, `whole_word`) |

### Schema Design Decisions

- **No stopwords** — Unlike traditional text search, code search preserves all words. Terms like `if`, `for`, `while`, `a`, `in` are significant in programming contexts (language keywords, variable names, etc.). Neither `text_general` nor `text_code` analyzers include a `StopFilterFactory`.

- **Three text field types** — Each serves a different purpose:
  - `text_general` — Standard tokenization for natural-language content (queries, summaries, file names).
  - `text_code` — `WordDelimiterGraphFilter` splits `camelCase` → `camel`, `Case` and `snake_case` → `snake`, `case`, while `preserveOriginal="1"` keeps the unsplit form in the index. This lets users search by either fragment or full identifier.
  - `text_display` — A lightweight text type used solely for the `display_content` field, which combines context + match into a single highlightable block.

- **Copy fields** — `content_all` and `code_all` are aggregate fields populated via `<copyField>` directives. They pull from `match_text`, `full_line`, `context_before`, `context_after`, `file_name`, `file_path`, and `ai_summary`. This lets the extension search broadly without listing every field in the query.

- **Raw fields** — `match_text_raw` and `full_line_raw` use type `string` (not tokenized) and are `indexed="false"`, `stored="true"`. They preserve the exact original text for display while the corresponding `text_general` / `text_code` versions are used for searching.

### Search Handlers

Defined in `solrconfig.xml`:

| Handler | Type | Default Rows | Purpose |
|---------|------|-------------|---------|
| `/select` | Standard | 10 | General queries with optional highlighting. Default field: `content_all`. |
| `/search` | eDisMax | 50 | Primary search endpoint. Field boosting: `match_text^5`, `full_line^3`, `file_name^2`, `ai_summary^2`, `context_before^1.5`, `context_after^1.5`. Phrase boosting: `match_text^10`, `full_line^5`. Includes facets on `file_extension`, `search_session_id`, `file_name`. |
| `/search-session` | eDisMax | 100 | Browse results within a specific session. Sorted by `file_path asc, line_number asc`. |
| `/update` | Update | — | Document indexing and deletion (JSON and XML). |
| `/admin/ping` | Ping | — | Health check endpoint. |

---

## Example Documents

Here is a realistic document matching the structure produced by `IndexManager.storeSearchResults()`:

```json
{
  "id": "session_1708000000000_abc123_client.ts_line42_0",
  "search_session_id": "session_1708000000000_abc123",
  "original_query": "function getData",
  "search_timestamp": "2026-01-15T10:30:00Z",
  "workspace_path": "/home/user/project",
  "file_path": "/home/user/project/src/api/client.ts",
  "file_name": "client.ts",
  "file_extension": "ts",
  "file_size": 2048,
  "file_modified": "2026-01-14T18:00:00Z",
  "line_number": 42,
  "column_number": 8,
  "match_text": "function getData",
  "match_text_raw": "function getData",
  "full_line": "export async function getData(params: QueryParams): Promise<Result[]> {",
  "full_line_raw": "export async function getData(params: QueryParams): Promise<Result[]> {",
  "context_before": [
    "import { QueryParams, Result } from '../types';",
    ""
  ],
  "context_after": [
    "  const response = await fetch(url);",
    "  return response.json();"
  ],
  "context_lines_before": 2,
  "context_lines_after": 2,
  "match_type": "literal",
  "case_sensitive": false,
  "whole_word": false,
  "relevance_score": 85,
  "match_count_in_file": 3,
  "display_content": "import { QueryParams, Result } from '../types';\n\n>>> export async function getData(params: QueryParams): Promise<Result[]> { <<<\n  const response = await fetch(url);\n  return response.json();"
}
```

### Index a Test Document

```bash
curl -X POST "http://localhost:8983/solr/smart-search-results/update/json/docs?commit=true" \
  -H "Content-Type: application/json" \
  -d '[{
    "id": "test_1",
    "search_session_id": "session_test",
    "original_query": "hello",
    "search_timestamp": "2026-01-15T10:30:00Z",
    "workspace_path": "/tmp/test",
    "file_path": "/tmp/test/hello.ts",
    "file_name": "hello.ts",
    "file_extension": "ts",
    "line_number": 1,
    "column_number": 0,
    "match_text": "hello world",
    "match_text_raw": "hello world",
    "full_line": "console.log(\"hello world\");",
    "full_line_raw": "console.log(\"hello world\");",
    "context_before": [],
    "context_after": [],
    "context_lines_before": 0,
    "context_lines_after": 0,
    "match_type": "literal",
    "case_sensitive": false,
    "whole_word": false,
    "relevance_score": 80,
    "match_count_in_file": 1,
    "display_content": ">>> console.log(\"hello world\"); <<<"
  }]'
```

---

## Search Examples

### `/search` — eDisMax (primary search handler)

```bash
# Simple text search (uses field boosting from qf)
curl "http://localhost:8983/solr/smart-search-results/search?q=function+getData"

# With session filter
curl "http://localhost:8983/solr/smart-search-results/search?q=getData&fq=search_session_id:session_1708000000000_abc123"

# With highlighting on display_content
curl "http://localhost:8983/solr/smart-search-results/search?q=getData&hl=on&hl.fl=display_content"

# Filter by file extension
curl "http://localhost:8983/solr/smart-search-results/search?q=search&fq=file_extension:ts"

# Faceted search
curl "http://localhost:8983/solr/smart-search-results/search?q=*:*&facet=true&facet.field=file_extension&facet.field=search_session_id"
```

### `/select` — Standard handler

```bash
# Direct field query
curl "http://localhost:8983/solr/smart-search-results/select?q=file_extension:ts"

# All documents (paginated)
curl "http://localhost:8983/solr/smart-search-results/select?q=*:*&rows=5"

# Range query on relevance score
curl "http://localhost:8983/solr/smart-search-results/select?q=relevance_score:[80 TO *]"
```

### `/search-session` — Session browsing

```bash
# Get all results for a session, ordered by file path and line number
curl "http://localhost:8983/solr/smart-search-results/search-session?q=*:*&fq=search_session_id:session_1708000000000_abc123"

# Search within a session
curl "http://localhost:8983/solr/smart-search-results/search-session?q=error&fq=search_session_id:session_1708000000000_abc123"
```

---

## Maintenance

### Reload Core (after schema or config changes)

```bash
curl "http://localhost:8983/solr/admin/cores?action=RELOAD&core=smart-search-results"
```

### Check Core Status

```bash
curl "http://localhost:8983/solr/admin/cores?action=STATUS&core=smart-search-results"
```

### Delete All Documents

```bash
curl -X POST "http://localhost:8983/solr/smart-search-results/update?commit=true" \
  -H "Content-Type: text/xml" \
  -d "<delete><query>*:*</query></delete>"
```

### Delete Old Sessions (older than 30 days)

```bash
curl -X POST "http://localhost:8983/solr/smart-search-results/update?commit=true" \
  -H "Content-Type: text/xml" \
  -d "<delete><query>search_timestamp:[* TO NOW-30DAYS]</query></delete>"
```

### Optimize Index

```bash
curl "http://localhost:8983/solr/smart-search-results/update?optimize=true"
```

### Unload and Recreate Core

```bash
# Unload (deletes index data)
curl "http://localhost:8983/solr/admin/cores?action=UNLOAD&core=smart-search-results&deleteIndex=true&deleteDataDir=true&deleteInstanceDir=true"

# Re-copy config and create again (see Setup Instructions above)
```

---

## Performance Tuning

- **Memory**: Adjust `ramBufferSizeMB` in `solrconfig.xml` based on available RAM (default: 256 MB).
- **Cache**: Tune `filterCache`, `queryResultCache`, and `documentCache` sizes for your usage patterns (default: 512 entries each).
- **Commits**: `autoCommit.maxTime` is 15 s and `autoSoftCommit.maxTime` is 1 s — adjust for your update frequency.
- **Faceting**: The `/search` handler facets on `file_extension`, `search_session_id`, and `file_name` by default. Add more facet fields as needed.

---

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| Core not found (404) | `core.properties` missing or Solr not restarted after copying files | Verify `<SOLR_HOME>/server/solr/smart-search-results/core.properties` exists, then restart Solr (`bin/solr restart`) |
| Schema errors on startup | Invalid XML in `managed-schema` | Check `managed-schema` for XML syntax errors; validate with `xmllint --noout managed-schema` |
| No search results | Documents not indexed, or wrong field names in query | Verify documents exist: `curl ".../select?q=*:*&rows=1"`. Check that field names match `managed-schema` exactly. |
| Highlighting not working | `display_content` field empty or `hl.fl` not set | Ensure `display_content` is populated when indexing. Use `hl=on&hl.fl=display_content` in queries. |
| Connection refused | Solr not running or listening on a different port | Start Solr (`bin/solr start`), check port with `bin/solr status`. Default port is 8983. |
| 400 Bad Request | Special characters in query not escaped | The extension's `SolrQueryBuilder.sanitizeQuery()` handles this automatically. For manual curl, escape `+`, `-`, `!`, `(`, `)`, `{`, `}`, `[`, `]`, `^`, `"`, `~`, `*`, `?`, `:`, `\`, `/`. |
| Duplicate documents after re-indexing | Same session stored twice | Delete the session first: `curl -X POST ".../update?commit=true" -H "Content-Type: text/xml" -d "<delete><query>search_session_id:SESSION_ID</query></delete>"` |

---

## Related Documentation

- [docs/configuration.md](../docs/configuration.md) — Extension settings and full Solr setup guide
- [SOLR_HIGHLIGHTING_CONFIG.md](../SOLR_HIGHLIGHTING_CONFIG.md) — Highlighting configuration details
- [docs/QUERY_GUIDE.md](../docs/QUERY_GUIDE.md) — Complete query syntax reference
- [docs/Troubleshooting-No-Results.md](../docs/Troubleshooting-No-Results.md) — Search troubleshooting
