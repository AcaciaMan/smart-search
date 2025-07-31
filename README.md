# Smart Search

Intelligent VS Code extension for contextual search with ripgrep, Solr indexing, and AI-powered summaries.

## Features

- **Fast Text Search**: Uses ripgrep for lightning-fast text search across your workspace
- **Intelligent Indexing**: Optional Solr integration for advanced search and indexing capabilities
- **AI-Powered Summaries**: Get contextual summaries of search results (when enabled)
- **Symbol Search**: Find functions, classes, and other code symbols quickly
- **Rich Results**: Interactive search results panel with file navigation

## Installation

1. Install the extension from the VS Code marketplace
2. (Optional) Set up Solr for advanced indexing - see [Configuration Guide](docs/configuration.md)
3. Make sure ripgrep is installed on your system

## Usage

### Basic Search
- Press `Ctrl+Shift+F` (or `Cmd+Shift+F` on Mac) to open Smart Search
- Enter your search query and press Enter
- Results will appear in a dedicated panel

### Workspace Indexing
- Use the command palette (`Ctrl+Shift+P`) and run "Smart Search: Index Workspace"
- This will index your workspace for faster searches (requires Solr)

## Configuration

The extension can be configured through VS Code settings:

- `smart-search.solrUrl`: Solr server URL (default: http://localhost:8983/solr)
- `smart-search.enableAISummaries`: Enable AI-powered summaries (default: true)
- `smart-search.maxResults`: Maximum number of search results (default: 100)

## Requirements

- VS Code 1.74.0 or higher
- ripgrep (for text search)
- Apache Solr (optional, for advanced indexing)

## Development

See the [Development Guide](docs/development.md) for information on building and contributing to this extension.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
