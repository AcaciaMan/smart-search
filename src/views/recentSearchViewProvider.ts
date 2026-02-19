import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { IndexManager } from '../services';
import { SmartSearchProvider } from '../providers/smartSearchProvider';

/**
 * Provides the "Recent Searches" sidebar view – showing search history and stored sessions.
 * Cross-panel communication is accomplished via callbacks set by the caller (extension.ts).
 */
export class RecentSearchViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'smartSearch.recentSearchView';

  private _view?: vscode.WebviewView;
  private latestSessionId?: string;

  /** Called when the user picks a history query to fill in the main search view */
  public onUseHistoryQuery?: (query: string) => void;

  /** Called when the user selects a session to target */
  public onSelectSession?: (sessionId: string) => void;

  /** Called when the user wants to switch the main search to session mode for a specific session */
  public onSearchInSession?: (sessionId: string) => void;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  // ─── Public API called by SmartSearchViewProvider ──────────────────────────

  /** Notify this view that a new search was performed, adding query to history */
  public notifyNewSearch(query: string, sessionId: string, resultCount: number) {
    this.latestSessionId = sessionId;

    if (this._view) {
      this._view.webview.postMessage({
        type: 'addHistory',
        query
      });
      this._view.webview.postMessage({
        type: 'newSessionCreated',
        sessionId,
        query,
        resultCount
      });
    }
  }

  /** Notify this view that a session was selected from the main search view */
  public notifySessionSelected(sessionId: string) {
    this.latestSessionId = sessionId;

    if (this._view) {
      this._view.webview.postMessage({
        type: 'sessionSelected',
        sessionId
      });
    }
  }

  // ─── WebviewViewProvider ───────────────────────────────────────────────────

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'loadSessions':
          await this._loadSessions();
          break;

        case 'selectSession':
          this._handleSelectSession(data.sessionId);
          break;

        case 'searchInSession':
          this._handleSearchInSession(data.sessionId);
          break;

        case 'useHistoryQuery':
          if (this.onUseHistoryQuery) {
            this.onUseHistoryQuery(data.query);
          }
          break;
      }
    });
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async _loadSessions() {
    if (!this._view) { return; }

    try {
      const indexManager = new IndexManager();
      const searchProvider = new SmartSearchProvider(indexManager);
      const sessions = await searchProvider.getSearchSessions();

      this._view.webview.postMessage({
        type: 'sessionsLoaded',
        sessions,
        latestSessionId: this.latestSessionId
      });
    } catch (error) {
      console.error('RecentSearchViewProvider: failed to load sessions', error);
      this._view.webview.postMessage({
        type: 'sessionsLoaded',
        sessions: [],
        latestSessionId: undefined
      });
    }
  }

  private _handleSelectSession(sessionId: string) {
    this.latestSessionId = sessionId;

    if (this.onSelectSession) {
      this.onSelectSession(sessionId);
    }
  }

  private _handleSearchInSession(sessionId: string) {
    this.latestSessionId = sessionId;

    // First select the session in the main view
    if (this.onSelectSession) {
      this.onSelectSession(sessionId);
    }
    // Then trigger session search mode
    if (this.onSearchInSession) {
      this.onSearchInSession(sessionId);
    }
  }

  private _getHtml(_webview: vscode.Webview): string {
    const htmlPath = path.join(
      this._extensionUri.fsPath,
      'dist',
      'webview',
      'recentSearchView.html'
    );

    try {
      if (!fs.existsSync(htmlPath)) {
        throw new Error(`HTML file not found: ${htmlPath}`);
      }

      const html = fs.readFileSync(htmlPath, 'utf8');

      if (!html || html.length < 100 || !html.includes('</html>')) {
        throw new Error('Invalid HTML content');
      }

      return html;
    } catch (error) {
      return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recent Searches</title>
    <style>
        body { font-family: var(--vscode-font-family); padding: 16px;
               color: var(--vscode-foreground); background: var(--vscode-sideBar-background); }
        .error { color: var(--vscode-inputValidation-errorForeground);
                 background: var(--vscode-inputValidation-errorBackground);
                 padding: 12px; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="error">Failed to load Recent Searches view. ${String(error)}</div>
</body>
</html>`;
    }
  }
}
