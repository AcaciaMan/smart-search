# Smart Search

Intelligent VS Code extension for contextual search with ripgrep, Solr indexing, and AI-powered summaries.

<img alt="Screenshot_ripgrep_stats" src="https://github.com/user-attachments/assets/cacc12b1-2e30-4106-bf02-9c972a81014a" />


## What's New in v2.0.2

v2.0.2 adds a **Health Check** panel so you can diagnose configuration issues at a glance.

| Panel | Purpose |
|-------|---------||
| 🔍 **Search** | Query input and Live / Session mode switcher |
| ⚙️ **Live Tools** | Case, Whole Word, Regex toggles for ripgrep searches |
| 🗄️ **Session Tools** | Case, Whole Word toggles for Solr / Session searches |
| 🕐 **Recent Searches** | Full history + stored sessions in one place |
| 🩺 **Health Check** | Live diagnostic panel — ripgrep & Solr status, Solr index stats, fix suggestions |

See the [Changelog](CHANGELOG.md) for the complete list of changes.


## Features

- **Reorganized Sidebar UI**: Five dedicated panels – Search, Live Tools, Session Tools, Recent Searches, Health Check
- **Health Check panel**: Instant diagnostic view showing ripgrep availability, Solr connectivity, index statistics, and actionable fix suggestions
- **Dual Search Modes**: Live Search (workspace files via ripgrep) and Session Search (stored Solr results)
- **Icon Toggle Toolbars**: Case Sensitive, Whole Word, and Regex controls live in compact icon toolbars in their own sidebar panels, keeping the main search view clean
- **Recent Searches Panel**: Tabbed view showing clickable search history and stored sessions; clicking a history item fills the search box; clicking a session switches to Session mode automatically
- **Multi-Folder Search**: Automatically searches across all workspace folders with intelligent parallel processing
- **Fast Text Search**: Uses ripgrep for lightning-fast text search across your workspace
- **Session-Based Search**: Search within previously stored results for rapid exploration and refinement
- **Interactive Search Settings**: Fine-tune search results with customizable settings panels
  - **Ripgrep Settings**: Adjust context lines, file patterns, and result limits
  - **Solr Settings**: Control result scoring, sorting, file filtering, and session management
- **Intelligent Indexing**: Optional Solr integration for advanced search and indexing capabilities
- **Auto-Suggestions**: Smart query suggestions based on your search history and stored results
- **AI-Powered Summaries**: Get contextual summaries of search results (when enabled)
- **Rich Results**: Interactive search results panel with file navigation
- **Settings Persistence**: Search settings are automatically saved and applied to new searches

<img alt="Screenshot_ripgrep_stats_items" src="https://github.com/user-attachments/assets/5292a1af-c90d-4c9b-a03f-fcc2ca134c78" />


## Installation

1. Install the extension from the VS Code marketplace
2. (Optional) Set up Solr for advanced indexing - see [Configuration Guide](docs/configuration.md)
3. Make sure ripgrep is installed on your system

## Solr Configuration for Enhanced Highlighting

To get the best highlighting experience, configure Solr with optimized settings:

### Quick Setup (Automated)
```bash
# Windows
npm run configure-solr

# Linux/Mac
npm run configure-solr-unix
```

### Manual Setup
See the detailed configuration guide: [SOLR_HIGHLIGHTING_CONFIG.md](SOLR_HIGHLIGHTING_CONFIG.md)

### What You Get:
- **🎯 Advanced highlighting** with phrase and proximity matching
- **📝 Smart snippets** with context-aware fragment generation  
- **⚡ Better performance** with optimized analyzers and field types
- **🎨 Rich visual formatting** with multiple highlighting styles
- **🛡️ XSS protection** with safe HTML rendering

## Usage

### Activity Bar Layout

When you open the Smart Search panel you will see four collapsible sections in the sidebar:

#### 🔍 Search
The main query input. Use the **Live Search** / **Session Search** tabs to switch modes. Press `Enter` or the Search button to execute.

#### ⚙️ Live Tools
Compact icon toolbar for **ripgrep live searches**. Toggles persist across searches.

