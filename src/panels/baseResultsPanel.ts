import * as vscode from 'vscode';
import { SearchResult, StoredSearchResult } from '../types';

export abstract class BaseResultsPanel {
  protected readonly _panel: vscode.WebviewPanel;
  protected _disposables: vscode.Disposable[] = [];

  constructor(
    protected readonly _extensionUri: vscode.Uri,
    panelType: string,
    title: string
  ) {
    this._panel = vscode.window.createWebviewPanel(
      panelType,
      title,
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

  public reveal() {
    this._panel.reveal(vscode.ViewColumn.Two);
  }

  public dispose() {
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  protected handleMessage(message: any) {
    switch (message.command) {
      case 'openFile':
        this.openFile(message.file, message.line, message.column);
        break;
    }
  }

  protected async openFile(file: string, line: number, column: number) {
    try {
      const filePath = this.normalizeFilePath(file);
      console.log(`Opening file from results panel: "${filePath}" at line ${line}, column ${column}`);
      
      const document = await vscode.workspace.openTextDocument(filePath);
      const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
      
      const position = new vscode.Position(Math.max(0, line - 1), Math.max(0, column));
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position));
    } catch (error) {
      console.error('Failed to open file from results panel:', error);
      console.error('Original file path:', file);
      vscode.window.showErrorMessage(`Failed to open file: ${error}`);
    }
  }

  protected normalizeFilePath(file: string): string {
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

  protected abstract generateResultsHtml(results: any[]): string;

  protected getBaseStyles(): string {
    return `
      <style>
        body {
          font-family: var(--vscode-font-family);
          font-size: var(--vscode-font-size);
          background-color: var(--vscode-editor-background);
          color: var(--vscode-editor-foreground);
          padding: 20px;
          margin: 0;
        }
        .header {
          border-bottom: 1px solid var(--vscode-panel-border);
          padding-bottom: 10px;
          margin-bottom: 20px;
        }
        .results-count {
          color: var(--vscode-descriptionForeground);
          font-size: 0.9em;
          margin-bottom: 10px;
        }
        .result-item {
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
          margin-bottom: 10px;
          background-color: var(--vscode-editorWidget-background);
        }
        .result-header {
          padding: 8px 12px;
          background-color: var(--vscode-editorGroupHeader-tabsBackground);
          border-bottom: 1px solid var(--vscode-panel-border);
          font-weight: bold;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .result-header:hover {
          background-color: var(--vscode-list-hoverBackground);
        }
        .file-path {
          color: var(--vscode-textLink-foreground);
          text-decoration: none;
        }
        .line-info {
          color: var(--vscode-descriptionForeground);
          font-size: 0.9em;
        }
        .result-content {
          padding: 12px;
        }
        .match-text {
          background-color: var(--vscode-editor-findMatchHighlightBackground);
          color: var(--vscode-editor-findMatchForeground);
          padding: 2px 4px;
          border-radius: 2px;
        }
        .context-line {
          margin: 2px 0;
          font-family: var(--vscode-editor-font-family);
          font-size: var(--vscode-editor-font-size);
          line-height: 1.4;
        }
        .context-line-number {
          color: var(--vscode-editorLineNumber-foreground);
          width: 40px;
          display: inline-block;
          text-align: right;
          margin-right: 10px;
          font-size: 0.9em;
        }
        .summary {
          background-color: var(--vscode-textBlockQuote-background);
          border-left: 4px solid var(--vscode-textBlockQuote-border);
          padding: 8px 12px;
          margin-top: 8px;
          font-style: italic;
          color: var(--vscode-descriptionForeground);
        }
        .no-results {
          text-align: center;
          color: var(--vscode-descriptionForeground);
          padding: 40px;
          font-style: italic;
        }
      </style>
    `;
  }

  protected getBaseScript(): string {
    return `
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
    `;
  }
}
