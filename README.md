# Smart Search

Intelligent VS Code extension for contextual search with ripgrep, Solr indexing, and AI-powered summaries.

<img alt="Screenshot_improved" src="https://github.com/user-attachments/assets/3686134a-eaa2-463e-9e21-fbb4e45c0525" />

## Features

- **Dual Search Modes**: Choose between Live Search (workspace files) and Session Search (stored results)
- **Fast Text Search**: Uses ripgrep for lightning-fast text search across your workspace
- **Session-Based Search**: Search within previously stored results for rapid exploration and refinement
- **Interactive Search Settings**: Fine-tune search results with customizable settings panels
  - **Ripgrep Settings**: Adjust context lines, file patterns, and result limits
  - **Solr Settings**: Control result scoring, sorting, file filtering, and session management
- **Intelligent Indexing**: Optional Solr integration for advanced search and indexing capabilities
- **Auto-Suggestions**: Smart query suggestions based on your search history and stored results
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

### Two Search Modes

Smart Search offers two distinct search modes for different use cases:

#### 🔍 Live Search Mode
- **Purpose**: Search your workspace files in real-time using ripgrep
- **Best for**: Finding content across your entire project
- **Features**: 
  - Lightning-fast file search
  - Results are automatically stored for future reference
  - Full workspace coverage
- **Usage**: Select the "Live Search" tab and enter your query

#### 🗂️ Session Search Mode  
- **Purpose**: Search within previously stored search results
- **Best for**: Refining and exploring previous search results
- **Features**:
  - Instant results (no file system scanning)
  - Search within specific search sessions
  - Perfect for iterative exploration
- **Usage**: Select the "Session Search" tab to search within stored results

### Basic Search
- Press `Ctrl+Shift+F` (or `Cmd+Shift+F` on Mac) to open Smart Search
- Choose your search mode (Live or Session)
- Enter your search query and press Enter
- Results will appear in a dedicated panel

### Session Management
- **Automatic Sessions**: Each Live Search automatically creates a new session
- **Session Selection**: In Session Search mode, click "Change" to select a different session
- **Session Info**: The interface shows which session you're searching and how many results it contains
- **Recent Activity**: View and access your recent searches and sessions

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

### Smart Suggestions
The search interface provides intelligent auto-suggestions based on:
- **Session Content**: Terms and phrases from your current search session
- **Search History**: Your recent queries
- **File Names**: Relevant file names and paths
- **Global Terms**: Popular terms across all stored results

### User Interface Features

#### Modern Two-Mode Interface
- **Tab-Based Mode Selection**: Clearly distinguish between Live and Session search
- **Visual Feedback**: Different styling and icons for each search mode
- **Session Info Bar**: Shows which session you're searching in Session mode
- **Contextual Help**: Mode-specific workflow guidance

#### Enhanced Search Options
- **Organized Settings**: Search options grouped by relevance (Text Matching, Search Mode)
- **Smart Defaults**: Session-relevant options are highlighted when appropriate
- **Visual States**: Clear indication of active search mode and settings

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
- **Session Switching**: Easily switch between different stored sessions
- **Session Metadata**: View session details including result count and creation time

### Workspace Indexing
- Use the command palette (`Ctrl+Shift+P`) and run "Smart Search: Index Workspace"
- This will index your workspace for faster searches (requires Solr)

## Key Workflows

### Typical Search Workflow
1. **Start with Live Search**: Use Live Search mode to find content across your workspace
2. **Review Results**: Examine the search results and stored session information
3. **Refine with Session Search**: Switch to Session Search mode to drill down within the results
4. **Iterate**: Use Session Search to explore different aspects of your findings
5. **Session Management**: Access previous sessions through the "Manage Sessions" button

### Best Practices
- **Use Live Search** for broad discovery across your entire workspace
- **Use Session Search** for focused exploration and refinement
- **Leverage Suggestions** for faster query composition
- **Organize Sessions** by keeping related searches in the same session
- **Monitor Session Info** to understand the scope of your current search

## Configuration

The extension can be configured through VS Code settings:

- `smart-search.solrUrl`: Solr server URL (default: http://localhost:8983/solr)
- `smart-search.enableAISummaries`: Enable AI-powered summaries (default: true)
- `smart-search.maxResults`: Maximum number of search results (default: 100)
- `smart-search.defaultSolrFields`: Default Solr fields for simple queries (default: "content_all,code_all")

### Search Mode Configuration

The extension automatically manages search modes, but you can influence behavior through:

- **Session Management**: Sessions are automatically created and managed
- **Default Search Scope**: Live Search is the default for new queries
- **Session Retention**: Previous sessions are kept available for future use
- **Auto-Suggestions**: Powered by session content and search history

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
