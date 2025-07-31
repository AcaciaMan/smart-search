# Development Guide

## Project Structure

```
smart-search/
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript configuration
├── src/
│   ├── extension.ts          # Main extension entry point
│   ├── types/
│   │   └── index.ts          # Type definitions
│   ├── providers/
│   │   └── smartSearchProvider.ts  # Main search provider
│   ├── services/
│   │   ├── indexManager.ts   # Solr indexing service
│   │   ├── ripgrepSearcher.ts # Ripgrep integration
│   │   └── aiSummaryService.ts # AI summary generation
│   ├── panels/
│   │   └── searchResultsPanel.ts # Search results webview
│   └── test/
│       ├── runTest.ts
│       └── suite/
│           ├── index.ts
│           └── extension.test.ts
├── docs/
│   ├── configuration.md
│   └── development.md
└── out/                      # Compiled JavaScript (generated)
```

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Compile TypeScript:
   ```bash
   npm run compile
   ```

3. Run in development mode:
   - Press F5 in VS Code to launch Extension Development Host

## Building

- Compile: `npm run compile`
- Watch mode: `npm run watch`
- Package: `vsce package`

## Testing

- Run tests: `npm test`
- The extension includes unit tests and integration tests

## Architecture

### Search Flow
1. User triggers search command
2. SmartSearchProvider orchestrates search
3. First attempts Solr search (if available)
4. Falls back to ripgrep search
5. Optionally adds AI summaries
6. Displays results in webview panel

### Components
- **IndexManager**: Handles Solr indexing and search
- **RipgrepSearcher**: Fast text search using ripgrep
- **AISummaryService**: Generates content summaries
- **SearchResultsPanel**: Webview for displaying results
