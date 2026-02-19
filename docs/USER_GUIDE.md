# Smart Search User Guide

## Quick Start

1. **Open Smart Search**: Press `Ctrl+Shift+F` (Windows/Linux) or `Cmd+Shift+F` (Mac)
2. **Enter Search**: Type your query in the Search panel and press Enter
3. **Set Filters**: Toggle Case Sensitive, Whole Word, or Regex in the **Live Tools** or **Session Tools** panel *before* searching
4. **View Results**: Results appear in a dedicated panel
5. **Browse History**: Open the **Recent Searches** panel to revisit previous queries and sessions

## Sidebar Panels (v2.0.0)

The Smart Search activity bar now has four collapsible panels:

### 🔍 Search
The main query input with Live / Session mode tabs. This is where you enter your query and launch searches.

### ⚙️ Live Tools
Compact icon toolbar for **ripgrep live searches**:

| Button | Label | Effect |
|--------|-------|--------|
| `Aa` | Case | Match exact letter case |
| `ab` | Word | Match complete words only |
| `.*` | Regex | Treat query as a regular expression |

Toggle state is shown in the status strip at the bottom of the panel (*Active: Case · .*)

### 🗄️ Session Tools
Same compact toolbar for **Session / Solr searches** — Case Sensitive and Whole Word only (Regex is not applicable to Solr queries).

### 🕐 Recent Searches
Tabbed panel:

- **Recent tab** — Clickable search history list. Click any item to load the query into the Search panel. Use the trash icon to clear history.
- **Sessions tab** — Stored session list showing query, timestamp and result count. Click a row to select it as the target for Session Search. The **Search** action button immediately switches the Search panel to Session mode for that session.

---

## Search Types

### Simple Search (Recommended)
Just type what you're looking for — Smart Search automatically searches the most relevant fields.

```text
function          ← Finds "function" in code and content
"exact phrase"    ← Searches for exact phrase matches  
bug AND fix       ← Boolean search with AND/OR/NOT
```

### Field-Specific Search (Advanced)
Use `field:value` syntax to target specific data fields.

```text
file_name:*.js                    ← JavaScript files
match_text:async                  ← "async" in match text only
relevance_score:[50 TO *]        ← High relevance results
file_path:src/services/*          ← Files in services directory
```

## Common Search Examples

### Finding Files
```text
file_name:Component.tsx           ← React components
file_extension:js                 ← All JavaScript files  
file_path:*test*                  ← Files with "test" in path
```

### Content Search
```text
match_text:"async function"       ← Exact phrase in matches
ai_summary:performance            ← AI summaries about performance
code_all:import                   ← "import" in code fields
```

### Quality Filtering
```text
relevance_score:[75 TO 100]       ← High quality results only
match_count_in_file:[3 TO *]      ← Multiple matches per file
file_size:[1000 TO 10000]         ← Medium-sized files
```

### Time-Based
```text
search_timestamp:[NOW-7DAY TO NOW] ← Results from last 7 days
file_modified:[NOW-1DAY TO NOW]    ← Recently modified files
```

### Combined Searches
```text
file_extension:ts AND match_text:function AND relevance_score:[60 TO *]
```

---

## Search Settings

Both result panels include collapsible settings panels for fine-tuning.

### Ripgrep Settings (Live Search panel)
- **Context Lines**: How many lines to show around matches
- **File Patterns**: Include/exclude specific file types
- **Max Results**: Limit number of results

### Solr Settings (Session Search panel)
- **Relevance Score**: Minimum quality threshold
- **File Types**: Filter by file extensions
- **Sort Order**: How to order results
- **Session Filter**: Search within specific sessions

---

## Search Modes

### Live Search (Fresh Search)
- Searches workspace files directly using ripgrep
- Creates a new session automatically
- Options read from the **Live Tools** panel
- Best for exploring new areas of code

### Session Search
- Searches within previously indexed results via Solr
- Options read from the **Session Tools** panel
- Best for refining existing searches

---

## Configuration

Access via VS Code Settings (`Ctrl+,`):

```json
{
  "smart-search.defaultSolrFields": "content_all,code_all",
  "smart-search.maxFiles": 100,
  "smart-search.solrUrl": "http://localhost:8983/solr"
}
```

---

## Tips & Tricks

### Performance
1. **Use specific fields** for faster searches
2. **Limit results** with reasonable max values  
3. **Use ranges** for numeric filtering
4. **Start narrow** then expand if needed

### Accuracy
1. **Use quotes** for exact phrases
2. **Combine fields** for precise targeting
3. **Use boolean operators** (AND, OR, NOT)
4. **Test incrementally** when building complex queries

### Workflow with New Sidebar Panels
1. Open **Live Tools** and set your Case/Word/Regex toggles once — they persist
2. Run a **Live Search** to create a session
3. Open **Session Tools** and set Case/Word as needed
4. Switch to **Session Search** and refine your query
5. Use the **Recent Searches** panel to reload earlier queries or switch sessions

---

## Troubleshooting

### No Results
- Check spelling and try simpler terms
- Remove field restrictions
- Check if Solr is running (for session searches)
- Try wildcard patterns (`*test*`)

### Too Many Results  
- Add field filters (`file_extension:js`)
- Increase relevance threshold
- Use more specific terms
- Add boolean operators (`AND`, `NOT`)

### Slow Searches
- Reduce max results setting
- Use more specific field queries
- Check Solr performance
- Avoid very broad wildcard searches

---

## Available Fields Reference

