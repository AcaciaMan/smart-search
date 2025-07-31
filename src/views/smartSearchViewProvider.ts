import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SmartSearchProvider } from '../providers/smartSearchProvider';
import { IndexManager } from '../services';
import { SearchResult } from '../types';
import { SearchResultsPanel } from '../panels/searchResultsPanel';

export class SmartSearchViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'smartSearch.searchView';
  private _view?: vscode.WebviewView;
  private searchProvider: SmartSearchProvider;

  constructor(
    private readonly _extensionUri: vscode.Uri
  ) {
    const indexManager = new IndexManager();
    this.searchProvider = new SmartSearchProvider(indexManager);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'search':
          await this.performSearch(data.query, data.options);
          break;
        case 'openFile':
          await this.openFile(data.file, data.line, data.column);
          break;
        case 'loadSessions':
          await this.loadSearchSessions();
          break;
      }
    });
  }

  private async performSearch(query: string, options: any = {}) {
    if (!this._view) {
      return;
    }

    // Show loading state in sidebar
    this._view.webview.postMessage({
      type: 'searchStarted',
      query: query
    });

    try {
      const results = await this.searchProvider.search(query, options);
      
      // Create or reuse the results panel
      let resultsPanel = SearchResultsPanel.currentPanel;
      if (!resultsPanel) {
        resultsPanel = new SearchResultsPanel(this._extensionUri);
      }
      
      // Show results in the panel
      resultsPanel.show(results);
      
      // Notify sidebar of completion
      this._view.webview.postMessage({
        type: 'searchCompleted',
        count: results.length
      });
      
      if (results.length === 0) {
        vscode.window.showInformationMessage(`No results found for "${query}"`);
      }
    } catch (error) {
      this._view.webview.postMessage({
        type: 'searchError',
        error: error instanceof Error ? error.message : String(error)
      });
      
      vscode.window.showErrorMessage(`Search failed: ${error}`);
    }
  }

  private async openFile(file: string, line: number, column: number) {
    try {
      const document = await vscode.workspace.openTextDocument(file);
      const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
      
      const position = new vscode.Position(Math.max(0, line - 1), Math.max(0, column));
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position));
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open file: ${error}`);
    }
  }

  private async loadSearchSessions() {
    if (!this._view) {
      return;
    }

    try {
      const sessions = await this.searchProvider.getSearchSessions();
      
      this._view.webview.postMessage({
        type: 'sessionsLoaded',
        sessions: sessions
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load search sessions: ${error}`);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'searchView.html');
    
    try {
      let html = fs.readFileSync(htmlPath, 'utf8');
      
      // Replace any resource URLs with webview URIs if needed
      // For now, we're using inline styles and scripts
      
      return html;
    } catch (error) {
      // Fallback HTML if file can't be read
      return `<!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Smart Search</title>
          <style>
              body {
                  font-family: var(--vscode-font-family);
                  padding: 20px;
                  color: var(--vscode-foreground);
                  background-color: var(--vscode-sideBar-background);
              }
              .error {
                  color: var(--vscode-inputValidation-errorForeground);
                  background-color: var(--vscode-inputValidation-errorBackground);
                  padding: 12px;
                  border-radius: 4px;
              }
          </style>
      </head>
      <body>
          <div class="error">
              Failed to load search interface. Error: ${error}
          </div>
      </body>
      </html>`;
    }
  }
}
