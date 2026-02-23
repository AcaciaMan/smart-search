# Smart Search Extension Configuration

## Solr Setup (Optional)

If you want to use Solr for session-based search (storing ripgrep results in Solr for advanced secondary queries), follow these steps:

1. **Download and install Apache Solr** (standalone mode, version 9.x recommended).

2. **Start Solr** in standalone mode:
   ```bash
   bin/solr start
   ```

3. **Create the core** using the project's bundled configuration. The core name **must** be `smart-search-results` — it is hardcoded in the extension:
   ```bash
   bin/solr create -c smart-search-results
   ```

4. **Copy the project's schema and config** into the new core's directory, replacing the default files:
   ```bash
   # From the project root:
   cp solr/smart-search-results/conf/managed-schema  <SOLR_HOME>/server/solr/smart-search-results/conf/
   cp solr/smart-search-results/conf/solrconfig.xml   <SOLR_HOME>/server/solr/smart-search-results/conf/
   ```
   Replace `<SOLR_HOME>` with your Solr installation directory.

5. **Reload the core** so Solr picks up the new configuration:
   ```bash
   curl "http://localhost:8983/solr/admin/cores?action=RELOAD&core=smart-search-results"
   ```

6. **Verify the core is running**:
   ```bash
   curl http://localhost:8983/solr/smart-search-results/admin/ping
   ```
   A successful response contains `"status":"OK"`.

### Schema Fields

The project's `managed-schema` defines the following field groups (see `solr/smart-search-results/conf/managed-schema` for full details):

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

### Connection Details

- The extension uses **axios** for all HTTP calls to Solr.
- The default Solr URL is `http://localhost:8983/solr` (configurable via `smart-search.solrUrl`).
- The core name `smart-search-results` is hardcoded — it cannot be changed via settings.
- **No authentication** is supported; Solr must be accessible without auth.
- Key endpoints used by the extension:
  - `POST /smart-search-results/update/json/docs` — store ripgrep results
  - `GET  /smart-search-results/search` — secondary search (uses edismax with field boosting)
  - `GET  /smart-search-results/select` — session listing, facets, and fallback queries
  - `GET  /smart-search-results/terms` — term suggestions / autocomplete
  - `POST /smart-search-results/update` — session cleanup (delete-by-query)

### Solr Request Handlers

The bundled `solrconfig.xml` defines these request handlers:

| Handler | Type | Purpose |
|---------|------|---------|
| `/select` | Standard | General queries with optional highlighting |
| `/search` | eDisMax | Main search endpoint with field boosting (`match_text^5`, `full_line^3`, etc.) and facets |
| `/search-session` | eDisMax | Search within a specific session, sorted by file path and line number |
| `/update` | Update | Document indexing and deletion |
| `/admin/ping` | Ping | Health check |

### Example curl Commands

```bash
# Ping the core
curl http://localhost:8983/solr/smart-search-results/admin/ping

# Run a search via the /search handler (edismax)
curl "http://localhost:8983/solr/smart-search-results/search?q=function&rows=10"

# Query via the standard /select handler
curl "http://localhost:8983/solr/smart-search-results/select?q=*:*&rows=5"

# Delete all documents (use with care)
curl -X POST "http://localhost:8983/solr/smart-search-results/update?commit=true" \
  -H "Content-Type: application/json" \
  -d '{"delete":{"query":"*:*"}}'
```

## Ripgrep Setup

This extension uses ripgrep for fast text search. Install ripgrep:

### Windows
```powershell
choco install ripgrep
# or
scoop install ripgrep
```

### macOS
```bash
brew install ripgrep
```

### Linux
```bash
# Ubuntu/Debian
sudo apt install ripgrep

# Fedora
sudo dnf install ripgrep
```

> **Note:** If you have a custom ripgrep binary, set the `smart-search.ripgrepPath` setting to its full path. Otherwise leave it empty to use `rg` from your system PATH.

## Configuration Options

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `smart-search.solrUrl` | string | `http://localhost:8983/solr` | Solr server URL for indexing |
| `smart-search.maxFiles` | number | `100` | Maximum number of files to include in search results (0 = no limit) |
| `smart-search.defaultSolrFields` | string | `content_all,code_all` | Default Solr fields to search in (comma-separated). Users can still specify custom field queries like `file_name:*.js` |
| `smart-search.maxParallelFolders` | number | `5` | Maximum number of workspace folders to search in parallel (1–10). Higher values may improve performance but use more system resources |
| `smart-search.enableDebugLogging` | boolean | `false` | Enable debug logging for multi-folder search operations |
| `smart-search.ripgrepPath` | string | `""` | Optional: full path to a custom ripgrep executable. Leave empty to use `rg` from your system PATH |
| `smart-search.filters.globalFilters` | array | `[]` | Named search filter presets available across all workspaces (global scope) |
| `smart-search.filters.workspaceFilters` | array | `[]` | Named search filter presets scoped to the current workspace or folder |

### Example settings.json
```json
{
  "smart-search.solrUrl": "http://localhost:8983/solr",
  "smart-search.maxFiles": 100,
  "smart-search.defaultSolrFields": "content_all,code_all",
  "smart-search.maxParallelFolders": 5,
  "smart-search.enableDebugLogging": false,
  "smart-search.ripgrepPath": "",
  "smart-search.filters.globalFilters": [],
  "smart-search.filters.workspaceFilters": []
}
```

## Sidebar Search Options (v2.0.0)

From v2.0.0 onwards, the Case Sensitive, Whole Word, and Regex toggles are no longer checkboxes inside the Search view. They are icon-toggle buttons in dedicated sidebar panels:

- **Live Tools** panel: Case Sensitive (`Aa`), Whole Word (`ab`), Regex (`.*`) — used for ripgrep live searches
- **Session Tools** panel: Case Sensitive (`Aa`), Whole Word (`ab`) — used for Solr session searches

Toggle state is read synchronously at search time and persists across VS Code sessions via webview state.

