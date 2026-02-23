# Smart Search Extension Configuration

## Solr Setup (Optional)

If you want to use Solr for advanced indexing and search capabilities:

1. Download and install Apache Solr
2. Create a core named "smart-search":
   ```bash
   bin/solr create -c smart-search
   ```
3. Configure the schema.xml with the following fields:
   - `id` (string, required)
   - `file` (string)
   - `content` (text_general)
   - `symbols` (nested documents)
   - `lastModified` (date)

## Ripgrep Setup

This extension uses ripgrep for fast text search. Install ripgrep:

### Windows
```powershell
choco install ripgrep
# or
scoop install ripgrep
```

### macOS
```bash
brew install ripgrep
```

### Linux
```bash
# Ubuntu/Debian
sudo apt install ripgrep

# Fedora
sudo dnf install ripgrep
```

## Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| `smart-search.solrUrl` | `http://localhost:8983/solr` | Solr server URL |
| `smart-search.maxFiles` | `100` | Maximum files to return results from |
| `smart-search.defaultSolrFields` | `content_all,code_all` | Default fields for simple queries |
| `smart-search.maxParallelFolders` | `5` | Max folders to search in parallel (1-10) |
| `smart-search.enableDebugLogging` | `false` | Enable debug logging for multi-folder search |

### Example settings.json
```json
{
  "smart-search.solrUrl": "http://localhost:8983/solr",
  "smart-search.maxFiles": 100,
  "smart-search.defaultSolrFields": "content_all,code_all",
  "smart-search.maxParallelFolders": 5,
  "smart-search.enableDebugLogging": false
}
```

## Sidebar Search Options (v2.0.0)

From v2.0.0 onwards, the Case Sensitive, Whole Word, and Regex toggles are no longer checkboxes inside the Search view. They are icon-toggle buttons in dedicated sidebar panels:

- **Live Tools** panel: Case Sensitive (`Aa`), Whole Word (`ab`), Regex (`.*`) — used for ripgrep live searches
- **Session Tools** panel: Case Sensitive (`Aa`), Whole Word (`ab`) — used for Solr session searches

Toggle state is read synchronously at search time and persists across VS Code sessions via webview state.

