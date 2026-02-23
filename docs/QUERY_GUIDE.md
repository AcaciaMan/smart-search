# Smart Search Query Guide

This guide covers the query syntax available in Smart Search for Session Search (Solr). For basic Live Search (ripgrep), just type your text — no special syntax is needed.

## Table of Contents

- [Query Types](#query-types)
- [Smart Query Routing](#smart-query-routing)
- [Available Fields](#available-fields)
- [Query Syntax](#query-syntax)
- [Range Queries](#range-queries)
- [Wildcard Queries](#wildcard-queries)
- [Special Character Handling](#special-character-handling)
- [Relevance Scoring & Boosts](#relevance-scoring--boosts)
- [Examples by Use Case](#examples-by-use-case)
- [Configuration](#configuration)

---

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

**Default fields**: `content_all`, `code_all` (configurable via `smart-search.defaultSolrFields`)

### Field-Specific Queries (Advanced)

Use `field:value` syntax to target a specific Solr field:

```text
file_name:*.js                    # JavaScript files
match_text:async                  # "async" in match text only
relevance_score:[50 TO *]         # High relevance results
file_path:src/services/*          # Files in services directory
```

---

## Smart Query Routing

The query builder automatically routes your query to the most appropriate fields based on its content:

| Query Pattern | Detection | Routed To | Example |
|---------------|-----------|-----------|---------|
| Empty query | No input | `*:*` (match all) | *(empty)* |
| Field-specific | Contains `field:value` | Passed through as-is | `file_name:test.ts` |
| Filename-like | Ends with `.ts`, `.js`, `.py`, etc. | `file_name`, `file_path` | `Component.tsx` |
| Code pattern | Contains `()`, `{}`, `=>`, keywords like `function`, `class`, `import` | `code_all^1.5`, `content_all^1.0` | `async function` |
| Default text | Everything else | Configured default fields with OR | `search term` |

**How it works**: When you type a simple query without field prefixes, the builder inspects the text for patterns. A query like `test.ts` is recognized as a filename and routed to `file_name` and `file_path`. A query like `function()` is recognized as code and routed to `code_all` (with 1.5x boost) and `content_all`.

---

## Available Fields

All fields below are defined in the Solr schema (`managed-schema`). Only indexed fields can be queried.

### Content Fields
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `content_all` | text_general | Combined searchable content (copy field target) | `content_all:function` |
| `code_all` | text_code | Code-optimized combined field (copy field target) | `code_all:async` |
| `match_text` | text_general | The matched text content | `match_text:"function test"` |
| `full_line` | text_code | Complete line containing the match | `full_line:import` |
| `display_content` | text_display | Formatted content for highlighting display | `display_content:error` |
| `context_before` | text_code | Lines before the match (multiValued) | `context_before:const` |
| `context_after` | text_code | Lines after the match (multiValued) | `context_after:return` |

### File & Path Fields
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `file_name` | string | Filename only (exact match) | `file_name:*.js` |
| `file_path` | string | Full file path (exact match) | `file_path:src/services/*` |
| `file_extension` | string | File extension (exact match) | `file_extension:ts` |

### Numeric & Date Fields
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `line_number` | pint | Line number of the match | `line_number:[1 TO 100]` |
| `column_number` | pint | Column number of the match | `column_number:[1 TO 10]` |
| `relevance_score` | plong | Relevance score (0–100) | `relevance_score:[50 TO *]` |
| `file_size` | plong | File size in bytes | `file_size:[1000 TO 10000]` |
| `match_count_in_file` | pint | Number of matches in the same file | `match_count_in_file:[5 TO *]` |
| `context_lines_before` | pint | Number of context lines before match | `context_lines_before:[1 TO *]` |
| `context_lines_after` | pint | Number of context lines after match | `context_lines_after:[1 TO *]` |

### Session & Timing Fields
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `search_session_id` | string | Session identifier | `search_session_id:session_*` |
| `original_query` | text_general | The original search query text | `original_query:function` |
| `search_timestamp` | pdate | When the search was performed | `search_timestamp:[NOW-1DAY TO NOW]` |
| `file_modified` | pdate | File last-modified date | `file_modified:[2026-01-01T00:00:00Z TO NOW]` |
| `workspace_path` | string | Workspace root path | `workspace_path:*project*` |

### Boolean & Tag Fields
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `case_sensitive` | boolean | Whether search was case-sensitive | `case_sensitive:true` |
| `whole_word` | boolean | Whether whole-word matching was used | `whole_word:true` |
| `match_type` | string | Match type (literal, regex, glob) | `match_type:regex` |

### Raw / Storage-Only Fields
These fields are stored but **not indexed** — they cannot be queried directly but appear in results:
| Field | Type | Description |
|-------|------|-------------|
| `match_text_raw` | string | Original unanalyzed match text |
| `full_line_raw` | string | Original unanalyzed full line |

> **Note**: The schema also contains `ai_summary` (text_general) and `ai_tags` (string) fields. These exist in the schema but are not populated by the extension.

---

## Query Syntax

### Boolean Operators
```text
error AND exception       # Both terms required
error OR exception        # Either term matches
NOT deprecated            # Exclude term
error AND (exception OR failure)  # Grouping with parentheses
function NOT deprecated   # Combined
```

### Phrase Search
```text
"exact phrase"            # Must match exactly in order
"async function"          # Finds the exact sequence
```

### Field-Specific Queries
```text
file_extension:js                         # Single field
file_extension:ts AND match_text:function # Multiple fields
match_text:function AND relevance_score:[50 TO *]  # Content + metadata
```

---

## Range Queries

Solr supports range queries for numeric (`pint`, `plong`) and date (`pdate`) fields:

```text
# Inclusive range (both bounds included)
relevance_score:[50 TO 100]

# Exclusive range (both bounds excluded)
relevance_score:{50 TO 100}

# Open-ended (min and above)
relevance_score:[50 TO *]

# Open-ended (max and below)
line_number:[* TO 100]

# Date ranges
search_timestamp:[NOW-1DAY TO NOW]
search_timestamp:[NOW-7DAY TO NOW]
file_modified:[2026-01-01T00:00:00Z TO NOW]
search_timestamp:[2026-01-01T00:00:00Z TO 2026-12-31T23:59:59Z]
```

---

## Wildcard Queries

```text
file_name:test*           # Files starting with "test"
file_name:*Component      # Files ending with "Component"
file_name:*test*          # Files containing "test"
file_name:test?           # "test" + any single character
file_path:src/services/*  # All files under src/services/
```

Wildcards work on `string` fields (`file_name`, `file_path`, `file_extension`, `search_session_id`, etc.). On tokenized `text_*` fields, wildcards apply to individual tokens.

---

## Special Character Handling

The query builder's `sanitizeQuery()` automatically escapes these Solr special characters in simple (non-field-specific) queries:

```
+ - & | ! ( ) { } [ ] ^ " ~ * ? : \ /
```

This means:
- **Simple queries** like `function()` are safe — the parentheses are escaped automatically
- **Field-specific queries** preserve wildcards and quotes in values (e.g., `file_name:*.js` keeps the `*`)
- **Quoted strings** in field values are passed through as-is (e.g., `match_text:"exact phrase"`)

If you need to search for literal special characters in a field query, escape them with backslash:

```text
match_text:function\(\)     # Search for literal "function()"
file_name:my\-file.js       # Search for "my-file.js"
```

---

## Relevance Scoring & Boosts

### How Scoring Works

The `/search` handler uses **edismax** (Extended DisMax) with field-level boosting. Matches in different fields contribute different scores:

**Query field boosts (`qf`)**:
| Field | Boost | Effect |
|-------|-------|--------|
| `match_text` | 5.0× | Highest priority — the actual matched text |
| `full_line` | 3.0× | High — the complete line containing the match |
| `file_name` | 2.0× | Medium — filename matches |
| `context_before` | 1.5× | Low — surrounding context lines |
| `context_after` | 1.5× | Low — surrounding context lines |

**Phrase boosts (`pf`)** — additional scoring when the entire query appears as a phrase:
| Field | Boost |
|-------|-------|
| `match_text` | 10.0× |
| `full_line` | 5.0× |

This means a match in `match_text` is worth 5× more than a match in context lines. Phrase matches (where all query words appear together in order) get an additional boost.

### Client-Side Boosts

The query builder also applies boosts when routing simple queries:
- `code_all` gets a 1.5× boost for code-pattern queries
- `content_all` gets a 1.0× boost (baseline)

### Default Sort Order

Results are sorted by `score desc, search_timestamp desc` — highest relevance first, then most recent.

---

## Examples by Use Case

### Finding Specific Files
```text
# By name
file_name:Component.tsx

# By extension
file_extension:ts

# By path
file_path:src/services/*

# By size (large files)
file_size:[10000 TO *]
```

### Content Search
```text
# In matched text
match_text:"async function"

# In code fields
code_all:import

# In full lines
full_line:"export default"
```

### Quality Filtering
```text
# High relevance only
relevance_score:[75 TO 100]

# Files with many matches
match_count_in_file:[3 TO *]

# Combine quality + content
match_text:function AND relevance_score:[50 TO *]
```

### Location Targeting
```text
# First 50 lines of files
line_number:[1 TO 50]

# Specific line range
line_number:[100 TO 200]
```

### Time-Based Searches
```text
# Recently indexed
search_timestamp:[NOW-1DAY TO NOW]

# Recently modified files
file_modified:[NOW-7DAY TO NOW]
```

### Session Queries
```text
# Search in specific session
search_session_id:session_1234567890

# Find sessions by original query
original_query:test
```

### Complex Combined Queries
```text
# TypeScript functions with high relevance
file_extension:ts AND match_text:function AND relevance_score:[60 TO *]

# Large JavaScript files with async code
file_extension:js AND file_size:[5000 TO *] AND code_all:async

# High-quality React components
file_name:*Component.tsx AND relevance_score:[70 TO *] AND match_count_in_file:[2 TO *]

# TODO/FIXME in code files
(match_text:TODO OR match_text:FIXME) AND file_extension:(js OR ts) AND line_number:[1 TO 100]

# API docs
match_text:function AND file_path:*docs* AND file_extension:md
```

---

## Configuration

### Default Search Fields

Configure which fields are searched for simple (non-field-specific) queries:

```json
{
  "smart-search.defaultSolrFields": "content_all,code_all"
}
```

This setting is used when the query builder doesn't detect a more specific routing target (filename pattern or code pattern).

### Best Practices

1. **Start simple** — type plain text and let the smart routing choose fields
2. **Use field queries for precision** — `file_extension:ts AND match_text:function`
3. **Combine content + metadata** — mix text queries with numeric/date filters
4. **Use ranges for filtering** — `relevance_score:[50 TO *]` is very efficient
5. **Build incrementally** — start with one condition and add more
