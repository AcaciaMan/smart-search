import * as vscode from 'vscode';
import { SmartSearchProvider } from './providers/smartSearchProvider';
import { IndexManager } from './services';
import { RipgrepResultsPanel } from './panels/ripgrepResultsPanel';
import { SolrResultsPanel } from './panels/solrResultsPanel';
import { SmartSearchViewProvider } from './views/smartSearchViewProvider';
import { RecentSearchViewProvider } from './views/recentSearchViewProvider';
import { ToolsViewProvider } from './views/toolsViewProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('Smart Search extension is now active!');

  const indexManager = new IndexManager();
  const searchProvider = new SmartSearchProvider(indexManager);

  // ── Register Live Tools sidebar view ───────────────────────────────────────
  const liveToolsProvider = new ToolsViewProvider(context.extensionUri, 'live');
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ToolsViewProvider.liveViewType,
      liveToolsProvider
    )
  );

  // ── Register Session Tools sidebar view ────────────────────────────────────
  const sessionToolsProvider = new ToolsViewProvider(context.extensionUri, 'session');
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ToolsViewProvider.sessionViewType,
      sessionToolsProvider
    )
  );

  // ── Register the Recent Searches sidebar view ──────────────────────────────
  const recentSearchViewProvider = new RecentSearchViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      RecentSearchViewProvider.viewType,
      recentSearchViewProvider
    )
  );

  // ── Register the main Search sidebar view ─────────────────────────────────
  const searchViewProvider = new SmartSearchViewProvider(
    context.extensionUri,
    recentSearchViewProvider,
    liveToolsProvider,
    sessionToolsProvider
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SmartSearchViewProvider.viewType,
      searchViewProvider
    )
  );

  // ── Wire up cross-panel callbacks ─────────────────────────────────────────

  // When user clicks a history query → fill it in the main search view
  recentSearchViewProvider.onUseHistoryQuery = (query: string) => {
    searchViewProvider.setQuery(query);
    // Focus the search view
    vscode.commands.executeCommand('smartSearch.searchView.focus');
  };

  // When user selects a session from the recent view → select it in main view
  recentSearchViewProvider.onSelectSession = (sessionId: string) => {
    searchViewProvider.selectSessionFromExternal(sessionId);
    vscode.commands.executeCommand('smartSearch.searchView.focus');
  };

  // When user wants to search in a session from the recent view
  recentSearchViewProvider.onSearchInSession = (sessionId: string) => {
    searchViewProvider.activateSessionMode(sessionId);
    vscode.commands.executeCommand('smartSearch.searchView.focus');
  };

  // Register commands
  const searchCommand = vscode.commands.registerCommand('smart-search.search', async () => {
    const query = await vscode.window.showInputBox({
      prompt: 'Enter search query',
      placeHolder: 'Search for files, symbols, or content...'
    });

    if (query) {
      try {
        const results = await searchProvider.search(query);

        // Create or reuse the ripgrep results panel
        let resultsPanel = RipgrepResultsPanel.currentPanel;
        if (!resultsPanel) {
          resultsPanel = RipgrepResultsPanel.create(context.extensionUri);
        }

        resultsPanel.show(results, query);
      } catch (error) {
        vscode.window.showErrorMessage(`Search failed: ${error}`);
      }
    }
  });

  // Register command to show Solr results
  const showSolrResultsCommand = vscode.commands.registerCommand('smart-search.showSolrResults', async () => {
    const query = await vscode.window.showInputBox({
      prompt: 'Search in stored results',
      placeHolder: 'Search within previously indexed results...'
    });

    if (query) {
      try {
        const searchOptions = { query };
        const storedResults = await indexManager.searchStoredResultsDetailed(searchOptions);

        // Create or reuse the Solr results panel
        let solrPanel = SolrResultsPanel.currentPanel;
        if (!solrPanel) {
          solrPanel = SolrResultsPanel.create(context.extensionUri);
        }

        solrPanel.show(storedResults, query);
      } catch (error) {
        vscode.window.showErrorMessage(`Solr search failed: ${error}`);
      }
    }
  });

  context.subscriptions.push(searchCommand, showSolrResultsCommand);
}

export function deactivate() {
  console.log('Smart Search extension is deactivated');
}
