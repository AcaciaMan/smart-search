import * as vscode from 'vscode';
import * as fs from 'fs';
import { FileResult } from '../types';
import { BaseResultsPanel } from './baseResultsPanel';

export class FileListPanel extends BaseResultsPanel {
  public static currentPanel: FileListPanel | undefined;

  constructor(extensionUri: vscode.Uri) {
    super(extensionUri, 'fileListResults', 'Selected File List');
    FileListPanel.currentPanel = this;
    this.setupMessageHandling();
  }

  public static create(extensionUri: vscode.Uri): FileListPanel {
    if (FileListPanel.currentPanel) {
      FileListPanel.currentPanel.dispose();
    }
    return new FileListPanel(extensionUri);
  }

  public show(files: FileResult[], query: string) {
    this._panel.webview.html = this.getWebviewContent();
    setTimeout(() => {
      this._panel.webview.postMessage({ command: 'loadFileList', files, query });
    }, 80);
    this.reveal();
  }

  public dispose() {
    FileListPanel.currentPanel = undefined;
    super.dispose();
  }

  private setupMessageHandling() {
    this._panel.webview.onDidReceiveMessage(
      message => {
        if (message.command === 'openFile') {
          this.openFile(message.file, message.line ?? 0, message.column ?? 0);
        }
      },
      undefined,
      this._disposables
    );
  }

  protected generateResultsHtml(_results: any[]): string {
    return this.getWebviewContent();
  }

  private getWebviewContent(): string {
    try {
      const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'fileList.html');
      return fs.readFileSync(htmlPath.fsPath, 'utf8');
    } catch (error) {
      console.error('Failed to load fileList.html:', error);
      return `<!DOCTYPE html><html><body><p>Error loading file list template.</p></body></html>`;
    }
  }
}
