import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { StoredSearchResult, SearchOptions } from '../types';
import { BaseResultsPanel } from './baseResultsPanel';
import { IndexManager } from '../services/indexManager';

export class SolrResultsPanel extends BaseResultsPanel {
  public static currentPanel: SolrResultsPanel | undefined;
  private static persistedSettings: any = {
    maxResults: 100,
    minScore: 0,
    sortOrder: 'relevance',
    fileTypes: '',
    excludePatterns: '',
    sessionFilter: ''
  };

  constructor(extensionUri: vscode.Uri) {
    super(extensionUri, 'solrSearchResults', 'Solr Search Results');
    SolrResultsPanel.currentPanel = this;
    this.setupMessageHandling();
  }

  public static create(extensionUri: vscode.Uri): SolrResultsPanel {
    if (SolrResultsPanel.currentPanel) {
      SolrResultsPanel.currentPanel.dispose();
    }
    return new SolrResultsPanel(extensionUri);
  }

  private setupMessageHandling() {
    this._panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'searchWithSettings':
          await this.performSearchWithSettings(message.query, message.sessionId, message.settings);
          break;
        case 'showError':
          vscode.window.showErrorMessage(message.message);
          break;
      }
    });
  }

  private async performSearchWithSettings(query: string, sessionId: string, settings: any) {
    try {
      // Store settings for future use
      SolrResultsPanel.persistedSettings = { ...SolrResultsPanel.persistedSettings, ...settings };

      // Create search options from settings
      const searchOptions: SearchOptions = {
        query: query,
        maxResults: settings.maxResults || 100,
        caseSensitive: undefined, // Not applicable for Solr search
        wholeWord: undefined, // Not applicable for Solr search
        useRegex: false // Solr uses its own query syntax
      };

      // Get index manager and perform search
      const indexManager = new IndexManager();
      let results = await indexManager.searchStoredResultsDetailed(searchOptions, sessionId || settings.sessionFilter);

      // Apply additional filtering based on settings
      results = this.applyAdditionalFilters(results, settings);

      // Sort results based on settings
      results = this.sortResults(results, settings.sortOrder);

      // Update the webview with new results
      this._panel.webview.postMessage({
        command: 'updateResults',
        data: { results, query, sessionId: sessionId || settings.sessionFilter }
      });

    } catch (error) {
      console.error('Error performing search with settings:', error);
      vscode.window.showErrorMessage(`Search failed: ${error}`);
    }
  }

  private applyAdditionalFilters(results: StoredSearchResult[], settings: any): StoredSearchResult[] {
    let filtered = results;

    // Filter by minimum score
    if (settings.minScore > 0) {
      filtered = filtered.filter(r => r.relevance_score >= settings.minScore);
    }

    // Filter by file types
    if (settings.fileTypes) {
      const fileTypes = settings.fileTypes.split(',').map((t: string) => t.trim().toLowerCase());
      filtered = filtered.filter(r => {
        const ext = r.file_extension?.toLowerCase() || '';
        return fileTypes.some((type: string) => ext.includes(type) || ext === `.${type}`);
      });
    }

    // Exclude patterns
    if (settings.excludePatterns) {
      const excludePatterns = settings.excludePatterns.split(',').map((p: string) => p.trim().toLowerCase());
      filtered = filtered.filter(r => {
        const filePath = r.file_path.toLowerCase();
        const fileName = r.file_name.toLowerCase();
        return !excludePatterns.some((pattern: string) => 
          filePath.includes(pattern) || fileName.includes(pattern)
        );
      });
    }

    return filtered;
  }

  private sortResults(results: StoredSearchResult[], sortOrder: string): StoredSearchResult[] {
    const sorted = [...results];

    switch (sortOrder) {
      case 'relevance':
        return sorted.sort((a, b) => b.relevance_score - a.relevance_score);
      case 'relevance_asc':
        return sorted.sort((a, b) => a.relevance_score - b.relevance_score);
      case 'timestamp':
        return sorted.sort((a, b) => new Date(b.search_timestamp).getTime() - new Date(a.search_timestamp).getTime());
      case 'timestamp_asc':
        return sorted.sort((a, b) => new Date(a.search_timestamp).getTime() - new Date(b.search_timestamp).getTime());
      case 'filename':
        return sorted.sort((a, b) => a.file_name.localeCompare(b.file_name));
      case 'line_number':
        return sorted.sort((a, b) => a.line_number - b.line_number);
      default:
        return sorted;
    }
  }

  public show(results: StoredSearchResult[], query: string, sessionId?: string) {
    console.log(`SolrResultsPanel.show() called with:`, {
      resultsCount: results.length,
      query: query,
      sessionId: sessionId,
      firstResult: results[0] ? {
        id: results[0].id,
        session_id: results[0].search_session_id,
        file_path: results[0].file_path,
        original_query: results[0].original_query
      } : null
    });
    
    // Always reload HTML to prevent caching issues
    this._panel.webview.html = this.getWebviewContent();
    
    // Send data to the webview immediately after HTML loads
    this._panel.webview.postMessage({
      command: 'updateResults',
      data: { results, query, sessionId }
    });

    // Send persisted settings to the webview
    setTimeout(() => {
      this._panel.webview.postMessage({
        command: 'updateSettings',
        settings: SolrResultsPanel.persistedSettings
      });
    }, 100);
    
    this.reveal();
  }

  public dispose() {
    SolrResultsPanel.currentPanel = undefined;
    super.dispose();
  }

  public static getPersistedSettings() {
    return SolrResultsPanel.persistedSettings;
  }

  public static clearPersistedSettings() {
    SolrResultsPanel.persistedSettings = {
      maxResults: 100,
      minScore: 0,
      sortOrder: 'relevance',
      fileTypes: '',
      excludePatterns: '',
      sessionFilter: ''
    };
  }

  private getWebviewContent(): string {
    try {
      // Use the extension URI to get the correct path
      const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'solrResults.html');
      const htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');
      
      // Replace placeholder URLs with webview resource URIs if needed
      const webviewUri = this._panel.webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview')
      );
      
      return htmlContent;
    } catch (error) {
      console.error('Failed to load HTML template:', error);
      console.error('Extension URI:', this._extensionUri.toString());
      return this.getFallbackHtml();
    }
  }

  private getFallbackHtml(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Solr Search Results</title>
      </head>
      <body>
        <div>Error loading Solr results template</div>
        <script>
          const vscode = acquireVsCodeApi();
        </script>
      </body>
      </html>
    `;
  }

  protected generateResultsHtml(results: any[]): string {
    // This method is required by the base class but not used in this implementation
    // The HTML rendering is handled by the webview HTML file
    return '';
  }
}
