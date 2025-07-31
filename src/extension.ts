import * as vscode from 'vscode';
import { SmartSearchProvider } from './providers/smartSearchProvider';
import { IndexManager } from './services';
import { SearchResultsPanel } from './panels/searchResultsPanel';

export function activate(context: vscode.ExtensionContext) {
  console.log('Smart Search extension is now active!');

  const indexManager = new IndexManager();
  const searchProvider = new SmartSearchProvider(indexManager);
  const resultsPanel = new SearchResultsPanel(context.extensionUri);

  // Register commands
  const searchCommand = vscode.commands.registerCommand('smart-search.search', async () => {
    const query = await vscode.window.showInputBox({
      prompt: 'Enter search query',
      placeHolder: 'Search for files, symbols, or content...'
    });

    if (query) {
      try {
        const results = await searchProvider.search(query);
        resultsPanel.show(results);
      } catch (error) {
        vscode.window.showErrorMessage(`Search failed: ${error}`);
      }
    }
  });

  const indexCommand = vscode.commands.registerCommand('smart-search.indexWorkspace', async () => {
    try {
      vscode.window.showInformationMessage('Indexing workspace...');
      await indexManager.indexWorkspace();
      vscode.window.showInformationMessage('Workspace indexed successfully!');
    } catch (error) {
      vscode.window.showErrorMessage(`Indexing failed: ${error}`);
    }
  });

  context.subscriptions.push(searchCommand, indexCommand);
}

export function deactivate() {
  console.log('Smart Search extension is deactivated');
}
