# Troubleshooting: "No results found in stored sessions"

## Issue Description
When searching the same query in Solr that worked in Ripgrep, you get "No results found in stored sessions".

## Root Cause Analysis

### Workflow Requirements
The extension requires this specific workflow:
1. **First**: Perform a **Ripgrep search** → Results are stored in Solr
2. **Then**: Use "Search in Results" → Searches within stored Solr data

If you try to search in Solr without first doing a Ripgrep search, there's nothing stored to search in.

## Diagnostic Steps

### 1. Check Solr Server Status
```bash
# Verify Solr is running
curl http://localhost:8983/solr/admin/cores?action=STATUS
```

**Expected**: JSON response showing `smart-search-results` core

### 2. Check VS Code Console Logs
1. Open VS Code Developer Tools: `Help > Toggle Developer Tools`
2. Look for console messages like:
   - `"Searching stored results for query: "your-query" in session: session-id"`
   - `"Found X stored results in Solr"`
   - `"Solr query parameters: {...}"`

### 3. Verify Search Session Exists
The extension should show messages like:
- `"No search session available. Please perform a regular search first"`
- `"Search session "session-id" not found"`

## Step-by-Step Solution

### Step 1: Perform Initial Ripgrep Search
1. Open Smart Search sidebar (click the search icon in activity bar)
2. Make sure "Search in Results" is **OFF** (unchecked)
3. Enter your search query (e.g., "function")
4. Click Search

**What happens**: 
- Ripgrep searches your files
- Results are displayed in **Ripgrep Results Panel** (green badge)
- Results are automatically stored in Solr
- A session ID is created

### Step 2: Search Within Stored Results
1. Check "Search in Results" checkbox in sidebar
2. Enter the same or different query
3. Click Search

**What happens**:
- Searches within the stored Solr data
- Results displayed in **Solr Results Panel** (orange badge)
- Shows metadata like scores, original queries, file sizes

## Common Issues & Solutions

### Issue 1: Solr Server Not Running
**Error**: `"Solr server is not running"`
**Solution**: 
```bash
cd /path/to/solr
bin/solr start
bin/solr create -c smart-search-results
```

### Issue 2: No Session Available
**Error**: `"No search session available"`
**Solution**: Perform a regular Ripgrep search first

### Issue 3: Query Syntax Differences
**Problem**: Solr uses different query syntax than ripgrep
**Solution**: The extension handles this automatically, but complex regex might not translate

### Issue 4: Session ID Invalid
**Error**: `"Search session not found"`
**Solution**: 
1. Check available sessions in sidebar
2. Perform a new Ripgrep search to create fresh session

## Debugging Commands

### Check Solr Data Directly
```bash
# See all stored documents
curl "http://localhost:8983/solr/smart-search-results/select?q=*:*&rows=5&wt=json"

# Search for specific query
curl "http://localhost:8983/solr/smart-search-results/select?q=content_all:function&wt=json"

# List search sessions
curl "http://localhost:8983/solr/smart-search-results/select?q=*:*&facet=true&facet.field=search_session_id&rows=0&wt=json"
```

### VS Code Extension Console
```javascript
// In VS Code Developer Console
console.log('Current search sessions:', sessions);
console.log('Latest session ID:', latestSessionId);
```

## Expected Behavior Examples

### Successful Workflow:
1. **Ripgrep Search**: Query "function" → 50 results found → Stored in session `search_20250803_14:30:15`
2. **Solr Search**: Query "async" in stored results → 12 results found from stored session

### Visual Indicators:
- **Ripgrep Panel**: Green "RIPGREP" badge, shows fresh file search results
- **Solr Panel**: Orange "SOLR" badge, shows metadata, scores, session info

## Configuration Check

### VS Code Settings
```json
{
  "smart-search.solrUrl": "http://localhost:8983/solr",
  "smart-search.maxResults": 100
}
```

### Solr Core Requirements
- Core name: `smart-search-results`
- Schema: Must include all required fields (see managed-schema file)
- No stopwords filtering for code search

## Quick Fix Checklist

- [ ] Solr server is running on port 8983
- [ ] `smart-search-results` core exists
- [ ] Performed at least one Ripgrep search first
- [ ] "Search in Results" checkbox is enabled for Solr search
- [ ] Check VS Code Developer Console for error messages
- [ ] Verify session ID exists in sidebar session list

## Still Not Working?

If the issue persists:
1. **Clear Solr Data**: `curl "http://localhost:8983/solr/smart-search-results/update?commit=true" -d "<delete><query>*:*</query></delete>"`
2. **Restart Extension**: Reload VS Code window
3. **Fresh Workflow**: Perform new Ripgrep search → then search in results

The key insight is that **Solr search requires previous Ripgrep results to be stored first**. You can't search in empty storage!
