# Development Guide

## Project Structure

```
smart-search/
├── package.json                    # Extension manifest
├── tsconfig.json                   # TypeScript configuration
├── webpack.config.js               # Webpack bundling config
├── scripts/                        # Solr config & utility scripts
│   ├── configure-solr-highlighting.bat / .sh
│   ├── test-solr-config.bat / .sh
│   └── ...
├── solr/                           # Solr core configuration
│   └── smart-search-results/
│       └── conf/                   # Schema, solrconfig, synonyms, etc.
├── resources/                      # Extension icons and static assets
├── docs/                           # Documentation
├── src/
│   ├── extension.ts                # Main entry point — activates & registers all components
│   ├── types/
│   │   └── index.ts                # Shared TypeScript type definitions
│   ├── providers/
│   │   └── smartSearchProvider.ts  # Orchestrates search across ripgrep and Solr
│   ├── services/
│   │   ├── index.ts                # Barrel exports for services
│   │   ├── filtersConfig.ts        # Filter configuration management
│   │   ├── globResolver.ts         # Glob pattern resolution for file filtering
│   │   ├── highlightService.ts     # Solr + client-side search hit highlighting
│   │   ├── indexManager.ts         # Solr indexing and retrieval bridge
│   │   ├── presetsService.ts       # Search preset management
│   │   ├── ripgrepSearcher.ts      # Ripgrep process spawning and result parsing
│   │   ├── solrQueryBuilder.ts     # Solr query construction and sanitization
│   │   └── solrSessionManager.ts   # Session listing, cleanup, and suggestions
│   ├── panels/
│   │   ├── baseResultsPanel.ts     # Base class for all result panels
│   │   ├── fileListPanel.ts        # File list display panel
│   │   ├── fileStatisticsPanel.ts  # Per-file statistics panel
│   │   ├── ripgrepResultsPanel.ts  # Live ripgrep results panel
│   │   ├── searchResultsPanel.ts   # General search results panel
│   │   ├── solrResultsPanel.ts     # Solr query results panel
│   │   ├── statisticsItemResultsPanel.ts # Individual statistic item panel
│   │   └── statisticsPanel.ts      # Aggregated statistics panel
│   ├── views/
│   │   ├── smartSearchViewProvider.ts    # Main search sidebar view
│   │   ├── recentSearchViewProvider.ts   # Recent searches sidebar view
│   │   ├── configCheckViewProvider.ts    # Health check / config sidebar view
│   │   ├── toolsViewProvider.ts          # Live & session tools sidebar view
│   │   └── refinementPanelController.ts  # Search refinement panel controller
│   ├── webview/
│   │   ├── searchView.html         # Main search sidebar UI
│   │   ├── searchResults.html      # Search results display
│   │   ├── searchResults.css       # Search results styles
│   │   ├── solrResults.html        # Solr results display
│   │   ├── ripgrepResults.html     # Ripgrep results display
│   │   ├── fileList.html           # File list display
│   │   ├── fileStatistics.html     # File statistics display
│   │   ├── statistics.html         # Statistics display
│   │   ├── statisticsItemResults.html # Statistics item results
│   │   ├── recentSearchView.html   # Recent searches sidebar UI
│   │   ├── configCheck.html        # Config check sidebar UI
│   │   ├── toolsView.html          # Tools sidebar UI
│   │   └── refinementPanel.html    # Refinement panel UI
│   └── test/
│       ├── runTest.ts              # VS Code test host launcher
│       └── suite/
│           ├── index.ts            # Mocha test runner config
│           ├── extension.test.ts   # Extension activation tests
│           ├── globResolver.test.ts
│           ├── highlightService.test.ts
│           ├── ripgrepSearcher.test.ts
│           └── solrQueryBuilder.test.ts
├── dist/                           # Webpack bundle output (generated)
└── out/                            # tsc output for tests (generated)
```

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Compile the extension (webpack bundle + copy webview resources):
   ```bash
   npm run compile
   ```

3. Run in development mode:
   - Press **F5** in VS Code to launch the Extension Development Host

## Building

| Command | Description |
|---|---|
| `npm run compile` | Webpack bundle + copy webview/resource files to `dist/` |
| `npm run watch` | Webpack in watch mode (recompiles on file changes) |
| `npm run compile-tests` | Compile TypeScript to `out/` for test runner |
| `npm run watch-tests` | Compile tests in watch mode |
| `npm run lint` | Run ESLint on `src/` |
| `npm run package` | Production webpack build with hidden source maps |
| `npm run build` | Production build + copy resources (`vscode:prepublish`) |

## Testing

Run all tests:
```bash
npm test
```

This executes `pretest` (compile-tests + compile + lint), then launches the VS Code test host via `@vscode/test-electron`. Mocha discovers test files in `out/test/suite/`.

Test suites:
- **extension.test.ts** — extension activation and command registration
- **globResolver.test.ts** — glob pattern resolution
- **highlightService.test.ts** — search hit highlighting
- **ripgrepSearcher.test.ts** — ripgrep spawning and output parsing
- **solrQueryBuilder.test.ts** — Solr query construction

## Architecture

### Search Flow (Live Search)
1. User enters a query in the **SmartSearchViewProvider** sidebar
2. **SmartSearchProvider** orchestrates the search
3. **RipgrepSearcher** spawns a ripgrep process and parses results
4. Results are displayed in **RipgrepResultsPanel** / **SearchResultsPanel**

### Session Flow (Solr-Indexed Search)
1. Search results are sent to **IndexManager**, which stores them in Solr
2. **SolrSessionManager** tracks sessions and provides cleanup/suggestions
3. Users query stored sessions via **SolrQueryBuilder** (field-specific syntax, filters)
4. **HighlightService** applies Solr and client-side highlighting to results
5. Results are displayed in **SolrResultsPanel** with highlighted matches

### View Layer
- **Sidebar views**: SmartSearchViewProvider (search input), RecentSearchViewProvider (history), ToolsViewProvider (live & session tools), ConfigCheckViewProvider (health check)
- **RefinementPanelController**: manages search refinement interactions
- **Result panels**: Multiple specialized panels extending `BaseResultsPanel` for different result types (ripgrep, Solr, file list, statistics)
- **Webview HTML/CSS**: Each panel and sidebar view has a corresponding HTML template in `src/webview/`

### Services

| Service | Responsibility |
|---|---|
| **IndexManager** | Bridge between the extension and Solr — indexes documents and retrieves results |
| **RipgrepSearcher** | Spawns ripgrep processes, parses output, streams results |
| **SolrQueryBuilder** | Constructs and sanitizes Solr queries from user input |
| **SolrSessionManager** | Lists, manages, and cleans up Solr search sessions |
| **HighlightService** | Applies Solr highlighting and client-side fallback highlighting |
| **GlobResolver** | Resolves glob patterns for file include/exclude filtering |
| **FiltersConfig** | Manages filter configuration for search refinement |
| **PresetsService** | Manages saved search presets |

## Dependencies

### Runtime
- **axios** — HTTP client for Solr REST API communication
- **ripgrep** — bundled with VS Code (not a separate dependency)

### Development
- **TypeScript** — language
- **webpack** / **ts-loader** — bundling
- **ESLint** / **@typescript-eslint** — linting
- **Mocha** — test framework
- **@vscode/test-electron** — VS Code integration test host
- **@types/vscode**, **@types/node**, **@types/mocha**, **@types/glob** — type definitions
