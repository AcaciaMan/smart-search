# Troubleshooting: No Results in Session Search

## Issue Description

When searching in Session Search mode (Solr), you get "No results found in stored sessions" — even though the same query returned results in Live Search (ripgrep).

## How Session Search Works

Understanding the workflow is key to diagnosing this issue:

1. **Live Search (ripgrep)** — searches workspace files directly. Results appear in the Ripgrep Results panel.
2. **Store Results** — you must explicitly store ripgrep results into Solr. This creates a search session.
3. **Session Search (Solr)** — queries the stored Solr index, not the files. Without storing, there is nothing to search.
4. **Browse Sessions** — view and switch between stored sessions in the Recent Searches panel.

**If you skip step 2, Session Search will always return zero results.**

---

## Diagnostic Steps

### 1. Check if Solr is Running

```bash
curl http://localhost:8983/solr/admin/cores?action=STATUS
```

**Expected**: JSON response listing the `smart-search-results` core. If Solr is not running, you'll get a connection error.

**To start Solr**:
```bash
cd /path/to/solr
bin/solr start            # Linux/Mac
bin\solr.cmd start        # Windows
```

### 2. Check if the Core Exists

```bash
curl "http://localhost:8983/solr/smart-search-results/admin/ping"
```

**Expected**: `"status":"OK"`. If the core doesn't exist, create it:

```bash
bin/solr create -c smart-search-results -d /path/to/smart-search/solr/smart-search-results/conf
```

Or copy the config files from the project's `solr/smart-search-results/` directory into your Solr installation's core directory.

### 3. Check if Any Documents Are Indexed

```bash
curl "http://localhost:8983/solr/smart-search-results/select?q=*:*&rows=0&wt=json"
```

Look at `response.numFound`. If it's `0`, no results have been stored — you need to perform a Live Search and store results first.

### 4. List Available Sessions

```bash
curl "http://localhost:8983/solr/smart-search-results/select?q=*:*&rows=0&facet=true&facet.field=search_session_id&wt=json"
```

This returns a facet list of all `search_session_id` values and their document counts. Verify that the session you're trying to search exists and has documents.

### 5. Test a Direct Query

```bash
# Search all content
curl "http://localhost:8983/solr/smart-search-results/select?q=content_all:function&wt=json&rows=5"

# Search within a specific session
curl "http://localhost:8983/solr/smart-search-results/select?q=*:*&fq=search_session_id:YOUR_SESSION_ID&wt=json&rows=5"
```

Replace `YOUR_SESSION_ID` with an actual session ID from step 4.

### 6. Check VS Code Developer Console

1. Open: **Help > Toggle Developer Tools**
2. Look for messages like:
   - `"Searching stored results for query: ..."` — confirms session search was attempted
   - `"Found X stored results in Solr"` — query succeeded
   - `"No search session available"` — no session selected
   - `"Solr query parameters: {...}"` — shows the actual query sent
   - Any HTTP error (404, 500) — indicates Solr connectivity or config issue

---

## Common Issues & Solutions

### Issue 1: No Documents Stored

**Symptom**: `numFound: 0` when querying `*:*`

**Cause**: You performed a Live Search but didn't store the results to Solr.

**Fix**: Run a Live Search, then store results to create a session.

### Issue 2: Solr Not Running

**Symptom**: Connection refused errors in Developer Console.

**Fix**:
```bash
bin/solr start
```
Then check the Config Check panel in the Smart Search sidebar to verify connectivity.

### Issue 3: Wrong Session Selected

**Symptom**: Session Search returns results, but not the ones you expect.

**Fix**:
1. Open the **Recent Searches > Sessions** tab
2. Click the correct session to select it
3. Verify the session's original query and result count match what you expect

### Issue 4: Field Name Typo

**Symptom**: Solr returns zero results or an error for a field-specific query.

**Common mistakes**:
| Wrong | Correct |
|-------|---------|
| `filename:test` | `file_name:test` |
| `filepath:src/*` | `file_path:src/*` |
| `extension:ts` | `file_extension:ts` |
| `score:[50 TO *]` | `relevance_score:[50 TO *]` |
| `session:abc` | `search_session_id:abc` |
| `timestamp:[...]` | `search_timestamp:[...]` |

### Issue 5: Query Syntax Error

**Symptom**: Solr returns a 400 error (visible in Developer Console).

**Common causes**:
- Unbalanced quotes: `"async function` → fix: `"async function"`
- Unbalanced brackets: `relevance_score:[50 TO` → fix: `relevance_score:[50 TO *]`
- Invalid field name: `nonexistent_field:value`

**Diagnosis**: Check Solr logs at `<solr-dir>/server/logs/solr.log` for the full error message.

### Issue 6: Core Doesn't Exist

**Symptom**: 404 errors when querying Solr.

**Fix**: Create the core using the project's configuration:
```bash
# Copy the project's Solr config to your Solr installation
cp -r solr/smart-search-results/ <solr-dir>/server/solr/smart-search-results/

# Restart Solr or reload the core
curl "http://localhost:8983/solr/admin/cores?action=RELOAD&core=smart-search-results"
```

---

## Quick Fix Checklist

- [ ] Solr server is running on port 8983
- [ ] `smart-search-results` core exists (check Config Check panel)
- [ ] At least one Live Search has been performed and results stored
- [ ] Correct session is selected in the Recent Searches > Sessions tab
- [ ] Search panel is in Session mode (not Live mode)
- [ ] Query syntax is valid (check Developer Console for errors)
- [ ] Field names match the schema exactly (see [Query Guide](QUERY_GUIDE.md))

---

## Configuration Check

### VS Code Settings
```json
{
  "smart-search.solrUrl": "http://localhost:8983/solr",
  "smart-search.maxFiles": 100,
  "smart-search.defaultSolrFields": "content_all,code_all"
}
```

### Solr Core Requirements
- Core name: `smart-search-results`
- Schema: must match the project's `solr/smart-search-results/conf/managed-schema`
- No stopwords (by design — all words matter in code search)

---

## Still Not Working?

1. **Clear Solr data and re-index**:
   ```bash
   curl "http://localhost:8983/solr/smart-search-results/update?commit=true" -H "Content-Type: text/xml" -d "<delete><query>*:*</query></delete>"
   ```
2. **Reload VS Code** — `Ctrl+Shift+P` → "Developer: Reload Window"
3. **Perform a fresh Live Search** → verify results appear → store to Solr → switch to Session Search

For query syntax help, see the [Query Guide](QUERY_GUIDE.md).
