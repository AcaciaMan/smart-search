import * as vscode from 'vscode';
import { SmartSearchProvider } from './providers/smartSearchProvider';
import { IndexManager } from './services';
import { SearchResultsPanel } from './panels/searchResultsPanel';
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
        
        // Create or reuse the results panel
        let resultsPanel = SearchResultsPanel.currentPanel;
        if (!resultsPanel) {
          resultsPanel = new SearchResultsPanel(context.extensionUri);
        }
        
        resultsPanel.show(results);
      } catch (error) {
        vscode.window.showErrorMessage(`Search failed: ${error}`);
      }
    }
  });

  context.subscriptions.push(searchCommand);
}

export function deactivate() {
  console.log('Smart Search extension is deactivated');
}
