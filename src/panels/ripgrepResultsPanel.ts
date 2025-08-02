import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SearchResult, SearchOptions } from '../types';
import { BaseResultsPanel } from './baseResultsPanel';
import { RipgrepSearcher } from '../services/ripgrepSearcher';

export class RipgrepResultsPanel extends BaseResultsPanel {
  public static currentPanel: RipgrepResultsPanel | undefined;
  private static persistedSettings: SearchOptions | undefined;
  private ripgrepSearcher: RipgrepSearcher;
  private currentQuery: string = '';
  private currentSettings: SearchOptions = {
    query: '',
    maxResults: 100,
    contextLines: 2
  };

  constructor(extensionUri: vscode.Uri) {
    super(extensionUri, 'ripgrepSearchResults', 'Ripgrep Search Results');
    this.ripgrepSearcher = new RipgrepSearcher();
    RipgrepResultsPanel.currentPanel = this;
    this.setupMessageHandling();
  }

  /**
   * Get the current persisted settings for new searches
   */
  public static getPersistedSettings(): SearchOptions | undefined {
    return RipgrepResultsPanel.persistedSettings;
  }

  /**
   * Clear persisted settings (useful for reset)
   */
  public static clearPersistedSettings(): void {
    RipgrepResultsPanel.persistedSettings = undefined;
  }

  public static create(extensionUri: vscode.Uri): RipgrepResultsPanel {
    if (RipgrepResultsPanel.currentPanel) {
      RipgrepResultsPanel.currentPanel.dispose();
    }
    return new RipgrepResultsPanel(extensionUri);
  }

  /**
   * Set up message handling for webview interactions
   * Handles openFile commands and searchWithSettings requests
   */
  private setupMessageHandling() {
    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'openFile':
            this.openFile(message.file, message.line, message.column);
            break;
          case 'searchWithSettings':
            this.performSearchWithSettings(message.query, message.settings);
            break;
        }
      },
      undefined,
      this._disposables
    );
  }

  /**
   * Perform a new search with user-specified settings from the webview
   * @param query - The search query
   * @param settings - User settings including context lines, file patterns, etc.
   */
  private async performSearchWithSettings(query: string, settings: any) {
    try {
      // Convert webview settings to SearchOptions, preserving original search options
      const searchOptions: SearchOptions = {
        query: query,
        maxResults: settings.maxResults || 100,
        contextLines: settings.contextLines || 2,
        includePatterns: settings.includePatterns && settings.includePatterns.length > 0 ? settings.includePatterns : undefined,
        excludePatterns: settings.excludePatterns && settings.excludePatterns.length > 0 ? settings.excludePatterns : undefined,
        // Preserve original search options from main search panel
        caseSensitive: this.currentSettings.caseSensitive || false,
        wholeWord: this.currentSettings.wholeWord || false,
        useRegex: this.currentSettings.useRegex || false
      };

      this.currentQuery = query;
      this.currentSettings = searchOptions;
      
      // Persist only the fine-tuning settings for future searches (excluding the query and main search options)
      RipgrepResultsPanel.persistedSettings = {
        maxResults: searchOptions.maxResults,
        contextLines: searchOptions.contextLines,
        includePatterns: searchOptions.includePatterns,
        excludePatterns: searchOptions.excludePatterns,
        query: '' // Don't persist the specific query
        // Don't persist caseSensitive, wholeWord, useRegex as they come from main search panel
      };

      // Perform the search
      const results = await this.ripgrepSearcher.search(searchOptions);

      // Send results back to webview
      this._panel.webview.postMessage({
        command: 'searchComplete',
        data: { results, query, settings: searchOptions }
      });

    } catch (error) {
      console.error('Search failed:', error);
      vscode.window.showErrorMessage(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Re-enable the apply button
      this._panel.webview.postMessage({
        command: 'searchComplete',
        data: { results: [], query, settings: this.currentSettings }
      });
    }
  }

  /**
   * Show search results in the panel with optional settings
   * @param results - Array of search results
   * @param query - The search query
   * @param settings - Optional search settings to display in the UI
   */
  public show(results: SearchResult[], query: string, settings?: SearchOptions) {
    this.currentQuery = query;
    if (settings) {
      this.currentSettings = settings;
      // Persist only the fine-tuning settings for future searches (not the main search options)
      RipgrepResultsPanel.persistedSettings = {
        maxResults: settings.maxResults,
        contextLines: settings.contextLines,
        includePatterns: settings.includePatterns,
        excludePatterns: settings.excludePatterns,
        query: '' // Don't persist the specific query
        // Don't persist caseSensitive, wholeWord, useRegex as they come from main search panel
      };
    }

    this._panel.webview.html = this.getWebviewContent();
    // Send data to the webview
    this._panel.webview.postMessage({
      command: 'updateResults',
      data: { results, query, settings: this.currentSettings }
    });
    this.reveal();
  }

  public dispose() {
    RipgrepResultsPanel.currentPanel = undefined;
    super.dispose();
  }

  private getWebviewContent(): string {
    try {
      // Use the extension URI to get the correct path
      const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'ripgrepResults.html');
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
        <title>Ripgrep Search Results</title>
      </head>
      <body>
        <div>Error loading Ripgrep results template</div>
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
