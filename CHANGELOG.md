# Changelog

All notable changes to the "smart-search" extension will be documented in this file.

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
