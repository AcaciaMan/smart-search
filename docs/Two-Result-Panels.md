# Two Result Panels Implementation

## Overview

The Smart Search extension now has two distinct result panels to handle different types of search results:

1. **RipgrepResultsPanel** - Displays fresh ripgrep search results
2. **SolrResultsPanel** - Displays results from searching within stored/indexed results

## Architecture Changes

### Base Class: `BaseResultsPanel`
- **Location**: `src/panels/baseResultsPanel.ts`
- **Purpose**: Shared functionality for both result panels
- **Key Features**:
  - File opening with path normalization
  - Common webview management
  - Shared styling and JavaScript functionality
  - Message handling for file navigation

### Ripgrep Results Panel
- **Location**: `src/panels/ripgrepResultsPanel.ts`
- **Purpose**: Display direct ripgrep search results
- **Features**:
  - **Badge**: Green "RIPGREP" badge for visual identification
  - **Query Display**: Shows the original search query
  - **Context Display**: Shows file context lines around matches
  - **Match Highlighting**: Highlights matched text within context
  - **File Navigation**: Click to open files at specific lines/columns
  - **AI Summaries**: Displays AI-generated summaries when available

### Solr Results Panel
- **Location**: `src/panels/solrResultsPanel.ts`
- **Purpose**: Display results from searching within stored sessions
- **Features**:
  - **Badge**: Orange "SOLR" badge for visual identification
  - **Session Context**: Shows which session results are from
  - **Rich Metadata**:
    - Relevance score
    - Original query that created the result
    - File size and modification date
    - Search session ID
  - **AI Tags**: Displays AI-generated tags for categorization
  - **Enhanced Context**: Shows context before/after with proper line numbers

## Commands Added

### Package.json Updates
```json
{
  "command": "smart-search.showRipgrepResults",
  "title": "Show Ripgrep Results",
  "category": "Smart Search",
  "icon": "$(search-view)"
},
{
  "command": "smart-search.showSolrResults", 
  "title": "Show Solr Results",
  "category": "Smart Search",
  "icon": "$(database)"
}
```

## Integration Points

### Extension.ts Changes
- **Ripgrep Search**: Uses `RipgrepResultsPanel` for main search command
- **Solr Search**: New command `smart-search.showSolrResults` uses `SolrResultsPanel`
- **Automatic Panel Management**: Reuses existing panels or creates new ones as needed

### SmartSearchViewProvider Changes  
- **Smart Panel Selection**: Automatically chooses the right panel based on search type
  - `searchInResults: false` → `RipgrepResultsPanel`
  - `searchInResults: true` → `SolrResultsPanel`
- **Session Context**: Passes session ID to Solr panel for filtering

### IndexManager Enhancements
- **New Method**: `searchStoredResultsDetailed()` returns full `StoredSearchResult` objects
- **Existing Method**: `searchStoredResults()` still available for `SearchResult` compatibility
- **Rich Data**: Solr searches now return complete metadata for enhanced display

## Visual Differences

### Ripgrep Panel
```
┌─────────────────────────────────────┐
│ [RIPGREP] Search Results            │
│ Query: "function search"            │  
│ Found 15 results                    │
├─────────────────────────────────────┤
│📄 src/search.ts          Line 42   │
│   41: export class SearchService   │
│   42: function search() {           │ ← highlighted
│   43:   return results;            │
└─────────────────────────────────────┘
```

### Solr Panel  
```
┌─────────────────────────────────────┐
│ [SOLR] Search Results               │
│ Session: search_20250803_14:30:15   │
│ Query: "function"                   │
│ Found 8 results                     │
├─────────────────────────────────────┤
│ 📄 src/search.ts          Line 42   │
│   42: function search() {           │ ← highlighted  
│ Score: 95.2 | Session: abc123       │
│ Original: "search function" | 2KB   │
│ [typescript] [utility] [search]     │ ← AI tags
└─────────────────────────────────────┘
```

## Benefits

### User Experience
- **Clear Visual Distinction**: Different badges and colors help users understand result sources
- **Contextual Information**: Solr results show richer metadata for better context
- **Efficient Navigation**: Both panels support direct file opening with line/column precision

### Developer Experience
- **Separation of Concerns**: Each panel handles its specific result type
- **Extensible Architecture**: Base class makes adding new panel types easy
- **Type Safety**: Strong typing ensures correct data flow between services and panels

### Performance
- **Lazy Loading**: Panels are created only when needed
- **Memory Efficiency**: Reuses existing panels instead of creating duplicates
- **Fast Rendering**: Optimized HTML generation for both panel types

## Usage Workflow

1. **Initial Search**: User performs ripgrep search → `RipgrepResultsPanel` displays results
2. **Results Indexing**: Ripgrep results are automatically stored in Solr
3. **Session Search**: User searches within stored results → `SolrResultsPanel` displays enriched results
4. **File Navigation**: Clicking any result opens the file at the correct location

The two-panel system provides a clear distinction between fresh search results and indexed historical results, while maintaining consistent navigation and file opening functionality across both interfaces.
