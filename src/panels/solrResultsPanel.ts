import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { StoredSearchResult } from '../types';
import { BaseResultsPanel } from './baseResultsPanel';

export class SolrResultsPanel extends BaseResultsPanel {
  public static currentPanel: SolrResultsPanel | undefined;

  constructor(extensionUri: vscode.Uri) {
    super(extensionUri, 'solrSearchResults', 'Solr Search Results');
    SolrResultsPanel.currentPanel = this;
  }

  public static create(extensionUri: vscode.Uri): SolrResultsPanel {
    if (SolrResultsPanel.currentPanel) {
      SolrResultsPanel.currentPanel.dispose();
    }
    return new SolrResultsPanel(extensionUri);
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
    
    this.reveal();
  }

  public dispose() {
    SolrResultsPanel.currentPanel = undefined;
    super.dispose();
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
