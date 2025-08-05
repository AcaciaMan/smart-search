import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SmartSearchProvider } from '../providers/smartSearchProvider';
import { IndexManager } from '../services';
import { SearchResult, SearchOptions } from '../types';
import { RipgrepResultsPanel } from '../panels/ripgrepResultsPanel';
import { SolrResultsPanel } from '../panels/solrResultsPanel';

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
        case 'checkPersistedSettings':
          this.checkPersistedSettings();
          break;
        case 'clearPersistedSettings':
          this.clearPersistedSettings();
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
      let effectiveSearchOptions: SearchOptions | undefined;
      
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
        // Get persisted settings from RipgrepResultsPanel if available
        const persistedSettings = RipgrepResultsPanel.getPersistedSettings();
        
        // Merge persisted settings with current options
        effectiveSearchOptions = {
          query,
          maxResults: persistedSettings?.maxResults || options.maxResults || 100,
          contextLinesBefore: persistedSettings?.contextLinesBefore || options.contextLinesBefore || 30,
          contextLinesAfter: persistedSettings?.contextLinesAfter || options.contextLinesAfter || 30,
          includePatterns: persistedSettings?.includePatterns || options.includePatterns,
          excludePatterns: persistedSettings?.excludePatterns || options.excludePatterns,
          caseSensitive: persistedSettings?.caseSensitive || options.caseSensitive || false,
          wholeWord: persistedSettings?.wholeWord || options.wholeWord || false,
          useRegex: persistedSettings?.useRegex || options.useRegex || false,
          searchInResults: options.searchInResults || false
        };
        
        console.log('Performing fresh search with merged settings:', effectiveSearchOptions);
        
        // Perform fresh ripgrep search
        results = await this.searchProvider.search(query, effectiveSearchOptions);
        
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
      
      // Show results in appropriate panel based on search type
      if (options.searchInResults) {
        // Check if we have a valid session to search in
        if (!this.latestSessionId) {
          vscode.window.showWarningMessage('No search session available. Please perform a regular search first to create indexed results.');
          return;
        }
        
        // For session search, use SolrResultsPanel with stored results
        const indexManager = new IndexManager();
        
        // Get persisted settings and merge with current options
        const persistedSettings = SolrResultsPanel.getPersistedSettings();
        const mergedOptions = {
          ...options,
          maxResults: persistedSettings.maxResults || options.maxResults,
        };
        
        let storedResults = await indexManager.searchStoredResultsDetailed(mergedOptions, this.latestSessionId);
        
        // Apply additional filtering if settings exist
        if (persistedSettings.minScore > 0) {
          storedResults = storedResults.filter(r => r.relevance_score >= persistedSettings.minScore);
        }
        
        if (persistedSettings.fileTypes) {
          const fileTypes = persistedSettings.fileTypes.split(',').map((t: string) => t.trim().toLowerCase());
          storedResults = storedResults.filter(r => {
            const ext = r.file_extension?.toLowerCase() || '';
            return fileTypes.some((type: string) => ext.includes(type) || ext === `.${type}`);
          });
        }
        
        if (persistedSettings.excludePatterns) {
          const excludePatterns = persistedSettings.excludePatterns.split(',').map((p: string) => p.trim().toLowerCase());
          storedResults = storedResults.filter(r => {
            const filePath = r.file_path.toLowerCase();
            const fileName = r.file_name.toLowerCase();
            return !excludePatterns.some((pattern: string) => 
              filePath.includes(pattern) || fileName.includes(pattern)
            );
          });
        }
        
        if (storedResults.length === 0) {
          // Check if the session actually exists
          const sessions = await indexManager.getSearchSessions();
          const currentSession = sessions.find(s => s.sessionId === this.latestSessionId);
          
          if (!currentSession) {
            vscode.window.showWarningMessage(`Search session "${this.latestSessionId}" not found. Please perform a new search.`);
            this.latestSessionId = undefined; // Reset invalid session
            return;
          } else {
            vscode.window.showInformationMessage(`No results found for "${query}" in session "${this.latestSessionId}" (${currentSession.resultCount} total results in session).`);
          }
        }
        
        let solrPanel = SolrResultsPanel.currentPanel;
        if (!solrPanel) {
          solrPanel = SolrResultsPanel.create(this._extensionUri);
        }
        
        solrPanel.show(storedResults, query, this.latestSessionId);
        
        // Notify sidebar of completion with correct count
        this._view.webview.postMessage({
          type: 'searchCompleted',
          count: storedResults.length,
          searchType: 'session'
        });
      } else {
        // For ripgrep search, use RipgrepResultsPanel
        let ripgrepPanel = RipgrepResultsPanel.currentPanel;
        if (!ripgrepPanel) {
          ripgrepPanel = RipgrepResultsPanel.create(this._extensionUri);
        }
        
        // Pass the effective search options that were used for the search
        ripgrepPanel.show(results, query, effectiveSearchOptions);
        
        // Notify sidebar of completion
        this._view.webview.postMessage({
          type: 'searchCompleted',
          count: results.length,
          searchType: 'ripgrep'
        });
      }
      
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

  private checkPersistedSettings() {
    if (!this._view) {
      return;
    }

    const hasSettings = RipgrepResultsPanel.getPersistedSettings() !== undefined;
    
    this._view.webview.postMessage({
      type: 'persistedSettingsStatus',
      hasSettings: hasSettings
    });
  }

  private clearPersistedSettings() {
    if (!this._view) {
      return;
    }

    RipgrepResultsPanel.clearPersistedSettings();
    
    this._view.webview.postMessage({
      type: 'persistedSettingsStatus',
      hasSettings: false
    });
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