| Icon | Option | Effect |
|------|--------|--------|
| `Aa` | Case Sensitive | Match exact letter case |
| `ab` | Whole Word | Match complete words only |
| `.*` | Regex | Interpret query as a regular expression |

The status strip at the bottom of this panel shows which filters are currently active (e.g., *Active: Case · .**)

#### 🗄️ Session Tools
Compact icon toolbar for **Session / Solr searches**. Same Case Sensitive and Whole Word toggles (Regex is not applicable to Solr session queries).

#### 🕐 Recent Searches
Tabbed panel with two views:

- **Recent tab** – Full search history. Click any item to load the query into the main search input and bring the Search panel into focus.
- **Sessions tab** – All stored sessions with timestamp and result count. Click a row to select it as the target for Session Search; use the **Search** action button to immediately switch the main view to Session mode for that session.

#### 🩺 Health Check
Live diagnostic panel that checks all external dependencies:

- **Ripgrep status** — detected version, resolved path, or install instructions if not found
- **Solr status** — connectivity, core presence, and live index statistics (document count, deleted docs, index size, last-modified)
- **Actionable suggestions** — OS-specific install commands, Solr start commands, core creation steps, and inline links to open relevant VS Code settings
- Use the **↻ Refresh** button to re-run checks at any time

### Basic Search
- Press `Ctrl+Shift+F` (or `Cmd+Shift+F` on Mac) to open Smart Search
- Choose your search mode (Live or Session)
- Set any toggle options in the Live Tools or Session Tools panel
- Enter your search query and press Enter
- Results will appear in a dedicated panel

### Two Search Modes

#### 🔍 Live Search Mode
- **Purpose**: Search your workspace files in real-time using ripgrep
- **Best for**: Finding content across your entire project
- **Toggle options**: Set in the **Live Tools** panel (Case, Word, Regex)
- **Usage**: Select the "Live Search" tab and enter your query

#### 🗂️ Session Search Mode
- **Purpose**: Search within previously stored search results
- **Best for**: Refining and exploring previous search results
- **Toggle options**: Set in the **Session Tools** panel (Case, Word)
- **Usage**: Select the "Session Search" tab, or click a session in the *Recent Searches* panel

### Session Management
- **Automatic Sessions**: Each Live Search automatically creates a new session
- **Session Selection**: Open the *Recent Searches* panel → *Sessions* tab → click a row
- **Session Info**: The Session mode info bar shows which session is active
- **Recent Activity**: The *Recent Searches* panel shows full history and sessions

### Enhanced Query Syntax

Smart Search supports both simple queries and advanced Solr field-specific queries:

#### Simple Queries (Default)
```text
function          → Searches in configured default fields (content_all, code_all)
"exact phrase"    → Phrase search across default fields
test AND bug      → Boolean search across default fields
```

#### Advanced Field-Specific Queries
```text
file_name:*.js                           → Find JavaScript files
match_text:function AND file_extension:ts → Functions in TypeScript files  
ai_summary:"bug fix"                     → Files with "bug fix" in AI summary
relevance_score:[50 TO *]               → High relevance results only
line_number:[1 TO 100]                  → Results from first 100 lines
file_path:src/services/*.ts             → Files in services directory
search_session_id:session_*             → Results from specific sessions
```

#### Available Search Fields
- **Content Fields**: `content_all`, `code_all`, `match_text`, `full_line`, `ai_summary`
- **File Fields**: `file_name`, `file_path`, `file_extension`  
- **Metadata Fields**: `line_number`, `column_number`, `relevance_score`, `file_size`
- **Session Fields**: `search_session_id`, `original_query`, `search_timestamp`
- **Boolean Fields**: `case_sensitive`, `whole_word`

#### Query Examples
```text
# Find React components
file_name:*Component.tsx

# Find high-value functions  
match_text:function AND relevance_score:[75 TO *]

# Find recent bug fixes
ai_summary:bug AND search_timestamp:[NOW-7DAY TO NOW]

# Find large files with specific content
match_text:import AND file_size:[10000 TO *]

# Complex query combining multiple fields
file_extension:js AND match_text:async AND line_number:[1 TO 50]
```

