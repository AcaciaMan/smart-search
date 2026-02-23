import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { SmartSearchViewProvider } from './smartSearchViewProvider';
import { findFilter } from '../services/presetsService';
import { CurrentSearchGlobs } from '../types';

interface PanelState {
    includeGlobs: string[];
    excludeGlobs: string[];
    customIncludeGlobs: string[];
    customExcludeGlobs: string[];
}

const EMPTY_STATE: PanelState = {
    includeGlobs: [],
    excludeGlobs: [],
    customIncludeGlobs: [],
    customExcludeGlobs: [],
};

export class RefinementPanelController {
    private _panel?: vscode.WebviewPanel;
    private _lastState: PanelState = { ...EMPTY_STATE };

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _searchViewProvider: SmartSearchViewProvider,
    ) {}

    // ─── Public ──────────────────────────────────────────────────────────────

    public show(): void {
        if (this._panel) {
            this._panel.reveal(vscode.ViewColumn.Two);
            return;
        }
        this._createPanel();
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    private _createPanel(): void {
        const extensionPath = this._extensionUri.fsPath;

        this._panel = vscode.window.createWebviewPanel(
            'smartSearch.refinement',
            'Search Refinement',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: [this._extensionUri],
                retainContextWhenHidden: true,
            },
        );

        this._panel.webview.html = this._getHtml();

        this._panel.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.type) {
                case 'requestTreeData': {
                    const treeData = await this._buildTreeData();
                    this._panel?.webview.postMessage({ type: 'treeData', ...treeData });
                    // Also send the current glob state so the panel can restore UI.
                    const state = await this._resolveInitialState();
                    this._panel?.webview.postMessage({ type: 'loadState', ...state });
                    break;
                }

                case 'stateChanged': {
                    this._lastState = {
                        includeGlobs:       Array.isArray(msg.includeGlobs)       ? msg.includeGlobs       : [],
                        excludeGlobs:       Array.isArray(msg.excludeGlobs)       ? msg.excludeGlobs       : [],
                        customIncludeGlobs: Array.isArray(msg.customIncludeGlobs) ? msg.customIncludeGlobs : [],
                        customExcludeGlobs: Array.isArray(msg.customExcludeGlobs) ? msg.customExcludeGlobs : [],
                    };
                    break;
                }

                case 'applyAndRerun': {
                    const s = this._lastState;
                    this._searchViewProvider.setGlobState(
                        s.includeGlobs,
                        s.excludeGlobs,
                        s.customIncludeGlobs,
                        s.customExcludeGlobs,
                    );
                    await this._searchViewProvider.rerunLastSearch();
                    break;
                }

                case 'saveAsFilter': {
                    // Sync latest state into the search view so the save command picks it up.
                    const s = this._lastState;
                    this._searchViewProvider.setGlobState(
                        s.includeGlobs,
                        s.excludeGlobs,
                        s.customIncludeGlobs,
                        s.customExcludeGlobs,
                    );
                    vscode.commands.executeCommand('smart-search.saveCurrentSearchAsFilter');
                    break;
                }

                // "testGlobs" — run ripgrep with merged globs and report matching files.
                case 'testGlobs': {
                    const includes = this._dedupe([
                        ...(Array.isArray(msg.includeGlobs)       ? msg.includeGlobs       : []),
                        ...(Array.isArray(msg.customIncludeGlobs) ? msg.customIncludeGlobs : []),
                    ]);
                    const excludes = this._dedupe([
                        ...(Array.isArray(msg.excludeGlobs)       ? msg.excludeGlobs       : []),
                        ...(Array.isArray(msg.customExcludeGlobs) ? msg.customExcludeGlobs : []),
                    ]);

                    const wsFolders = vscode.workspace.workspaceFolders;
                    if (!wsFolders || wsFolders.length === 0) {
                        this._panel?.webview.postMessage({
                            type: 'testGlobsResult',
                            ok: false,
                            error: 'No workspace folder is open.',
                        });
                        break;
                    }

                    const args: string[] = ['--files', '--no-messages'];
                    for (const g of includes) { args.push('-g', g); }
                    for (const g of excludes)  { args.push('-g', `!${g}`); }
                    args.push(wsFolders[0].uri.fsPath);

                    const rgPath = vscode.workspace.getConfiguration('smart-search')
                        .get<string>('ripgrepPath', '') || 'rg';

                    const sample: string[] = [];
                    let stderrText = '';
                    let timedOut = false;
                    let proc: ReturnType<typeof spawn> | undefined;

                    await new Promise<void>((resolve) => {
                        proc = spawn(rgPath, args, { shell: false });
                        let stdoutBuf = '';
                        let stdoutDone = false;

                        const timer = setTimeout(() => {
                            timedOut = true;
                            proc?.kill();
                            resolve();
                        }, 8000);

                        proc.stdout?.on('data', (chunk: Buffer) => {
                            if (stdoutDone) { return; }
                            stdoutBuf += chunk.toString();
                            const lines = stdoutBuf.split('\n');
                            // Keep last partial line in buffer.
                            stdoutBuf = lines.pop() ?? '';
                            for (const line of lines) {
                                const trimmed = line.trim();
                                if (trimmed && sample.length < 20) {
                                    sample.push(trimmed);
                                }
                            }
                            if (sample.length >= 20) {
                                stdoutDone = true;
                                proc?.stdout?.destroy();
                            }
                        });

                        proc.stderr?.on('data', (chunk: Buffer) => {
                            stderrText += chunk.toString();
                        });

                        proc.on('close', (code: number | null) => {
                            clearTimeout(timer);
                            if (timedOut) { resolve(); return; }

                            if (code === 0) {
                                // Flush any remaining partial line.
                                if (stdoutBuf.trim() && sample.length < 20) {
                                    sample.push(stdoutBuf.trim());
                                }
                                this._panel?.webview.postMessage({
                                    type: 'testGlobsResult',
                                    ok: true,
                                    count: sample.length,
                                    sample,
                                });
                            } else if (code === 1) {
                                // Exit code 1 = no matches found.
                                this._panel?.webview.postMessage({
                                    type: 'testGlobsResult',
                                    ok: true,
                                    count: 0,
                                    sample: [],
                                });
                            } else {
                                this._panel?.webview.postMessage({
                                    type: 'testGlobsResult',
                                    ok: false,
                                    error: stderrText.trim() || `ripgrep exited with code ${code}.`,
                                });
                            }
                            resolve();
                        });

                        proc.on('error', (err: Error) => {
                            clearTimeout(timer);
                            this._panel?.webview.postMessage({
                                type: 'testGlobsResult',
                                ok: false,
                                error: err.message,
                            });
                            resolve();
                        });
                    });

                    if (timedOut) {
                        this._panel?.webview.postMessage({
                            type: 'testGlobsResult',
                            ok: false,
                            error: 'Timed out after 8 seconds.',
                        });
                    }
                    break;
                }
            }
        });

        this._panel.onDidDispose(() => {
            this._panel = undefined;
        });
    }

    /** Resolve the initial state to send to the webview. */
    private async _resolveInitialState(): Promise<PanelState> {
        // If there's already some history from this session, prefer it.
        if (
            this._lastState.includeGlobs.length > 0 ||
            this._lastState.excludeGlobs.length > 0 ||
            this._lastState.customIncludeGlobs.length > 0 ||
            this._lastState.customExcludeGlobs.length > 0
        ) {
            return this._lastState;
        }

        const activeFilter = this._searchViewProvider.getActiveFilter();
        if (activeFilter.name && activeFilter.scope) {
            const preset = await findFilter(activeFilter.scope, activeFilter.name);
            if (preset) {
                return {
                    includeGlobs:       preset.includeGlobs,
                    excludeGlobs:       preset.excludeGlobs,
                    customIncludeGlobs: preset.customIncludeGlobs ?? [],
                    customExcludeGlobs: preset.customExcludeGlobs ?? [],
                };
            }
        }

        // Fall back to whatever the main search view currently holds.
        const g = this._searchViewProvider.currentGlobState;
        return {
            includeGlobs:       g.includeGlobs,
            excludeGlobs:       g.excludeGlobs,
            customIncludeGlobs: g.customIncludeGlobs,
            customExcludeGlobs: g.customExcludeGlobs,
        };
    }

    /** Gather top-level folder names and unique extensions from the workspace. */
    private _dedupe(arr: string[]): string[] {
        const seen = new Set<string>();
        return arr.filter(x => { if (seen.has(x)) { return false; } seen.add(x); return true; });
    }

    /** Gather top-level folder names and unique extensions from the workspace. */
    private async _buildTreeData(): Promise<{ folders: string[]; extensions: string[] }> {
        const uris = await vscode.workspace.findFiles('**/*', undefined, 500);

        const folderSet = new Set<string>();
        const extSet = new Set<string>();

        for (const uri of uris) {
            const fsPath = uri.fsPath;

            // Top-level folder relative to any workspace folder root.
            const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
            for (const wf of workspaceFolders) {
                const rel = path.relative(wf.uri.fsPath, fsPath);
                if (!rel.startsWith('..')) {
                    const parts = rel.split(/[\\/]/);
                    if (parts.length > 1) {
                        folderSet.add(parts[0]);
                    }
                    break;
                }
            }

            // Extension.
            const ext = path.extname(fsPath);
            if (ext && ext.length > 1) {
                extSet.add(ext.slice(1)); // strip leading dot
            }
        }

        return {
            folders:    [...folderSet].sort(),
            extensions: [...extSet].sort(),
        };
    }

    private _getHtml(): string {
        const htmlPath = path.join(this._extensionUri.fsPath, 'dist', 'webview', 'refinementPanel.html');
        if (fs.existsSync(htmlPath)) {
            return fs.readFileSync(htmlPath, 'utf8');
        }
        // During development fall back to src.
        const srcPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'refinementPanel.html');
        if (fs.existsSync(srcPath)) {
            return fs.readFileSync(srcPath, 'utf8');
        }
        return '<html><body><p>refinementPanel.html not found.</p></body></html>';
    }
}
