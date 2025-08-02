import * as vscode from 'vscode';
import { SmartSearchProvider } from './providers/smartSearchProvider';
import { IndexManager } from './services';
import { RipgrepResultsPanel } from './panels/ripgrepResultsPanel';
import { SolrResultsPanel } from './panels/solrResultsPanel';
import { SmartSearchViewProvider } from './views/smartSearchViewProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('Smart Search extension is now active!');

  const indexManager = new IndexManager();
  const searchProvider = new SmartSearchProvider(indexManager);
  
  // Register the search view provider
  const searchViewProvider = new SmartSearchViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SmartSearchViewProvider.viewType,
      searchViewProvider
    )
  );

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
