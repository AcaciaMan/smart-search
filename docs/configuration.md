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

- `smart-search.solrUrl`: Solr server URL (default: http://localhost:8983/solr)
- `smart-search.enableAISummaries`: Enable AI-powered summaries (default: true)
- `smart-search.maxFiles`: Maximum files to return results from (default: 100)
