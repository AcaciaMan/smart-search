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
  private latestSessionId?: string; // Track the latest search session

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
        case 'selectSession':
          this.selectSession(data.sessionId);
          break;
        case 'searchInSession':
          await this.performSearch(data.query, { ...data.options, searchInResults: true });
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
      let results: SearchResult[];
      
      // Check if this should search in stored results (latest session)
      if (options.searchInResults && this.latestSessionId) {
        // Search within the latest session
        results = await this.searchProvider.searchInSession(this.latestSessionId, query, options);
        
        // Notify sidebar this was a session search
        this._view.webview.postMessage({
          type: 'sessionSearchInfo',
          sessionId: this.latestSessionId,
          message: `Searching in latest session results...`
        });
      } else {
        // Perform fresh ripgrep search
        results = await this.searchProvider.search(query, options);
        
        // Store the session ID from this search for future "search in results"
        if (results.length > 0) {
          // Get the latest session (the one we just created)
          const sessions = await this.searchProvider.getSearchSessions();
          if (sessions.length > 0) {
            this.latestSessionId = sessions[0].sessionId; // Most recent session
            
            this._view.webview.postMessage({
              type: 'newSessionCreated',
              sessionId: this.latestSessionId,
              resultCount: results.length
            });
          }
        }
      }
      
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
        count: results.length,
        searchType: options.searchInResults ? 'session' : 'ripgrep'
      });
      
      if (results.length === 0) {
        const searchType = options.searchInResults ? 'stored results' : 'files';
        vscode.window.showInformationMessage(`No results found for "${query}" in ${searchType}`);
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
      const filePath = this.normalizeFilePath(file);
      console.log(`Opening file: "${filePath}" at line ${line}, column ${column}`);
      
      const document = await vscode.workspace.openTextDocument(filePath);
      const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
      
      const position = new vscode.Position(Math.max(0, line - 1), Math.max(0, column));
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position));
    } catch (error) {
      console.error('Failed to open file:', error);
      console.error('Original file path:', file);
      vscode.window.showErrorMessage(`Failed to open file: ${error}`);
    }
  }

  private normalizeFilePath(file: string): string {
    let filePath = file;
    
    // Handle URI encoded paths
    if (filePath.includes('%')) {
      try {
        filePath = decodeURIComponent(filePath);
      } catch (decodeError) {
        console.warn('Failed to decode URI components:', decodeError);
      }
    }
    
    // Remove file:// protocol if present
    if (filePath.startsWith('file://')) {
      filePath = filePath.substring(7);
      // On Windows, remove the extra slash after file://
      if (process.platform === 'win32' && filePath.startsWith('/')) {
        filePath = filePath.substring(1);
      }
    }
    
    // Normalize path separators for Windows
    if (process.platform === 'win32') {
      filePath = filePath.replace(/\//g, '\\');
    }
    
    return filePath;
  }

  private async loadSearchSessions() {
    if (!this._view) {
      return;
    }

    try {
      const sessions = await this.searchProvider.getSearchSessions();
      
      this._view.webview.postMessage({
        type: 'sessionsLoaded',
        sessions: sessions,
        latestSessionId: this.latestSessionId
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load search sessions: ${error}`);
    }
  }

  private selectSession(sessionId: string) {
    this.latestSessionId = sessionId;
    
    if (this._view) {
      this._view.webview.postMessage({
        type: 'sessionSelected',
        sessionId: sessionId
      });
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
