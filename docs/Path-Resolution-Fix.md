# Path Resolution Fix for Webview Templates

## Issue
When loading HTML templates in VS Code extensions, using `__dirname` or `path.join(__dirname, ...)` can fail because:
1. Webpack bundles change the directory structure
2. `__dirname` might not point to the expected location in bundled code
3. Extension runtime directory differs from source directory

## Error Messages
- "Error loading Ripgrep results template"
- "Error loading Solr results template"  
- "Failed to load HTML template"

## Root Cause
```typescript
// ❌ PROBLEMATIC - __dirname unreliable in webpack bundles
const htmlPath = path.join(__dirname, '..', 'webview', 'template.html');
```

## Solution
```typescript
// ✅ CORRECT - Use extension URI for reliable path resolution
const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'template.html');
const htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');
```

## Key Changes Made

### Before (Problematic):
```typescript
private getWebviewContent(): string {
  try {
    const htmlPath = path.join(__dirname, '..', 'webview', 'solrResults.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    return html;
  } catch (error) {
    console.error('Failed to load HTML template:', error);
    return this.getFallbackHtml();
  }
}
```

### After (Fixed):
```typescript
private getWebviewContent(): string {
  try {
    // Use extension URI for reliable path resolution
    const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'solrResults.html');
    const htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');
    return htmlContent;
  } catch (error) {
    console.error('Failed to load HTML template:', error);
    console.error('Extension URI:', this._extensionUri.toString());
    return this.getFallbackHtml();
  }
}
```

## Why This Works

1. **Extension URI**: `this._extensionUri` always points to the extension's root directory
2. **Relative Paths**: `dist/webview` is relative to extension root, not current file
3. **Cross-Platform**: `vscode.Uri.joinPath()` handles path separators correctly
4. **Webpack Safe**: Works regardless of how webpack transforms the code

## Verification

The HTML files are properly copied by the build process:
```
dist/
├── extension.js           # Webpack bundle
├── webview/
│   ├── ripgrepResults.html
│   ├── solrResults.html
│   └── ...
└── resources/
    └── ...
```

## Best Practices

1. **Always use extension URI** for file path resolution in VS Code extensions
2. **Include error logging** to help debug path issues
3. **Provide fallback HTML** for graceful degradation
4. **Test in packaged extension** not just development mode

## Testing Commands

```bash
# Build and test
npm run build

# Package extension for testing
npx vsce package

# Install and test packaged extension
code --install-extension smart-search-ripsolr-0.0.2.vsix
```

This fix ensures reliable HTML template loading across different VS Code environments and installation methods.
