# Smart Search Query Guide

This guide covers the enhanced query syntax available in Smart Search, supporting both simple searches and advanced Solr field-specific queries.

## Query Types

### Simple Queries (Recommended for Most Users)

Simple queries search across configured default fields automatically. No special syntax required.

```text
function                    # Search for "function" in default fields
"exact phrase search"       # Search for exact phrase
test AND bug               # Boolean AND search  
error OR exception         # Boolean OR search
NOT deprecated             # Boolean NOT search
```

**Default Fields**: `content_all`, `code_all` (configurable via `smart-search.defaultSolrFields`)

### Advanced Field-Specific Queries

Power users can specify exact Solr fields to search in using `field:value` syntax.

## Available Fields

### Content Fields
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `content_all` | text | All searchable content | `content_all:function` |
| `code_all` | text | Code-optimized content | `code_all:async` |
| `match_text` | text | Exact match text | `match_text:"function test"` |
| `full_line` | text | Complete line content | `full_line:import` |
| `ai_summary` | text | AI-generated summaries | `ai_summary:"bug fix"` |
| `display_content` | text | Formatted display content | `display_content:error` |

### File & Path Fields  
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `file_name` | string | Filename only | `file_name:*.js` |
| `file_path` | string | Full file path | `file_path:src/services/*` |
| `file_extension` | string | File extension | `file_extension:ts` |

### Metadata Fields
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `line_number` | integer | Line number | `line_number:[1 TO 100]` |
| `column_number` | integer | Column number | `column_number:10` |
| `relevance_score` | integer | Relevance score (0-100) | `relevance_score:[50 TO *]` |
| `file_size` | long | File size in bytes | `file_size:[1000 TO 10000]` |
| `match_count_in_file` | integer | Matches per file | `match_count_in_file:[5 TO *]` |

### Session & Timing Fields
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `search_session_id` | string | Session identifier | `search_session_id:session_*` |
| `original_query` | text | Original search query | `original_query:function` |
| `search_timestamp` | date | When indexed | `search_timestamp:[NOW-1DAY TO NOW]` |
| `file_modified` | date | File modification date | `file_modified:[2024-01-01T00:00:00Z TO NOW]` |
| `workspace_path` | string | Workspace path | `workspace_path:/home/user/project` |

### Boolean Fields
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `case_sensitive` | boolean | Case sensitive search | `case_sensitive:true` |
| `whole_word` | boolean | Whole word search | `whole_word:true` |

### Tag Fields
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `ai_tags` | string | AI-generated tags | `ai_tags:performance` |
| `match_type` | string | Match type (literal/regex/glob) | `match_type:regex` |

## Query Syntax Examples

### Basic Queries
```text
# Simple text search
function

# Phrase search  
"async function"

# Boolean operators
error AND (exception OR failure)
function NOT deprecated
```

### File Filtering
```text
# JavaScript files only
file_extension:js

# TypeScript components
file_name:*Component.tsx

# Files in specific directory
file_path:src/services/*.ts

# Large files
file_size:[10000 TO *]
```

### Content Targeting
```text
# Search only in match text
match_text:function

# Search in AI summaries
ai_summary:"performance improvement"

# Search full lines
full_line:"import React"

# Search code content specifically  
code_all:async
```

### Quality & Relevance
```text
# High relevance results only
relevance_score:[75 TO 100]

# Multiple matches per file
match_count_in_file:[3 TO *]

# Combine quality with content
match_text:function AND relevance_score:[50 TO *]
```

### Location Targeting
```text
# First 50 lines of files
line_number:[1 TO 50]

# Specific line range
line_number:[100 TO 200]

# Beginning of lines (low column numbers)
column_number:[1 TO 10]
```

### Time-Based Searches
```text
# Recently indexed
search_timestamp:[NOW-1DAY TO NOW]

# Recently modified files
file_modified:[NOW-7DAY TO NOW]

# Specific date range
search_timestamp:[2024-01-01T00:00:00Z TO 2024-12-31T23:59:59Z]
```

### Session Management
```text
# Search in specific session
search_session_id:session_1234567890

# Original queries containing "test"
original_query:test

# All sessions
search_session_id:session_*
```

### Complex Combined Queries
```text
# TypeScript functions with high relevance
file_extension:ts AND match_text:function AND relevance_score:[60 TO *]

# Recent bug fixes in services
file_path:src/services/* AND ai_summary:bug AND search_timestamp:[NOW-7DAY TO NOW]

# Large JavaScript files with async code
file_extension:js AND file_size:[5000 TO *] AND code_all:async

# High-quality React components  
file_name:*Component.tsx AND relevance_score:[70 TO *] AND match_count_in_file:[2 TO *]

# Performance-related code in first 100 lines
(match_text:performance OR ai_summary:performance) AND line_number:[1 TO 100]
```

## Range Queries

Solr supports range queries for numeric and date fields:

```text
# Numeric ranges
field:[min TO max]      # Inclusive range
field:{min TO max}      # Exclusive range  
field:[min TO *]        # Open-ended (min and above)
field:[* TO max]        # Open-ended (max and below)

# Date ranges
search_timestamp:[NOW-1DAY TO NOW]           # Last day
file_modified:[2024-01-01T00:00:00Z TO NOW]  # Since January 1, 2024
```

## Wildcard Queries

```text
# Wildcards in field values
file_name:test*         # Files starting with "test"
file_name:*Component    # Files ending with "Component"  
file_name:*test*        # Files containing "test"

# Single character wildcard
file_name:test?         # "test" + any single character
```

## Escaping Special Characters

If your search terms contain special characters, they need to be escaped:

```text
# Special characters: + - && || ! ( ) { } [ ] ^ " ~ * ? : \ /
match_text:function\(\)     # Search for "function()"
file_name:my\-file.js       # Search for "my-file.js"
```

## Configuration

### Default Search Fields

Configure which fields are searched for simple queries:

```json
{
  "smart-search.defaultSolrFields": "content_all,code_all,ai_summary"
}
```

**Options:**
- Single field: `"content_all"`
- Multiple fields: `"content_all,code_all,match_text"`
- Include AI: `"content_all,code_all,ai_summary"`

### Best Practices

1. **Start Simple**: Use simple queries for everyday searches
2. **Field-Specific for Precision**: Use field queries when you need exact control
3. **Combine Effectively**: Mix content and metadata filters for powerful searches
4. **Use Ranges**: Leverage range queries for numeric and date filtering
5. **Test Incrementally**: Build complex queries step by step

### Performance Tips

1. **Narrow First**: Use specific fields rather than searching all content
2. **Use Ranges**: Numeric/date ranges are very efficient
3. **Limit Results**: Use reasonable `maxResults` settings
4. **Index Management**: Keep Solr indexes optimized for best performance

## Examples by Use Case

### Finding Bugs
```text
# Simple
bug fix

# Advanced
ai_summary:bug AND relevance_score:[50 TO *] AND search_timestamp:[NOW-30DAY TO NOW]
```

### Code Reviews
```text
# Simple  
TODO FIXME

# Advanced
(match_text:TODO OR match_text:FIXME) AND file_extension:(js OR ts) AND line_number:[1 TO 100]
```

### Performance Investigation
```text
# Simple
performance slow

# Advanced  
(ai_summary:performance OR match_text:performance) AND file_size:[5000 TO *] AND relevance_score:[60 TO *]
```

### API Documentation
```text
# Simple
function API

# Advanced
match_text:function AND file_path:*/docs/* AND file_extension:md
```

This query syntax gives you powerful control over your searches while maintaining simplicity for everyday use cases.
