import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export type ToolsMode = 'live' | 'session';

export interface ToolsOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;       // only meaningful in 'live' mode
}

/**
 * Provides the "Live Tools" or "Session Tools" sidebar views.
 * Each view renders a compact row of icon toggle buttons (Case Sensitive,
 * Whole Word, Use Regex).  State is held in-memory so SmartSearchViewProvider
 * can read it synchronously via `getOptions()` at search time.
 */
export class ToolsViewProvider implements vscode.WebviewViewProvider {
  public static readonly liveViewType    = 'smartSearch.liveTools';
  public static readonly sessionViewType = 'smartSearch.sessionTools';

  private _view?: vscode.WebviewView;

  /** Current toggle state – read by SmartSearchViewProvider at search time */
  private _options: ToolsOptions = {
    caseSensitive: false,
    wholeWord: false,
    useRegex: false
  };

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _mode: ToolsMode
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Synchronously returns the current toggle state */
  public getOptions(): Readonly<ToolsOptions> {
    return { ...this._options };
  }

  /** Push option overrides from outside (e.g. from persisted ripgrep settings) */
  public setOptions(options: Partial<ToolsOptions>) {
    Object.assign(this._options, options);
    if (this._view) {
      this._view.webview.postMessage({ type: 'setOptions', options: { ...this._options } });
    }
  }

  // ── WebviewViewProvider ────────────────────────────────────────────────────

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

    webviewView.webview.html = this._getHtml();

    webviewView.webview.onDidReceiveMessage((data) => {
      if (data.type === 'optionsChanged') {
        this._options = {
          caseSensitive: !!data.options.caseSensitive,
          wholeWord:     !!data.options.wholeWord,
          useRegex:      !!data.options.useRegex
        };
      }
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _getHtml(): string {
    const htmlPath = path.join(
      this._extensionUri.fsPath,
      'dist',
      'webview',
      'toolsView.html'
    );

    try {
      if (!fs.existsSync(htmlPath)) {
        throw new Error(`HTML not found: ${htmlPath}`);
      }

      let html = fs.readFileSync(htmlPath, 'utf8');

      if (!html || html.length < 50 || !html.includes('</html>')) {
        throw new Error('Invalid HTML content');
      }

      // Inject the mode into the <body> tag so the JS picks it up
      html = html.replace('<body>', `<body data-mode="${this._mode}">`);

      return html;
    } catch (err) {
      const mode = this._mode;
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
  <div class="err">Failed to load ${mode} tools view: ${String(err)}</div>
</body>
</html>`;
    }
  }
}
