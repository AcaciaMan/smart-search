import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SearchResult } from '../types';

export class SearchResultsPanel {
  public static currentPanel: SearchResultsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._panel = vscode.window.createWebviewPanel(
      'smartSearchResults',
      'Smart Search Results',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this._extensionUri]
      }
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this._disposables
    );
  }

  public show(results: SearchResult[]) {
    SearchResultsPanel.currentPanel = this;
    this._panel.webview.html = this.getWebviewContent(results);
    this._panel.reveal(vscode.ViewColumn.Two);
  }

  public dispose() {
    SearchResultsPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private handleMessage(message: any) {
    switch (message.command) {
      case 'openFile':
        this.openFile(message.file, message.line, message.column);
        break;
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

  private getWebviewContent(results: SearchResult[]): string {
    // Read the HTML template
    const htmlPath = path.join(__dirname, '..', 'webview', 'searchResults.html');
    const cssPath = path.join(__dirname, '..', 'webview', 'searchResults.css');
    let htmlContent: string;
    
    try {
      htmlContent = fs.readFileSync(htmlPath, 'utf8');
    } catch (error) {
      console.error('Failed to read HTML template:', error);
      return this.getFallbackHtml(results);
    }
    
    // Create URI for CSS file
    const cssUri = this._panel.webview.asWebviewUri(
      vscode.Uri.file(cssPath)
    );
    
    // Generate search info
    const searchInfo = `Found ${results.length} result${results.length !== 1 ? 's' : ''}`;
    
    // Generate results content
    const resultsContent = results.length === 0 
      ? this.getNoResultsHtml()
      : results.map(result => this.getResultHtml(result)).join('');
    
    // Replace placeholders
    return htmlContent
      .replace('{{CSS_URI}}', cssUri.toString())
      .replace('{{SEARCH_INFO}}', searchInfo)
      .replace('{{RESULTS_CONTENT}}', resultsContent);
  }

  private getResultHtml(result: SearchResult): string {
    const fileExtension = path.extname(result.file).substring(1).toUpperCase() || 'TXT';
    const relativePath = this.getRelativePath(result.file);
    
    return `
      <div class="result" onclick="openFile('${this.escapeHtml(result.file)}', ${result.line}, ${result.column})" tabindex="-1">
        <div class="file-path">${this.escapeHtml(relativePath)}</div>
        <div class="line-info">Line ${result.line}, Column ${result.column}</div>
        <div class="content">${this.escapeHtml(result.content)}</div>
        ${result.summary ? `<div class="summary">💡 ${this.escapeHtml(result.summary)}</div>` : ''}
        <div class="result-footer">
          <div class="file-type">${fileExtension}</div>
          <div class="score">Score: ${result.score.toFixed(2)}</div>
        </div>
      </div>
    `;
  }

  private getNoResultsHtml(): string {
    return `
      <div class="no-results">
        <div class="no-results-icon">🔍</div>
        <h3>No results found</h3>
        <p>Try adjusting your search terms or search in a different location.</p>
      </div>
    `;
  }

  private getRelativePath(filePath: string): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return filePath;
    }
    
    for (const folder of workspaceFolders) {
      const folderPath = folder.uri.fsPath;
      if (filePath.startsWith(folderPath)) {
        return path.relative(folderPath, filePath);
      }
    }
    
    return filePath;
  }

  private getFallbackHtml(results: SearchResult[]): string {
    // Fallback HTML in case the template file can't be read
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Smart Search Results</title>
        <style>
          body { font-family: var(--vscode-font-family); padding: 20px; }
          .result { border: 1px solid #ccc; margin: 10px 0; padding: 10px; cursor: pointer; }
          .result:hover { background-color: var(--vscode-list-hoverBackground); }
        </style>
      </head>
      <body>
        <h2>Smart Search Results (${results.length})</h2>
        ${results.map(result => `
          <div class="result" onclick="openFile('${this.escapeHtml(result.file)}', ${result.line}, ${result.column})">
            <strong>${this.escapeHtml(result.file)}</strong><br>
            Line ${result.line}: ${this.escapeHtml(result.content)}
          </div>
        `).join('')}
        <script>
          const vscode = acquireVsCodeApi();
          function openFile(file, line, column) {
            vscode.postMessage({ command: 'openFile', file, line, column });
          }
        </script>
      </body>
      </html>
    `;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
