import * as vscode from 'vscode';
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
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Smart Search Results</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
          }
          .result {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            margin-bottom: 16px;
            padding: 12px;
            background-color: var(--vscode-editor-background);
          }
          .result:hover {
            background-color: var(--vscode-list-hoverBackground);
            cursor: pointer;
          }
          .file-path {
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 8px;
          }
          .line-info {
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
            margin-bottom: 8px;
          }
          .content {
            font-family: var(--vscode-editor-font-family);
            background-color: var(--vscode-textCodeBlock-background);
            padding: 8px;
            border-radius: 4px;
            white-space: pre-wrap;
            margin-bottom: 8px;
          }
          .summary {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            font-size: 0.9em;
          }
          .score {
            float: right;
            color: var(--vscode-descriptionForeground);
            font-size: 0.8em;
          }
          mark {
            background-color: var(--vscode-editor-findMatchHighlightBackground);
            color: var(--vscode-editor-foreground);
          }
          .no-results {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            margin-top: 50px;
          }
        </style>
      </head>
      <body>
        <h2>Search Results (${results.length})</h2>
        ${results.length === 0 ? 
          '<div class="no-results">No results found</div>' :
          results.map(result => `
            <div class="result" onclick="openFile('${result.file}', ${result.line}, ${result.column})">
              <div class="file-path">${result.file}</div>
              <div class="line-info">Line ${result.line}, Column ${result.column}</div>
              <div class="content">${this.escapeHtml(result.content)}</div>
              ${result.summary ? `<div class="summary">${this.escapeHtml(result.summary)}</div>` : ''}
              <div class="score">Score: ${result.score.toFixed(2)}</div>
            </div>
          `).join('')
        }
        
        <script>
          const vscode = acquireVsCodeApi();
          
          function openFile(file, line, column) {
            vscode.postMessage({
              command: 'openFile',
              file: file,
              line: line,
              column: column
            });
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
