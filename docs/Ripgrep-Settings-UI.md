# Ripgrep Results Panel - Fine-Tuning Settings UI & Persistence

The Ripgrep Results Panel includes an interactive settings panel that allows users to fine-tune their search parameters, re-run searches with different configurations, and **persist settings across new searches from the main search panel**.

## Features

### Collapsible Settings Panel
- **Location**: Below the search query in the Ripgrep Results Panel
- **Toggle**: Click "Search Settings" header to expand/collapse
- **Visual Indicator**: Arrow icon rotates to show expand/collapse state

### Settings Persistence
- **Auto-Persistence**: Settings are automatically saved when changed in the results panel
- **Cross-Search Application**: New searches from the main search panel use the persisted settings
- **Visual Feedback**: Main search panel shows indicator when custom settings are active
- **Manual Clear**: Users can clear persisted settings with a dedicated button

### Available Settings

#### **Context Lines Before**
- **Type**: Number input (0-100)
- **Default**: 30
- **Description**: Number of lines to show before each match
- **Usage**: Increase to see more leading context, useful for understanding function/class definitions

#### **Context Lines After**
- **Type**: Number input (0-100)
- **Default**: 30
- **Description**: Number of lines to show after each match
- **Usage**: Increase to see more trailing context, useful for understanding complete code blocks

#### **Include Files**
- **Type**: Text input (comma-separated glob patterns)
- **Default**: Empty (all files)
- **Examples**: 
  - `*.js,*.ts` - Only JavaScript and TypeScript files
  - `src/**/*.py` - Only Python files in src directory
  - `**/*.{json,yaml,yml}` - Configuration files

#### **Exclude Files**
- **Type**: Text input (comma-separated glob patterns)
- **Default**: Empty (no exclusions)
- **Examples**:
  - `node_modules,*.log` - Exclude dependencies and log files
  - `**/*.min.js,dist/**` - Exclude minified files and build output
  - `*.test.js,*.spec.ts` - Exclude test files

#### **Max Results**
- **Type**: Number input (1-1000)
- **Default**: 100
- **Description**: Maximum number of search results to return

### Main Search Panel Settings

The following settings are controlled from the main search panel and **automatically applied** to all searches:

- **Case Sensitive**: Toggle case-sensitive matching
- **Whole Word**: Match whole words only  
- **Use Regex**: Enable regular expression patterns

These settings are preserved from the original search and don't need to be configured again in the results panel.

## Complete Workflow

### 1. Initial Search & Settings Configuration
1. User performs search from the main search panel
2. Results displayed in Ripgrep Results Panel with default settings
3. User expands settings panel and adjusts parameters
4. User clicks "Apply Settings" to re-run search with new parameters
5. **Settings are automatically persisted for future searches**

### 2. Persistent Settings in Action
1. Main search panel shows **"Using custom search settings"** indicator
2. **"Clear Settings"** button appears next to search button
3. New searches from main panel automatically use the persisted settings
4. All customized parameters (context lines, file patterns, etc.) are applied

### 3. Settings Management
- **View Current Settings**: Open any ripgrep results panel to see active settings
- **Modify Settings**: Change parameters in any results panel and apply
- **Clear Settings**: Click "Clear Settings" in main search panel or modify settings
- **Reset to Defaults**: Clear settings to return to default behavior

## Technical Implementation

### Settings Persistence Mechanism
```typescript
// Static persistence in RipgrepResultsPanel
private static persistedSettings: SearchOptions | undefined;

// Automatic saving when settings change
RipgrepResultsPanel.persistedSettings = {
  ...searchOptions,
  query: '' // Don't persist the specific query
};
```

### Cross-Panel Integration
- **Main Search Panel**: Checks for persisted settings before each search
- **Results Panel**: Saves settings when modified, loads persisted settings on display
- **Smart Merging**: New searches merge persisted settings with any explicit options

### UI Indicators
- **Main Panel**: Info box shows when custom settings are active
- **Clear Button**: Dedicated button to reset to defaults
- **Status Messages**: Feedback when settings are applied or cleared

## Usage Examples

### Development Workflow
```
1. Search for "TODO" (default settings: 30 lines before/after)
2. In results panel: Set before=10, after=5 for concise TODO context
3. Apply settings → Settings now persist
4. Search for "FIXME" from main panel → Uses 10 before, 5 after context
5. Search for "function" from main panel → Uses same custom context settings
```

### Code Review Focus
```
1. Configure: Before=50, After=10, Include: src/**/*.ts, Exclude: *.test.*
2. Apply settings → All subsequent searches use these parameters
3. Search "async", "Promise", "await" → All use the same context and file filtering
4. Clear settings when done with TypeScript-only review
```

### Function Analysis Workflow
```
1. Large codebase with complex functions
2. Configure: Before=20 (see function signature), After=50 (see implementation)
3. Apply settings → Future searches optimized for function understanding
4. Settings persist across VS Code sessions until manually cleared
```

## Benefits

1. **Clean Separation**: Main search options (case, regex, whole word) stay in main panel; fine-tuning options (context, file patterns) in results panel
2. **Consistent Search Experience**: Fine-tuning settings persist across multiple searches
3. **Reduced Configuration**: Set file filtering preferences once, use everywhere
4. **Visual Feedback**: Always know when custom settings are active
5. **Easy Reset**: One-click return to default behavior
6. **Context Awareness**: Different projects can have different optimal settings
7. **Workflow Efficiency**: Focus on search content, not repeatedly configuring parameters

## Error Handling & Edge Cases

- **Invalid Patterns**: Graceful handling of malformed glob patterns
- **Search Failures**: Settings persist even if searches fail
- **Extension Restart**: Settings are cleared on extension reload (by design)
- **Panel Conflicts**: Settings sync across multiple result panels
- **Input Validation**: Reasonable limits on numeric inputs

The persistent settings system transforms the extension from a basic search tool into a customizable, workflow-aware search environment that adapts to user preferences and project needs.
