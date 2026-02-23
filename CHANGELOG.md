# Changelog

All notable changes to the "smart-search" extension will be documented in this file.

## [2.1.1] - 2026-02-23

### Fixed
- **XSS vulnerability in client-side highlight fallback** — `HighlightService.highlightText()` now HTML-escapes the raw source-code text before inserting `<mark>` tags. A private `escapeHtml()` helper is used for both the content and the search term (so that queries containing `<`, `>`, `&`, etc. still match correctly against the escaped text). Solr-highlighted paths, which return pre-tagged HTML, are unaffected.
- **`match_count_in_file` always stored as `1`** — `IndexManager.storeSearchResults()` now pre-computes a `file → count` map before building Solr documents, so each stored result carries the true number of matches from that file in the current search session. The field is already indexed and queryable (`match_count_in_file:[5 TO *]`); no schema changes were needed.

### Removed
- **AI Summaries stub** — removed the `AISummaryService` class and all references (`src/services/aiSummaryService.ts` deleted, export removed from `src/services/index.ts`, field and constructor removed from `SmartSearchProvider`). The `smart-search.enableAISummaries` configuration property, its `"ai"` / `"summaries"` keywords, and all marketing copy referencing AI-powered summaries have been removed from `package.json`, `README.md`, and `docs/configuration.md`. The `summary?: string` field is removed from the `SearchResult` type and all rendering paths. The Solr schema fields `ai_summary` / `ai_tags` are intentionally retained for future integrations.

---

## [2.1.0] - 2026-02-23

### Added
- **Named search filter presets** — save and reuse include/exclude glob configurations across searches
  - `smart-search.filters.globalFilters` (application-scoped) and `smart-search.filters.workspaceFilters` (resource-scoped) configuration keys store presets as JSON arrays
  - `SearchFilterPreset` shape: `name`, `includeGlobs`, `excludeGlobs`, `customIncludeGlobs`, `customExcludeGlobs`, `description`
- **Command: Save Current Search as Filter** (`smart-search.saveCurrentSearchAsFilter`) — saves the active glob state as a named preset; prompts for name and scope (Global / Workspace); handles name conflicts with Overwrite / Choose another name
- **Command: Choose Search Filter** (`smart-search.chooseFilterForCurrentSearch`) — QuickPick showing all saved presets grouped by scope with a glob preview; pre-selects the currently active filter; "None" clears the active filter
- **Command: Open Search Refinement Panel** (`smart-search.openRefinementPanel`) — full-featured editor panel for visually composing glob filters:
  - **Left pane**: workspace folder/extension tree with tristate include/exclude/neutral buttons per node
  - **Right pane**: include and exclude chip rows (custom globs shown with dashed border), custom glob text areas, live effective-globs list, ripgrep flags `<pre>` preview
  - **Test globs with ripgrep**: spawns `rg --files` with the composed globs, 8-second timeout, shows up to 20 matched file paths in a result banner; highlights the offending custom-glob textarea on errors
  - **Apply & Re-run**: pushes the refined glob state back to the Search view and re-runs the last query
  - **Save as filter…**: delegates to `smart-search.saveCurrentSearchAsFilter`
- **Live Tools toolbar shortcuts** — two new action buttons added after the `F#` toggle (live mode only):
  - `⋮ Filter` — opens the Choose Search Filter QuickPick
  - `⋱ Refine` — opens the Search Refinement Panel
- **`CurrentSearchGlobs` type** — tracks active include/exclude/custom glob arrays and an optional active filter name/scope; attached to `SearchOptions.currentGlobs`
- **Glob resolver** (`resolveActiveFilterGlobs`) — merges preset globs with session custom globs, deduplicates (first-occurrence), falls back gracefully if the named preset is not found
- **In-memory preset cache** — the preset service caches per-scope filter lists; cache is invalidated on every create/update/delete and re-populated from VS Code configuration on next access

### Fixed
- `performSearch` now passes `currentGlobs` into `SearchOptions` so the glob state set in the Refinement Panel is actually applied to ripgrep; previously the glob state was stored but silently ignored during search execution

---

## [2.0.2] - 2026-02-21

### Added
- **Health Check sidebar view** (`$(pulse)` icon in the Smart Search activity bar) — a live diagnostic panel that checks the status of all external services and configuration at a glance:
  - **Ripgrep check**: detects whether `rg` is available on the system PATH (or a custom path), reports the installed version, and suggests OS-specific install commands when not found
  - **Solr check**: connects to the configured Solr URL, checks whether the `smart-search-results` core exists, and reports live index statistics:
    - Document count, deleted document count, and index size (human-readable)
    - Last-modified timestamp of the index
  - **Actionable suggestions**: context-aware tips shown for each failed check — install commands for ripgrep (`winget`, `choco`, `brew`, `cargo`), Solr start commands, core creation instructions, and a link to optimize the index when deleted-doc ratio is high
  - **Open Settings** inline links that jump directly to `smart-search.solrUrl` or `smart-search.ripgrepPath` in VS Code settings
  - **↻ Refresh** button to re-run checks on demand; spinner shown while checks are in progress