| Field | Description | Example |
|-------|-------------|---------|
| `content_all` | All searchable content | `content_all:function` |
| `code_all` | Code-optimized content | `code_all:async` |
| `file_name` | File name only | `file_name:*.js` |
| `file_path` | Full file path | `file_path:src/*` |
| `file_extension` | File extension | `file_extension:ts` |
| `match_text` | Exact match text | `match_text:"function test"` |
| `ai_summary` | AI-generated summary | `ai_summary:bug` |
| `relevance_score` | Quality score (0-100) | `relevance_score:[50 TO *]` |
| `line_number` | Line number | `line_number:[1 TO 100]` |
| `search_session_id` | Session identifier | `search_session_id:session_*` |

For complete field reference, see [Query Guide](QUERY_GUIDE.md).

---

## Support

- **Documentation**: Check the [Query Guide](QUERY_GUIDE.md) for advanced syntax
- **Issues**: Report problems via GitHub issues
- **Configuration**: See [configuration guide](configuration.md) for setup help


## Search Types

### Simple Search (Recommended)
Just type what you're looking for - Smart Search will automatically search in the most relevant fields.

```text
function          ← Finds "function" in code and content
"exact phrase"    ← Searches for exact phrase matches  
bug AND fix       ← Boolean search with AND/OR/NOT
```

### Field-Specific Search (Advanced)
Use `field:value` syntax to search specific data fields.

```text
file_name:*.js                    ← JavaScript files
match_text:async                  ← "async" in match text only
relevance_score:[50 TO *]        ← High relevance results
file_path:src/services/*          ← Files in services directory
```

## Common Search Examples

### Finding Files
```text
file_name:Component.tsx           ← React components
file_extension:js                 ← All JavaScript files  
file_path:*test*                  ← Files with "test" in path
```

### Content Search
```text
match_text:"async function"       ← Exact phrase in matches
ai_summary:performance            ← AI summaries about performance
code_all:import                   ← "import" in code fields
```

### Quality Filtering
```text
relevance_score:[75 TO 100]       ← High quality results only
match_count_in_file:[3 TO *]      ← Multiple matches per file
file_size:[1000 TO 10000]         ← Medium-sized files
```

### Time-Based
```text
search_timestamp:[NOW-7DAY TO NOW] ← Results from last 7 days
file_modified:[NOW-1DAY TO NOW]    ← Recently modified files
```

### Combined Searches
```text
file_extension:ts AND match_text:function AND relevance_score:[60 TO *]
```

## Search Settings

Both search result panels include settings to refine your results:

### Ripgrep Settings
- **Context Lines**: How many lines to show around matches
- **File Patterns**: Include/exclude specific file types
- **Max Results**: Limit number of results

### Solr Settings  
- **Relevance Score**: Minimum quality threshold
- **File Types**: Filter by file extensions
- **Sort Order**: How to order results
- **Session Filter**: Search within specific sessions

## Search Modes

### Fresh Search
- Searches files directly using ripgrep
- Creates a new search session
- Best for exploring new areas of code

### Search in Results
- Searches within previously indexed results
- Uses Solr for fast filtering
- Best for refining existing searches

## Configuration

Access via VS Code Settings (`Ctrl+,`):

```json
{
  "smart-search.defaultSolrFields": "content_all,code_all",
  "smart-search.maxFiles": 100,
  "smart-search.solrUrl": "http://localhost:8983/solr"
}
```

## Tips & Tricks

### Performance
1. **Use specific fields** for faster searches
2. **Limit results** with reasonable max values  
3. **Use ranges** for numeric filtering
4. **Start narrow** then expand if needed

### Accuracy
1. **Use quotes** for exact phrases
2. **Combine fields** for precise targeting
3. **Use boolean operators** (AND, OR, NOT)
4. **Test incrementally** when building complex queries

### Workflow
1. **Start simple** with basic text search
2. **Add field filters** if too many results
3. **Use "Search in Results"** to refine further
4. **Save good patterns** as documentation

## Troubleshooting

### No Results
- Check spelling and try simpler terms
- Remove field restrictions
- Check if Solr is running (for session searches)
- Try wildcard patterns (`*test*`)

### Too Many Results  
- Add field filters (`file_extension:js`)
- Increase relevance threshold
- Use more specific terms
- Add boolean operators (`AND`, `NOT`)

### Slow Searches
- Reduce max results setting
- Use more specific field queries
- Check Solr performance
- Avoid very broad wildcard searches

## Available Fields Reference

| Field | Description | Example |
|-------|-------------|---------|
| `content_all` | All searchable content | `content_all:function` |
| `code_all` | Code-optimized content | `code_all:async` |
| `file_name` | File name only | `file_name:*.js` |
| `file_path` | Full file path | `file_path:src/*` |
| `file_extension` | File extension | `file_extension:ts` |
| `match_text` | Exact match text | `match_text:"function test"` |
| `ai_summary` | AI-generated summary | `ai_summary:bug` |
| `relevance_score` | Quality score (0-100) | `relevance_score:[50 TO *]` |
| `line_number` | Line number | `line_number:[1 TO 100]` |
| `search_session_id` | Session identifier | `search_session_id:session_*` |

For complete field reference, see [Query Guide](QUERY_GUIDE.md).

## Support

- **Documentation**: Check the [Query Guide](QUERY_GUIDE.md) for advanced syntax
- **Issues**: Report problems via GitHub issues
- **Configuration**: See configuration guide for setup help
