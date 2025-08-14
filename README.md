# Smart Search

Intelligent VS Code extension for contextual search with ripgrep, Solr indexing, and AI-powered summaries.

## Features

- **Fast Text Search**: Uses ripgrep for lightning-fast text search across your workspace
- **Interactive Search Settings**: Fine-tune search results with customizable settings panels
  - **Ripgrep Settings**: Adjust context lines, file patterns, and result limits
  - **Solr Settings**: Control result scoring, sorting, file filtering, and session management
- **Intelligent Indexing**: Optional Solr integration for advanced search and indexing capabilities
- **AI-Powered Summaries**: Get contextual summaries of search results (when enabled)
- **Symbol Search**: Find functions, classes, and other code symbols quickly
- **Rich Results**: Interactive search results panel with file navigation
- **Settings Persistence**: Search settings are automatically saved and applied to new searches

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

### Basic Search
- Press `Ctrl+Shift+F` (or `Cmd+Shift+F` on Mac) to open Smart Search
- Enter your search query and press Enter
- Results will appear in a dedicated panel

### Enhanced Query Syntax (New!)

Smart Search now supports both simple queries and advanced Solr field-specific queries:

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

### Search Settings
Both ripgrep and Solr result panels include collapsible settings panels for fine-tuning search results:

#### Ripgrep Search Settings
- **Context Lines Before/After**: Control how many lines of context to show around matches (0-100, default: 30)
- **Include/Exclude Files**: Filter results by file patterns (glob patterns, comma-separated)
- **Max Results**: Limit the number of results displayed (1-1000, default: 100)

#### Solr Search Settings  
- **Max Results**: Control the maximum number of results returned (1-1000, default: 100)
- **Min Score**: Filter results by minimum relevance score (0-100, default: 0)
- **Sort Order**: Choose how results are sorted (relevance, date, filename, line number)
- **File Types**: Filter by specific file extensions (comma-separated, e.g., "js,ts,py")
- **Exclude Patterns**: Exclude files matching certain patterns (e.g., "test,spec,node_modules")
- **Session Filter**: Search within a specific search session

#### Settings Persistence
All search settings are automatically persisted and will be applied to new searches until manually changed or reset.

### Advanced Search
- **Search in Results**: Enable "Search in Results" mode to search within previously indexed ripgrep results
- **Session Management**: When using Solr, each search creates a session that can be filtered and searched separately

### Workspace Indexing
- Use the command palette (`Ctrl+Shift+P`) and run "Smart Search: Index Workspace"
- This will index your workspace for faster searches (requires Solr)

## Configuration

The extension can be configured through VS Code settings:

- `smart-search.solrUrl`: Solr server URL (default: http://localhost:8983/solr)
- `smart-search.enableAISummaries`: Enable AI-powered summaries (default: true)
- `smart-search.maxResults`: Maximum number of search results (default: 100)
- `smart-search.defaultSolrFields`: Default Solr fields for simple queries (default: "content_all,code_all")

### Default Search Fields Configuration

You can customize which fields are searched by default for simple queries:

```json
{
  "smart-search.defaultSolrFields": "content_all,code_all,ai_summary"
}
```

**Examples:**
- `"content_all"` - Search only in content
- `"content_all,code_all"` - Search in content and code (default)  
- `"match_text,file_name,file_path"` - Search in specific fields only
- `"content_all,code_all,ai_summary"` - Include AI summaries in default search

## Requirements

- VS Code 1.74.0 or higher
- ripgrep (for text search)
- Apache Solr (optional, for advanced indexing)

## Development

See the [Development Guide](docs/development.md) for information on building and contributing to this extension.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
