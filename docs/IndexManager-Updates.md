# IndexManager Updates for New Solr Schema

## Overview
The IndexManager has been completely updated to work with the new comprehensive Solr schema for storing ripgrep search results.

## Key Changes

### 1. Updated Data Types
- **StoredSearchResult**: Completely redesigned to match new schema fields
- Added comprehensive metadata: file info, search context, AI summaries, etc.
- Changed from simple timestamp to ISO 8601 format for Solr compatibility

### 2. Enhanced Storage (`storeSearchResults`)
- **Session Management**: Each search creates a unique session ID
- **Rich Metadata**: Stores file size, modification date, workspace path
- **Context Splitting**: Separates context into before/after arrays
- **Search Options**: Preserves case sensitivity, regex mode, etc.
- **AI Integration**: Stores AI summaries and generated tags

### 3. Improved Search (`searchStoredResults`)
- **Schema-Aware Queries**: Uses `content_all` and `code_all` combined fields
- **Session Filtering**: Can search within specific sessions
- **Better Highlighting**: Uses proper Solr field mappings
- **Relevance Scoring**: Proper score conversion and sorting

### 4. New Management Features
- **`getSearchSessions()`**: Get detailed session information
- **`searchInSession()`**: Search within a specific session
- **`cleanupOldSessions()`**: Remove old data automatically

## Field Mappings

| Old Field | New Schema Field | Description |
|-----------|------------------|-------------|
| `file` | `file_path` | Full path to file |
| `line` | `line_number` | Line number |
| `column` | `column_number` | Column number |
| `content` | `match_text` | Matched text content |
| `context` | `context_before` + `context_after` | Split context arrays |
| `score` | `relevance_score` | Integer score (0-100) |
| `timestamp` | `search_timestamp` | ISO 8601 format |
| `originalQuery` | `original_query` | Snake case naming |

## New Features

### Session-Based Search
```typescript
// Store results and get session ID
const sessionId = await indexManager.storeSearchResults(results, query, options);

// Search within specific session
const sessionResults = await indexManager.searchStoredResults(searchOptions, sessionId);
```

### Rich Metadata Storage
- File extension for filtering
- File size and modification date
- Workspace path context
- Case sensitivity and regex mode preservation
- AI summary and tags

### Better Search Capabilities
- Uses combined content fields for better relevance
- Proper highlighting with Solr markup
- Faceted search by file type, session, etc.
- Advanced filtering by search options

## Usage Examples

### Basic Search and Store
```typescript
const results = await ripgrepSearcher.search(options);
const sessionId = await indexManager.storeSearchResults(results, query, options);
```

### Search in Stored Results
```typescript
const storedResults = await indexManager.searchStoredResults({
  query: "error handling",
  maxFiles: 50
});
```

### Session Management
```typescript
const sessions = await indexManager.getSearchSessions();
// Returns: [{ sessionId, query, timestamp, resultCount }, ...]

const sessionResults = await indexManager.searchStoredResults(options, sessionId);
```

### Cleanup
```typescript
await indexManager.cleanupOldSessions(30); // Remove sessions older than 30 days
```

## Benefits

1. **Comprehensive Metadata**: Rich context for better search and filtering
2. **Session Management**: Track and organize search history
3. **Better Performance**: Optimized Solr queries with proper field usage
4. **AI Integration**: Support for AI summaries and tagging
5. **Maintainability**: Automated cleanup and session management
6. **Flexibility**: Support for various search modes and filtering options

The IndexManager now provides a robust foundation for the ripgrep-first architecture with comprehensive Solr integration!
