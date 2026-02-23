# Smart Search User Guide

## Table of Contents

- [Quick Start](#quick-start)
- [Sidebar Panels](#sidebar-panels)
- [Search Workflow](#search-workflow)
- [Search Options](#search-options)
- [Result Panels](#result-panels)
- [Configuration](#configuration)
- [Tips & Tricks](#tips--tricks)
- [Troubleshooting](#troubleshooting)
- [Available Fields Reference](#available-fields-reference)
- [Support](#support)

---

## Quick Start

1. **Open Smart Search**: Click the Smart Search icon in the Activity Bar
2. **Set Filters**: Toggle Case Sensitive, Whole Word, or Regex in the **Live Tools** or **Session Tools** panel *before* searching
3. **Enter Search**: Type your query in the Search panel and press Enter
4. **View Results**: Results appear in a dedicated panel
5. **Browse History**: Open the **Recent Searches** panel to revisit previous queries and sessions

---

## Sidebar Panels

The Smart Search activity bar has four collapsible panels:

### Search
The main query input with Live / Session mode tabs. This is where you enter your query and launch searches.

### Live Tools
Compact icon toolbar for **ripgrep live searches**:

| Button | Label | Effect |
|--------|-------|--------|
| `Aa` | Case | Match exact letter case |
| `ab` | Word | Match complete words only |
| `.*` | Regex | Treat query as a regular expression |

Toggle state is shown in the status strip at the bottom of the panel (*Active: Case · .*)

### Session Tools
Same compact toolbar for **Session / Solr searches** — Case Sensitive and Whole Word only (Regex is not applicable to Solr queries).

### Recent Searches
Tabbed panel:

- **Recent tab** — Clickable search history list. Click any item to load the query into the Search panel. Use the trash icon to clear history.
- **Sessions tab** — Stored session list showing query, timestamp and result count. Click a row to select it as the target for Session Search. The **Search** action button immediately switches the Search panel to Session mode for that session.

### Config Check
Shows the status of your Solr and ripgrep configuration. Helpful for verifying that Solr is reachable and ripgrep is available.

### Tools View
Provides utility tools for managing live search and session operations.

### Refinement Panel
Search refinement controls for narrowing down results with additional filters.

---

## Search Workflow

Smart Search operates in two modes that work together:

### 1. Live Search (Ripgrep)
Search workspace files directly using ripgrep. This is the default mode.

- Enter a query in the Search panel (Live mode)
- Results appear in the **Ripgrep Results** panel
- A search session is created automatically

### 2. Store Results
After a live search, results can be indexed into Solr for later querying. This creates a persistent session.

### 3. Session Search (Solr)
Query within previously stored results using Solr's advanced capabilities:

- Switch to Session mode in the Search panel
- Select a session from the **Recent Searches > Sessions** tab
- Use field-specific queries, faceting, highlighting, and scoring
- Results appear in the **Solr Results** panel

### 4. Browse Sessions
Use the **Recent Searches** panel to view, compare, and revisit past search sessions.

### Recommended Workflow
1. Open **Live Tools** and set your Case/Word/Regex toggles — they persist across searches
2. Run a **Live Search** to explore code and create a session
3. Open **Session Tools** and set Case/Word as needed
4. Switch to **Session Search** to refine your query within stored results
5. Use the **Recent Searches** panel to reload earlier queries or switch sessions

---

## Search Options

### Live Search Options (set in Live Tools)
- **Case Sensitive** — match exact letter case
- **Whole Word** — match complete words only
- **Regex** — treat query as a regular expression
- **Include patterns** — glob patterns for files to include (e.g. `*.ts`, `src/**`)
- **Exclude patterns** — glob patterns for files to exclude (e.g. `node_modules/**`)

### Session Search Options (set in Session Tools)
- **Case Sensitive** — match exact letter case
- **Whole Word** — match complete words only

### Search Panel Options
- **Query input** — enter search terms or field-specific queries
- **Mode toggle** — switch between Live and Session mode
- **Folder selection** — choose which workspace folders to search (multi-folder support)

---

## Result Panels

Smart Search provides several specialized result panels:

| Panel | Description |
|-------|-------------|
| **Ripgrep Results** | Live search results from ripgrep with highlighted matches |
| **Solr Results** | Stored session search results with Solr highlighting and scoring |
| **File List** | File-centric view of search results |
| **File Statistics** | Per-file match statistics (match counts, relevance) |
| **Statistics** | Aggregated overview statistics across all results |
| **Statistics Item Results** | Drill-down view for individual statistic items |

---

## Configuration

Access settings via VS Code Settings (`Ctrl+,`) and search for "Smart Search":

| Setting | Default | Description |
|---------|---------|-------------|
| `smart-search.solrUrl` | `http://localhost:8983/solr` | Solr server URL for indexing and session queries |
| `smart-search.maxFiles` | `100` | Maximum number of files in search results (0 = no limit) |
| `smart-search.defaultSolrFields` | `content_all,code_all` | Default Solr fields to search (comma-separated). Users can still use field-specific syntax like `file_name:*.js` |
| `smart-search.maxParallelFolders` | `5` | Maximum workspace folders to search in parallel (1–10). Higher values may use more resources |
| `smart-search.enableDebugLogging` | `false` | Enable debug logging for multi-folder search operations |
| `smart-search.ripgrepPath` | *(empty)* | Full path to a custom ripgrep executable. Leave empty to use `rg` from your system PATH |
| `smart-search.filters.globalFilters` | `[]` | Named search filter presets available across all workspaces |
| `smart-search.filters.workspaceFilters` | `[]` | Named search filter presets scoped to the current workspace |

Example `settings.json`:
```json
{
  "smart-search.solrUrl": "http://localhost:8983/solr",
  "smart-search.maxFiles": 200,
  "smart-search.defaultSolrFields": "content_all,code_all",
  "smart-search.maxParallelFolders": 3
}
```

---

## Tips & Tricks

### Performance
1. **Use specific fields** for faster session searches
2. **Limit results** with a reasonable `maxFiles` value
3. **Use ranges** for numeric filtering (e.g. `relevance_score:[50 TO *]`)
4. **Start narrow** then broaden if needed

### Accuracy
1. **Use quotes** for exact phrases (`"async function"`)
2. **Combine fields** for precise targeting
3. **Use boolean operators** (AND, OR, NOT)
4. **Test incrementally** when building complex queries

---

## Troubleshooting

### No Results
- Check spelling and try simpler terms
- Remove field restrictions
- For session searches, check if Solr is running (see Config Check panel)
- Try wildcard patterns (`*test*`)

### Too Many Results
- Add field filters (e.g. `file_extension:ts`)
- Increase relevance threshold (`relevance_score:[50 TO *]`)
- Use more specific terms
- Add boolean operators (`AND`, `NOT`)

### Slow Searches
- Reduce `smart-search.maxFiles` in settings
- Use more specific field queries
- Avoid very broad wildcard searches
- Check Solr performance for session queries

---

## Available Fields Reference

These fields are available for field-specific queries in **Session Search** mode:

| Field | Type | Description |
|-------|------|-------------|
| `content_all` | text_general | Combined searchable content (copy field target) |
| `code_all` | text_code | Code-optimized combined search field |
| `match_text` | text_general | The matched text content |
| `full_line` | text_code | Complete line containing the match |
| `file_name` | string | File name |
| `file_path` | string | Full file path |
| `file_extension` | string | File extension |
| `original_query` | text_general | The original search query |
| `search_session_id` | string | Session identifier |
| `line_number` | int | Line number of the match |
| `column_number` | int | Column number of the match |
| `relevance_score` | long | Relevance score (0–100) |
| `match_count_in_file` | int | Number of matches in the same file |
| `case_sensitive` | boolean | Whether search was case-sensitive |
| `whole_word` | boolean | Whether whole-word matching was used |
| `search_timestamp` | date | When the search was performed |
| `file_size` | long | File size in bytes |
| `file_modified` | date | File last-modified date |
| `display_content` | text_display | Formatted content for highlighting display |

For complete query syntax, examples, and advanced field usage, see the [Query Guide](QUERY_GUIDE.md).

---

## Support

- **Query syntax**: See the [Query Guide](QUERY_GUIDE.md) for field-specific queries, ranges, wildcards, and boolean operators
- **Setup help**: See the [Configuration Guide](configuration.md)
- **Issues**: Report problems via [GitHub Issues](https://github.com/AcaciaMan/smart-search/issues)
