import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import axios from 'axios';

export interface RipgrepStatus {
  available: boolean;
  version?: string;
  resolvedPath?: string;
  error?: string;
}

export interface SolrCoreStats {
  docCount: number;
  deletedDocCount: number;
  indexSizeBytes: number;
  indexSizeHuman: string;
  lastModified?: string;
}

export interface SolrStatus {
  available: boolean;
  url: string;
  coreFound: boolean;
  stats?: SolrCoreStats;
  error?: string;
}

export interface ConfigCheckResults {
  ripgrep: RipgrepStatus;
  solr: SolrStatus;
  timestamp: string;
}

/**
 * Provides the "Smart Search Health" sidebar view.
 * Checks ripgrep availability, Solr connectivity, and displays Solr statistics.
 */
export class ConfigCheckViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'smartSearch.configCheck';

  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  // ── WebviewViewProvider ────────────────────────────────────────────────────

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtml();

    webviewView.webview.onDidReceiveMessage(async (data) => {
      if (data.type === 'refresh') {
        await this._runChecksAndPost();
      } else if (data.type === 'openSettings') {
        vscode.commands.executeCommand(
          'workbench.action.openSettings',
          data.key ?? 'smart-search'
        );
      }
    });

    // Run checks automatically on first open
    this._runChecksAndPost();
  }

  /** Public method so extension.ts can trigger a refresh (e.g. from a command) */
  public async refresh(): Promise<void> {
    if (this._view) {
      this._view.webview.postMessage({ type: 'checking' });
    }
    await this._runChecksAndPost();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async _runChecksAndPost(): Promise<void> {
    if (!this._view) {
      return;
    }

    this._view.webview.postMessage({ type: 'checking' });

    const [ripgrep, solr] = await Promise.all([
      this._checkRipgrep(),
      this._checkSolr()
    ]);

    const results: ConfigCheckResults = {
      ripgrep,
      solr,
      timestamp: new Date().toLocaleTimeString()
    };

    this._view.webview.postMessage({ type: 'results', data: results });
  }

  private _checkRipgrep(): Promise<RipgrepStatus> {
    return new Promise((resolve) => {
      // Check if there is a custom ripgrep path configured
      const config = vscode.workspace.getConfiguration('smart-search');
      const customPath: string = config.get('ripgrepPath', '');
      const rgCommand = customPath || 'rg';

      const proc = spawn(rgCommand, ['--version']);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          // First line: "ripgrep X.Y.Z ..."
          const firstLine = stdout.split('\n')[0].trim();
          // Try to extract executable path via "which" / "where" separately
          resolve({
            available: true,
            version: firstLine,
            resolvedPath: customPath || undefined
          });
        } else {
          resolve({
            available: false,
            error: stderr || 'Command not found'
          });
        }
      });

      proc.on('error', (err) => {
        resolve({
          available: false,
          error: err.message
        });
      });
    });
  }

  private async _checkSolr(): Promise<SolrStatus> {
    const config = vscode.workspace.getConfiguration('smart-search');
    const solrUrl: string = config.get('solrUrl', 'http://localhost:8983/solr');
    const coreName = 'smart-search-results';

    try {
      const response = await axios.get(
        `${solrUrl}/admin/cores`,
        {
          params: { action: 'STATUS', core: coreName, wt: 'json' },
          timeout: 5000
        }
      );

      const coreStatus = response.data?.status?.[coreName];

      if (!coreStatus) {
        return {
          available: true,
          url: solrUrl,
          coreFound: false,
          error: `Core "${coreName}" not found on this Solr instance.`
        };
      }

      const index = coreStatus.index;
      const sizeBytes: number = index?.sizeInBytes ?? 0;

      const stats: SolrCoreStats = {
        docCount: index?.numDocs ?? 0,
        deletedDocCount: index?.deletedDocs ?? 0,
        indexSizeBytes: sizeBytes,
        indexSizeHuman: this._humanFileSize(sizeBytes),
        lastModified: index?.lastModified
      };

      return {
        available: true,
        url: solrUrl,
        coreFound: true,
        stats
      };
    } catch (err: any) {
      return {
        available: false,
        url: solrUrl,
        coreFound: false,
        error: err?.message ?? String(err)
      };
    }
  }

  private _humanFileSize(bytes: number): string {
    if (bytes === 0) { return '0 B'; }
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0);
    return `${value} ${units[Math.min(i, units.length - 1)]}`;
  }

  private _getHtml(): string {
    const htmlPath = path.join(
      this._extensionUri.fsPath,
      'dist',
      'webview',
      'configCheck.html'
    );

    try {
      if (!fs.existsSync(htmlPath)) {
        throw new Error(`HTML not found: ${htmlPath}`);
      }

      const html = fs.readFileSync(htmlPath, 'utf8');

      if (!html || html.length < 50 || !html.includes('</html>')) {
        throw new Error('Invalid HTML content');
      }

      return html;
    } catch (err) {
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: var(--vscode-font-family); padding: 8px;
           color: var(--vscode-foreground); background: var(--vscode-sideBar-background); }
    .err { color: var(--vscode-inputValidation-errorForeground); }
  </style>
</head>
<body>
  <div class="err">Failed to load config check view: ${String(err)}</div>
</body>
</html>`;
    }
  }
}