- **`smart-search.ripgrepPath` setting** — optional absolute path to a custom ripgrep executable; leave empty to use `rg` from the system PATH

---

## [2.0.1] - 2026-02-20

### Added
- **File Statistics Search mode** (`F#` toggle in Live Tools) — when active, the next Live Search runs a files-only ripgrep pass (`rg --count`) and opens a **File Search Statistics** panel instead of the standard results panel. The panel displays:
  - Summary cards: total files, total matches, average matches per file
  - Six analytics sections: Top Folders, Top File Extensions, Top File Names, Top Prefixes, Top Suffixes, Recent Modifications
- **Filter-by-analytics** — clicking any row in the six analytics sections instantly filters the *All Matched Files* list to show only matching files. An active filter is highlighted in the analytics row and displayed as a dismissible pill in the file list header. Clicking the same row again clears the filter.
- **File selection & File List panel** — the *All Matched Files* section supports per-file checkboxes, Select All (respects current filter), Clear, and an *Open Selected Files ↗* button that opens a dedicated **File List** editor tab. Each row in the File List is clickable and opens the file directly in the editor.

### Changed
- *Select All* in the file selection section now selects only the currently visible (filtered) files, not the entire result set
- *Clear* deselects only the currently visible files; selections outside the current filter are preserved

---

## [2.0.0] - 2026-02-19

### Added
- **Recent Searches sidebar view** – a dedicated panel with two tabs:
  - *Recent* tab: full search history with clickable items and a clear button
  - *Sessions* tab: stored session list showing query, timestamp, and result count; refresh button; "Search" action per session
- **Live Tools sidebar view** – compact icon-toggle toolbar for live ripgrep searches with three toggles:
  - `Aa` — Case Sensitive
  - `ab` — Whole Word
  - `.*` — Use Regular Expression
- **Session Tools sidebar view** – compact icon-toggle toolbar for Session / Solr searches with two toggles:
  - `Aa` — Case Sensitive
  - `ab` — Whole Word
- **Cross-panel communication** – selecting a history query fills the main search input; selecting a session from the Recent panel automatically switches the Search view to Session mode

### Changed
- **BREAKING UI**: The checkboxes for Case Sensitive, Whole Word, and Regex have been moved out of the main Search view into the new dedicated *Live Tools* and *Session Tools* sidebar views
- **BREAKING UI**: The "Manage Sessions" button has been removed from the Search view; session management is now entirely in the *Recent Searches* panel
- The "Change" button in session mode now opens the *Recent Searches* panel instead of an inline list
- Activity bar now contains four distinct sections: **Search**, **Live Tools**, **Session Tools**, **Recent Searches**
- Toggle option state is held in-memory per provider and read synchronously at search time — no round-trip to the webview

### Removed
- Inline search history list from the main Search view (moved to *Recent Searches* panel)
- Inline session list from the main Search view (moved to *Recent Searches* panel)
- "Manage Sessions" button

---

## [1.1.1] - 2025-xx-xx

### Added
- Session-based search mode (search within previously stored ripgrep results via Solr)
- Auto-suggestions powered by session content and global index
- Settings persistence — ripgrep and Solr panel settings are remembered across searches
- Session info bar in Session Search mode showing active session ID
- "Manage Sessions" inline list in the Search sidebar
- Ripgrep results panel with collapsible settings (context lines, file patterns, max results)
- Solr results panel with collapsible settings (score threshold, file type filter, sort order)

### Changed
- Search view redesigned with two-tab mode switcher (Live Search / Session Search)
- Enhanced relevance scoring (0.5–1.0 range) with file type awareness and match quality bonuses
- Multi-folder search uses intelligent parallel/sequential strategy

---

## [1.0.0] - 2025-xx-xx

### Added
- Dual search modes: Live Search (ripgrep) and Session Search (Solr)
- Multi-folder workspace search with parallel processing
- Fast text search using ripgrep with file-based limiting
- Configurable search options (case sensitivity, regex, whole word)
- Webview-based results panel with file navigation and grouping
- Fallback from Solr to ripgrep search
- Smart file selection prioritizing complete match sets
- Context-aware search results
- AI-powered search result summaries
- Enhanced query syntax with Solr field-specific queries
- Statistics panel

### Changed
- **BREAKING**: Replaced `maxResults` configuration with `maxFiles` for better search experience
- UI groups results by file to reduce repetitive file headers

---

## [0.0.1] - 2025-07-31

### Added
- Initial project structure
- Core extension framework
- Basic search providers and services
- Configuration options
- Documentation
