# Smart Search Results - Solr Schema

This directory contains the Solr configuration for storing and searching ripgrep results from the Smart Search VS Code extension.

## Schema Overview

The schema is designed to efficiently store and search ripgrep output with the following key features:

### Core Fields

- **Search Session**: `search_session_id`, `original_query`, `search_timestamp`, `workspace_path`
- **File Information**: `file_path`, `file_name`, `file_extension`, `file_size`, `file_modified`
- **Match Details**: `line_number`, `column_number`, `match_text`, `full_line`
- **Context**: `context_before`, `context_after` with configurable line counts
- **Metadata**: `match_type`, `case_sensitive`, `whole_word`, `relevance_score`
- **AI Enhancement**: `ai_summary`, `ai_tags` for AI-powered summaries

### Field Types

1. **text_general**: Standard text analysis with case-insensitive tokenization (no stopwords - all words are important in code)
2. **text_code**: Programming-aware tokenization with camelCase/snake_case handling
3. **string**: Exact match fields for filtering and faceting
4. **pint/plong/pdate**: Numeric and date fields for sorting and range queries

### Design Decisions

- **No Stopwords**: Unlike traditional text search, code search preserves all words since terms like "a", "an", "in", "for" can be significant in programming contexts (variable names, language keywords, etc.)
- **Case Insensitive**: Searches work regardless of case while preserving original casing in storage
- **Programming Tokenization**: Special handling for camelCase, snake_case, and other programming conventions

### Search Handlers

- `/search`: Main search with relevance ranking and highlighting
- `/search-session`: Search within a specific session
- `/select`: Standard Solr search handler

## Setup Instructions

### 1. Copy Configuration to Solr

```bash
# Linux/Mac: Copy the configuration to Solr configsets directory
cp -r solr/smart-search-results /path/to/solr/server/solr/configsets/

# Windows PowerShell: Copy to configsets directory
Copy-Item -Path "solr\smart-search-results" -Destination "C:\Tools\solr-8.11.1\server\solr\configsets\" -Recurse

# Windows PowerShell: Force overwrite existing configset
Remove-Item -Path "C:\Tools\solr-8.11.1\server\solr\configsets\smart-search-results" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Path "solr\smart-search-results" -Destination "C:\Tools\solr-8.11.1\server\solr\configsets\" -Recurse

# Alternative: Copy to cores directory (if not using configsets)
Copy-Item -Path "solr\smart-search-results" -Destination "C:\Tools\solr-8.11.1\server\solr\" -Recurse
```

### 2. Create the Core

```bash
# Method 1: Using configset (recommended)
curl "http://localhost:8983/solr/admin/cores?action=CREATE&name=smart-search-results&configSet=smart-search-results"

# Method 2: Using instance directory
curl "http://localhost:8983/solr/admin/cores?action=CREATE&name=smart-search-results&instanceDir=smart-search-results"

# Method 3: Using Solr CLI
bin/solr create_core -c smart-search-results -d smart-search-results
```

### 3. Verify Setup

```bash
# Check core status
curl "http://localhost:8983/solr/smart-search-results/admin/ping"

# Test empty query
curl "http://localhost:8983/solr/smart-search-results/select?q=*:*"
```

## Troubleshooting

### Common Issues

1. **ConfigRequestHandler Error (Solr 8.x)**
   - The configuration has been simplified to work with Solr 8.11.1
   - Removed deprecated handlers and circuit breakers

2. **Directory Already Exists**
   ```powershell
   # Windows: Remove existing configset and recreate
   Remove-Item -Path "C:\Tools\solr-8.11.1\server\solr\configsets\smart-search-results" -Recurse -Force -ErrorAction SilentlyContinue
   Copy-Item -Path "solr\smart-search-results" -Destination "C:\Tools\solr-8.11.1\server\solr\configsets\" -Recurse
   ```

3. **Core Creation Errors**
   ```bash
   # Delete existing core if needed
   curl "http://localhost:8983/solr/admin/cores?action=UNLOAD&core=smart-search-results&deleteIndex=true&deleteDataDir=true&deleteInstanceDir=true"
   
   # Recreate core
   curl "http://localhost:8983/solr/admin/cores?action=CREATE&name=smart-search-results&configSet=smart-search-results"
   ```

## Example Documents

Here's how ripgrep results are stored:

```json
{
  "id": "session123_file1_line42",
  "search_session_id": "session123",
  "original_query": "function search",
  "search_timestamp": "2025-08-01T10:30:00Z",
  "workspace_path": "/path/to/workspace",
  "file_path": "/path/to/workspace/src/search.ts",
  "file_name": "search.ts",
  "file_extension": "ts",
  "line_number": 42,
  "column_number": 8,
  "match_text": "function search(query: string)",
  "match_text_raw": "function search(query: string)",
  "full_line": "export function search(query: string): Promise<SearchResult[]> {",
  "full_line_raw": "export function search(query: string): Promise<SearchResult[]> {",
  "context_before": [
    "import { SearchResult } from './types';",
    "",
    "// Main search function"
  ],
  "context_after": [
    "  const results = [];",
    "  // Implementation...",
    "  return results;"
  ],
  "context_lines_before": 3,
  "context_lines_after": 3,
  "match_type": "literal",
  "case_sensitive": false,
  "whole_word": false,
  "relevance_score": 95,
  "match_count_in_file": 3
}
```

## Search Examples

### Basic Search
```bash
curl "http://localhost:8983/solr/smart-search-results/search?q=function"
```

### Search with Filters
```bash
curl "http://localhost:8983/solr/smart-search-results/search?q=search&fq=file_extension:ts&fq=search_session_id:session123"
```

### Search in Session
```bash
curl "http://localhost:8983/solr/smart-search-results/search-session?q=error&fq=search_session_id:session123"
```

### Faceted Search
```bash
curl "http://localhost:8983/solr/smart-search-results/search?q=*:*&facet=true&facet.field=file_extension&facet.field=search_session_id"
```

## Performance Tuning

- **Memory**: Adjust `ramBufferSizeMB` in solrconfig.xml based on available RAM
- **Cache**: Tune cache sizes for your usage patterns
- **Commits**: Adjust autoCommit timing for your update frequency
- **Faceting**: Add more facet fields as needed for filtering

## Maintenance

### Cleanup Old Sessions
```bash
# Delete sessions older than 30 days
curl "http://localhost:8983/solr/smart-search-results/update?commit=true" -H "Content-Type: text/xml" --data-binary '<delete><query>search_timestamp:[* TO NOW-30DAYS]</query></delete>'
```

### Optimize Index
```bash
curl "http://localhost:8983/solr/smart-search-results/update?optimize=true"
```
