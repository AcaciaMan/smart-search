# File Path Handling Fixes

## Issue
Users experienced "Failed to open file" errors with malformed file paths like:
```
c:workGitHubacacia-erderd_examplediscourse_svg.svg
```

Instead of the correct path:
```
c:\work\GitHub\acacia-erd\erd_example\discourse_svg.svg
```

## Root Causes

### 1. **JavaScript String Escaping in HTML**
- File paths were embedded in `onclick` attributes using single quotes
- Special characters in paths (backslashes, spaces) broke the JavaScript parsing
- **Solution**: Use `JSON.stringify()` to properly escape file paths

### 2. **URI Encoding Issues**
- File paths sometimes contained URL-encoded characters (`%20` for spaces, etc.)
- **Solution**: Added `decodeURIComponent()` to handle encoded paths

### 3. **Path Separator Inconsistencies**
- Mixed forward/backward slashes on Windows
- **Solution**: Normalize path separators based on platform

### 4. **File Protocol Handling**
- Some paths included `file://` protocol prefixes
- **Solution**: Strip protocol and handle platform-specific path formats

## Fixes Applied

### 1. **SearchResultsPanel.ts - HTML Generation**

**Before:**
```typescript
onclick="openFile('${this.escapeHtml(result.file)}', ${result.line}, ${result.column})"
```

**After:**
```typescript
onclick="openFile(${JSON.stringify(result.file)}, ${result.line}, ${result.column})"
```

**Benefits:**
- Proper JavaScript string escaping
- Handles paths with quotes, backslashes, and special characters
- Prevents JavaScript syntax errors

### 2. **File Path Normalization Method**

Added `normalizeFilePath()` method to both `SmartSearchViewProvider` and `SearchResultsPanel`:

```typescript
private normalizeFilePath(file: string): string {
  let filePath = file;
  
  // Handle URI encoded paths (%20, %3A, etc.)
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
```

### 3. **Enhanced Error Logging**

Added detailed logging to help debug file path issues:

```typescript
console.log(`Opening file: "${filePath}" at line ${line}, column ${column}`);
console.error('Original file path:', file);
```

## Testing Scenarios

The fixes handle these problematic path formats:

1. **URI Encoded Paths**:
   - Input: `c%3A%5Cwork%5CGitHub%5Cproject%5Cfile.txt`
   - Output: `c:\work\GitHub\project\file.txt`

2. **File Protocol URLs**:
   - Input: `file:///c:/work/GitHub/project/file.txt`
   - Output: `c:\work\GitHub\project\file.txt`

3. **Mixed Path Separators**:
   - Input: `c:/work/GitHub\project/file.txt`
   - Output: `c:\work\GitHub\project\file.txt`

4. **Special Characters**:
   - Input: `c:\work\project name\file with spaces.txt`
   - Properly escaped in JavaScript: `"c:\\work\\project name\\file with spaces.txt"`

## Benefits

1. **Robust Path Handling**: Handles various path encoding formats
2. **Cross-Platform**: Works on Windows, macOS, and Linux
3. **Better Error Messages**: Detailed logging for debugging
4. **Backwards Compatible**: Doesn't break existing functionality
5. **Future-Proof**: Handles edge cases and malformed paths gracefully

## Files Updated

- ✅ `src/panels/searchResultsPanel.ts` - Fixed HTML generation and added path normalization
- ✅ `src/views/smartSearchViewProvider.ts` - Added robust file path handling
- Both files now use consistent path normalization logic

These fixes ensure that file paths are properly handled throughout the search results workflow, preventing the "Failed to open file" errors users were experiencing.
