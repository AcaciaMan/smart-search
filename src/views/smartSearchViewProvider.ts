import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SmartSearchProvider } from '../providers/smartSearchProvider';
import { IndexManager } from '../services';
import { SearchResult, SearchOptions, CurrentSearchGlobs } from '../types';
import { RipgrepResultsPanel } from '../panels/ripgrepResultsPanel';
import { SolrResultsPanel } from '../panels/solrResultsPanel';
import { FileStatisticsPanel } from '../panels/fileStatisticsPanel';
import { RipgrepSearcher } from '../services/ripgrepSearcher';
import { RecentSearchViewProvider } from './recentSearchViewProvider';

const DEFAULT_GLOB_STATE: CurrentSearchGlobs = {
  includeGlobs: [],
  excludeGlobs: [],
  customIncludeGlobs: [],
  customExcludeGlobs: [],
};

export class SmartSearchViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'smartSearch.searchView';
  private _view?: vscode.WebviewView;
  private searchProvider: SmartSearchProvider;
  private latestSessionId?: string; // Track the latest search session
  private _currentQuery: string = ''; // Track the current/last search query
  private ripgrepSearcher = new RipgrepSearcher();

  /** Current glob state as reported by the webview. */
  public currentGlobState: CurrentSearchGlobs = { ...DEFAULT_GLOB_STATE };

  /** Name of the currently active filter preset (undefined = no active filter). */
  private _activeFilterName?: string;
  /** Scope of the currently active filter preset. */
  private _activeFilterScope?: 'global' | 'workspace';

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly recentSearchViewProvider?: RecentSearchViewProvider,
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
        case 'getSuggestions':
          await this.getSuggestions(data.query, data.sessionId, data.mode);
          break;
        case 'revealRecentView':
          // Focus the Recent Searches sidebar view
          vscode.commands.executeCommand('smartSearch.recentSearchView.focus');
          break;
        case 'globStateUpdate':
          this.currentGlobState = {
            includeGlobs:       Array.isArray(data.includeGlobs)       ? data.includeGlobs       : [],
            excludeGlobs:       Array.isArray(data.excludeGlobs)       ? data.excludeGlobs       : [],
            customIncludeGlobs: Array.isArray(data.customIncludeGlobs) ? data.customIncludeGlobs : [],
            customExcludeGlobs: Array.isArray(data.customExcludeGlobs) ? data.customExcludeGlobs : [],
            activeFilterName:   typeof data.activeFilterName === 'string' ? data.activeFilterName : undefined,
            activeFilterScope:  data.activeFilterScope === 'global' || data.activeFilterScope === 'workspace'
                                  ? data.activeFilterScope
                                  : undefined,
          };
          break;
        case 'saveAsFilterRequest':
          vscode.commands.executeCommand('smart-search.saveCurrentSearchAsFilter');
          break;
      }
    });
  }

  // ─── Public API called from extension.ts (cross-panel) ─────────────────────

  /** Returns the last query text entered in the search bar (empty string if none yet) */
  public getQuery(): string {
    return this._currentQuery;
  }

  /** Fill the search input in this view (called when user clicks a history item) */
  public setQuery(query: string) {
    if (this._view) {
      this._view.webview.postMessage({ type: 'setQuery', query });
    }
  }

  /** Select a session from an external trigger (called from RecentSearchViewProvider) */
  public selectSessionFromExternal(sessionId: string) {
    this.selectSession(sessionId);
  }

  /** Select a session AND switch to session mode (called when user clicks "Search" in Recent view) */
  public activateSessionMode(sessionId: string) {
    this.latestSessionId = sessionId;
    if (this._view) {
      this._view.webview.postMessage({ type: 'activateSessionMode', sessionId });
    }
  }

  /** Returns the currently active filter name and scope (may both be undefined). */
  public getActiveFilter(): { name?: string; scope?: 'global' | 'workspace' } {
    return { name: this._activeFilterName, scope: this._activeFilterScope };
  }

  /**
   * Replaces the current glob state with the supplied arrays and notifies the webview
   * via a "globStateUpdate" echo so the search bar stays in sync.
   */
  public setGlobState(
    includeGlobs: string[],
    excludeGlobs: string[],
    customIncludeGlobs: string[],
    customExcludeGlobs: string[],
  ): void {
    this.currentGlobState = {
      ...this.currentGlobState,
      includeGlobs,
      excludeGlobs,
      customIncludeGlobs,
      customExcludeGlobs,
    };
    if (this._view) {
      this._view.webview.postMessage({
        type: 'globStateUpdate',
        includeGlobs,
        excludeGlobs,
        customIncludeGlobs,
        customExcludeGlobs,
      });
    }
  }

  /**
   * Re-runs the last search query with current settings.
   * No-op if no query has been made yet.
   */
  public async rerunLastSearch(): Promise<void> {
    if (this._currentQuery) {
      await this.performSearch(this._currentQuery);
    }
  }

  /**
   * Sets (or clears) the active filter and notifies the webview via a "filterChanged" message.
   * Pass undefined for both arguments to clear the active filter.
   */
  public setActiveFilter(
    name: string | undefined,
    scope: 'global' | 'workspace' | undefined,
  ): void {
    this._activeFilterName = name;
    this._activeFilterScope = scope;
    if (this._view) {
      this._view.webview.postMessage({
        type: 'filterChanged',
        activeFilterName: name,
        activeFilterScope: scope,
      });
    }
  }

  private async getSuggestions(query: string, sessionId?: string, mode?: string) {
    if (!this._view) {
      return;
    }

    try {
      const indexManager = new IndexManager();
      const searchMode = mode || 'live';
      // For session mode, use provided sessionId or latest; for live mode, no session filter
      const targetSessionId = searchMode === 'session' ? (sessionId || this.latestSessionId) : undefined;
      const suggestions = await indexManager.getSuggestions(query, targetSessionId, 10, searchMode);
      
      this._view.webview.postMessage({
        type: 'suggestions',
        suggestions: suggestions
      });
    } catch (error) {
      console.error('Error getting suggestions:', error);
      // Send empty suggestions on error
      this._view.webview.postMessage({
        type: 'suggestions',
        suggestions: []
      });
    }
  }

  private async performSearch(query: string, options: any = {}) {
    if (!this._view) {
      return;
    }

    // Track the latest query
    this._currentQuery = query;

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

        // Read live-search toggle options from the Ripgrep Results panel toolbar
        const liveOpts = RipgrepResultsPanel.getToggleOptions();

        // ── File Statistics Mode ────────────────────────────────────────────
        // When the F# toggle is active, run a files-only ripgrep search and
        // open the File Search Statistics panel instead of the normal results.
        if (liveOpts.fileStatsMode) {
          const fileSearchOptions = {
            query,
            caseSensitive: liveOpts.caseSensitive,
            wholeWord:     liveOpts.wholeWord,
            useRegex:      liveOpts.useRegex
          };
          const fileResults = await this.ripgrepSearcher.searchFilesOnly(fileSearchOptions);

          let statsPanel = FileStatisticsPanel.currentPanel;
          if (!statsPanel) {
            statsPanel = FileStatisticsPanel.create(this._extensionUri);
          }
          statsPanel.show(fileResults, query);

          this._view!.webview.postMessage({
            type: 'searchComplete',
            resultCount: fileResults.length,
            query
          });
          return;
        }

        // Merge: persisted panel settings win, then panel toolbar toggles
        // Toolbar context lines: -B/-A override -C for their respective direction; 0 = use default
        const liveCtxBefore = (liveOpts.contextLinesBefore || 0) > 0
          ? liveOpts.contextLinesBefore
          : (liveOpts.contextLines || 0) > 0 ? liveOpts.contextLines : 0;
        const liveCtxAfter = (liveOpts.contextLinesAfter || 0) > 0
          ? liveOpts.contextLinesAfter
          : (liveOpts.contextLines || 0) > 0 ? liveOpts.contextLines : 0;

        const cg = this.currentGlobState;
        const hasActiveGlobs = cg.includeGlobs.length > 0 ||
                               cg.excludeGlobs.length > 0 ||
                               cg.customIncludeGlobs.length > 0 ||
                               cg.customExcludeGlobs.length > 0 ||
                               !!cg.activeFilterName;

        effectiveSearchOptions = {
          query,
          maxFiles: persistedSettings?.maxFiles || options.maxFiles || 100,
          contextLinesBefore: persistedSettings?.contextLinesBefore || liveCtxBefore || options.contextLinesBefore || 10,
          contextLinesAfter: persistedSettings?.contextLinesAfter || liveCtxAfter || options.contextLinesAfter || 10,
          includePatterns: persistedSettings?.includePatterns || options.includePatterns,
          excludePatterns: persistedSettings?.excludePatterns || options.excludePatterns,
          caseSensitive: persistedSettings?.caseSensitive ?? liveOpts.caseSensitive ?? false,
          wholeWord:     persistedSettings?.wholeWord     ?? liveOpts.wholeWord     ?? false,
          useRegex:      persistedSettings?.useRegex      ?? liveOpts.useRegex      ?? false,
          searchInResults: options.searchInResults || false,
          // Pass currentGlobs so ripgrepSearcher resolves and applies them.
          // Only set when non-empty to avoid overriding persistedSettings patterns
          // when no refinement globs are active.
          currentGlobs: hasActiveGlobs ? cg : undefined,
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

            // Notify the Recent Searches sidebar view
            if (this.recentSearchViewProvider) {
              this.recentSearchViewProvider.notifyNewSearch(
                query,
                this.latestSessionId,
                results.length
              );
            }
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

        // Read session-search toggle options from the Solr Results panel toolbar
        const sessionOpts = SolrResultsPanel.getToggleOptions();

        const mergedOptions = {
          query,  // Solr needs the query to search for
          ...options,
          // Do NOT pass caseSensitive / wholeWord to Solr fq filters – the
          // indexed documents don't reliably carry these boolean fields.
          // Instead we apply them as post-query filtering below.
          caseSensitive: undefined,
          wholeWord:     undefined,
          maxResults: persistedSettings.maxResults || 1000, // Large default for Solr
        };
        
        let storedResults = await indexManager.searchStoredResultsDetailed(mergedOptions, this.latestSessionId);

        // ── Post-query filtering for Case Sensitive / Whole Word toggles ──
        if (sessionOpts.caseSensitive && query) {
          storedResults = storedResults.filter(r => {
            const text = r.match_text || r.match_text_raw || r.full_line || '';
            return text.includes(query);
          });
        }

        if (sessionOpts.wholeWord && query) {
          const wordRegex = new RegExp(`\\b${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
            sessionOpts.caseSensitive ? '' : 'i');
          storedResults = storedResults.filter(r => {
            const text = r.match_text || r.match_text_raw || r.full_line || '';
            return wordRegex.test(text);
          });
        }
        
        // Apply additional filtering if settings exist
        if (persistedSettings.minScore > 0) {
          storedResults = storedResults.filter(r => {
            const scoreToUse = r.score !== undefined ? r.score * 100 : r.relevance_score;
            return scoreToUse >= persistedSettings.minScore;
          });
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
    const htmlPath = path.join(this._extensionUri.fsPath, 'dist', 'webview', 'searchView.html');
    
    try {
      console.log('Loading searchView HTML from:', htmlPath);
      
      if (!fs.existsSync(htmlPath)) {
        console.error('SearchView HTML file does not exist:', htmlPath);
        throw new Error('HTML file not found');
      }
      
      let html = fs.readFileSync(htmlPath, 'utf8');
      console.log('SearchView HTML content loaded, length:', html.length);
      
      // Validate that the HTML content is not empty and has proper structure
      if (!html || html.length < 100 || !html.includes('</html>')) {
        console.error('Invalid searchView HTML content detected');
        throw new Error('Invalid HTML content');
      }
      
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
              Failed to load search interface. Error: ${String(error).replace(/[<>&"']/g, (match) => {
                switch(match) {
                  case '<': return '&lt;';
                  case '>': return '&gt;';
                  case '&': return '&amp;';
                  case '"': return '&quot;';
                  case "'": return '&#x27;';
                  default: return match;
                }
              })}
          </div>
      </body>
      </html>`;
    }
  }
}