### Smart Suggestions
The search interface provides intelligent auto-suggestions based on:
- **Session Content**: Terms and phrases from your current search session
- **Search History**: Your recent queries
- **File Names**: Relevant file names and paths
- **Global Terms**: Popular terms across all stored results

### Search Settings
Both ripgrep and Solr result panels include collapsible settings panels for fine-tuning search results:

#### Ripgrep Search Settings (Live Search Mode)
- **Context Lines Before/After**: Control how many lines of context to show around matches (0-100, default: 30)
- **Include/Exclude Files**: Filter results by file patterns (glob patterns, comma-separated)
- **Max Results**: Limit the number of results displayed (1-1000, default: 100)

#### Solr Search Settings (Session Search Mode)
- **Max Results**: Control the maximum number of results returned (1-1000, default: 100)
- **Min Score**: Filter results by minimum relevance score (0-100, default: 0)
- **Sort Order**: Choose how results are sorted (relevance, date, filename, line number)
- **File Types**: Filter by specific file extensions (comma-separated, e.g., "js,ts,py")
- **Exclude Patterns**: Exclude files matching certain patterns (e.g., "test,spec,node_modules")
- **Session Filter**: Search within a specific search session

#### Settings Persistence
All search settings are automatically persisted and will be applied to new searches until manually changed or reset.

### Advanced Features

#### Automatic Session Creation
- Every Live Search automatically creates a new session with stored results
- Sessions are automatically named and timestamped
- Previous sessions remain available for future Session Search

#### Session-Scoped Search
- **Latest Session Priority**: Session Search defaults to your most recent session
- **Session Switching**: Open *Recent Searches* → *Sessions* tab and click any session
- **Session Metadata**: View session details including result count and creation time

### Workspace Indexing
- Use the command palette (`Ctrl+Shift+P`) and run "Smart Search: Index Workspace"
- This will index your workspace for faster searches (requires Solr)

## Key Workflows

### Typical Search Workflow
1. **Start with Live Search**: Use the Live Search tab; set Case/Word/Regex as needed in the **Live Tools** panel
2. **Review Results**: Examine the ripgrep results panel
3. **Refine with Session Search**: Switch to Session Search; adjust options in the **Session Tools** panel
4. **Iterate**: Use the *Recent Searches* panel to reload previous queries or switch sessions
5. **Session Management**: Open *Recent Searches* → *Sessions* tab at any time

### Best Practices
- **Live Tools panel** – toggle Case/Regex before a Live Search to avoid re-running
- **Session Tools panel** – adjust Case/Word for session refinements without losing the active session
- **Recent Searches panel** – keep it open alongside the Search panel for quick navigation
- **Leverage Suggestions** for faster query composition
- **Monitor Session Info** bar to know the scope of your current session search

## Configuration

The extension can be configured through VS Code settings:

- `smart-search.solrUrl`: Solr server URL (default: http://localhost:8983/solr)
- `smart-search.ripgrepPath`: Optional absolute path to a custom `rg` executable; leave empty to use `rg` from the system PATH (default: "")
- `smart-search.enableAISummaries`: Enable AI-powered summaries (default: true)
- `smart-search.maxFiles`: Maximum number of files to return results from (default: 100)
- `smart-search.defaultSolrFields`: Default Solr fields for simple queries (default: "content_all,code_all")
- `smart-search.maxParallelFolders`: Maximum folders for parallel search (default: 5)
- `smart-search.enableDebugLogging`: Enable debug logging for searches (default: false)

### Default Search Fields Configuration

```json
{
  "smart-search.defaultSolrFields": "content_all,code_all,ai_summary"
}
```

### Multi-Folder Search Configuration

```json
{
  "smart-search.maxParallelFolders": 5,
  "smart-search.enableDebugLogging": false
}
```

#### Search Strategy
- **2-5 folders**: Parallel search for optimal performance
- **1 folder or 6+ folders**: Sequential search to avoid system overload
- **Error resilience**: Failed folders don't break the entire search

## Requirements

- VS Code 1.74.0 or higher
- ripgrep (for text search)
- Apache Solr (optional, for advanced indexing)

## Development

See the [Development Guide](docs/development.md) for information on building and contributing to this extension.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

