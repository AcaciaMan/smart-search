import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { SearchResult, SearchOptions } from '../types';

export class RipgrepSearcher {
  async search(options: SearchOptions): Promise<SearchResult[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder found');
    }

    const results: SearchResult[] = [];
    
    for (const folder of workspaceFolders) {
      const folderResults = await this.searchInFolder(folder.uri.fsPath, options);
      results.push(...folderResults);
    }

    return results.slice(0, options.maxResults || 100);
  }

  private async searchInFolder(folderPath: string, options: SearchOptions): Promise<SearchResult[]> {
    return new Promise((resolve, reject) => {
      const args = [
        '--json',
        '--line-number',
        '--column',
        '--with-filename'
      ];

      // Handle context lines - support both new separate before/after and legacy contextLines
      // Re-enable context to ensure submatch information is properly provided
      if (options.contextLinesBefore !== undefined || options.contextLinesAfter !== undefined) {
        // Use separate before and after context lines
        const before = options.contextLinesBefore || 30;
        const after = options.contextLinesAfter || 30;
        args.push('--before-context', before.toString());
        args.push('--after-context', after.toString());
      } else {
        // Fall back to legacy contextLines for backward compatibility
        const context = options.contextLines || 30;
        args.push('--context', context.toString());
      }

      if (!options.caseSensitive) {
        args.push('--ignore-case');
      }

      if (options.wholeWord) {
        args.push('--word-regexp');
      }

      if (options.useRegex) {
        args.push('--regexp');
      } else {
        args.push('--fixed-strings');
      }

      // Add include/exclude patterns
      if (options.includePatterns) {
        options.includePatterns.forEach(pattern => {
          args.push('--glob', pattern);
        });
      }

      if (options.excludePatterns) {
        options.excludePatterns.forEach(pattern => {
          args.push('--glob', `!${pattern}`);
        });
      }

      args.push(options.query, folderPath);

      const rg = spawn('rg', args);
      const results: SearchResult[] = [];
      let buffer = '';
      let allLines: Array<{
        type: 'context' | 'match';
        data: any;
        lineNumber?: number;
      }> = [];

      rg.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              
              if (parsed.type === 'context' || parsed.type === 'match') {
                allLines.push({
                  type: parsed.type,
                  data: parsed.data,
                  lineNumber: parsed.data.line_number
                });
              }
            } catch (error) {
              console.warn('Failed to parse ripgrep output:', line);
            }
          }
        }
      });

      rg.stderr.on('data', (data) => {
        console.error('Ripgrep error:', data.toString());
      });

      rg.on('close', (code) => {
        // Process all collected lines and extract context for each match
        this.processAllLines(allLines, results);
        
        if (code === 0 || code === 1) { // 0 = found, 1 = not found
          resolve(results);
        } else {
          reject(new Error(`Ripgrep exited with code ${code}`));
        }
      });

      rg.on('error', (error) => {
        reject(new Error(`Failed to start ripgrep: ${error.message}`));
      });
    });
  }

  private processAllLines(allLines: Array<{
    type: 'context' | 'match';
    data: any;
    lineNumber?: number;
  }>, results: SearchResult[]) {
    // Find all match indices
    const matchIndices: number[] = [];
    for (let i = 0; i < allLines.length; i++) {
      if (allLines[i].type === 'match') {
        matchIndices.push(i);
      }
    }

    // Process each match with its surrounding context
    for (let i = 0; i < matchIndices.length; i++) {
      const matchIndex = matchIndices[i];
      const matchData = allLines[matchIndex].data;
      const matchLineNumber = matchData.line_number;
      const matchFilePath = matchData.path.text;
      
      // Find before context: context lines that are closer to this match than to the previous match
      const beforeContext: string[] = [];
      
      // Find the previous match in the same file
      let prevMatchLineNumber = 0;
      for (let k = i - 1; k >= 0; k--) {
        const prevMatchData = allLines[matchIndices[k]].data;
        if (prevMatchData.path.text === matchFilePath) {
          prevMatchLineNumber = prevMatchData.line_number;
          break;
        }
      }
      
      // Look for context lines before this match
      for (let j = matchIndex - 1; j >= 0; j--) {
        if (allLines[j].type === 'context') {
          const contextData = allLines[j].data;
          const contextLineNumber = contextData.line_number;
          
          // CRITICAL: Only consider context from the same file
          if (contextData.path.text !== matchData.path.text) {
            break; // Different file, stop looking
          }
          
          // Only include this context line if it's closer to current match than to previous match
          const distanceToCurrent = matchLineNumber - contextLineNumber;
          const distanceToPrevious = prevMatchLineNumber > 0 ? contextLineNumber - prevMatchLineNumber : Infinity;
          
          if (distanceToCurrent <= distanceToPrevious) {
            beforeContext.unshift(contextData.lines.text); // Add to beginning to maintain order
          } else {
            break; // This context belongs to previous match
          }
        } else if (allLines[j].type === 'match') {
          break; // Hit previous match, stop looking
        }
      }
      
      // Find after context: context lines that are closer to this match than to the next match
      const afterContext: string[] = [];
      
      // Find the next match in the same file
      let nextMatchLineNumber = Infinity;
      for (let k = i + 1; k < matchIndices.length; k++) {
        const nextMatchData = allLines[matchIndices[k]].data;
        if (nextMatchData.path.text === matchFilePath) {
          nextMatchLineNumber = nextMatchData.line_number;
          break;
        }
      }
      
      // Look for context lines after this match
      for (let j = matchIndex + 1; j < allLines.length; j++) {
        if (allLines[j].type === 'context') {
          const contextData = allLines[j].data;
          const contextLineNumber = contextData.line_number;
          
          // CRITICAL: Only consider context from the same file
          if (contextData.path.text !== matchData.path.text) {
            break; // Different file, stop looking
          }
          
          // Only include this context line if it's closer to current match than to next match
          const distanceToCurrent = contextLineNumber - matchLineNumber;
          const distanceToNext = nextMatchLineNumber < Infinity ? nextMatchLineNumber - contextLineNumber : Infinity;
          
          if (distanceToCurrent <= distanceToNext) {
            afterContext.push(contextData.lines.text);
          } else {
            break; // This context belongs to next match
          }
        } else if (allLines[j].type === 'match') {
          break; // Hit next match, stop looking
        }
      }

      // Extract submatch information for precise highlighting
      const submatches = matchData.submatches?.map((submatch: any) => ({
        start: submatch.start,
        end: submatch.end,
        text: submatch.match?.text || matchData.lines.text.substring(submatch.start, submatch.end)
      })) || [];

      // Create proper context array: before + match + after
      const fullContext = [
        ...beforeContext,
        matchData.lines.text,
        ...afterContext
      ];

      // Create result for actual match
      const result: SearchResult = {
        file: matchData.path.text,
        line: matchData.line_number,
        column: matchData.submatches[0]?.start || 0,
        content: matchData.lines.text, // Only the actual match line
        context: fullContext, // Full context for Solr storage with proper before/after
        score: 1.0,
        submatches: submatches // Include submatch positions for highlighting
      };
      results.push(result);
    }
  }

  /**
   * Search for symbols (functions, classes, etc.) using ripgrep with regex patterns
   */
  async searchSymbols(query: string): Promise<SearchResult[]> {
    const symbolPatterns = [
      `function\\s+${query}`,              // JavaScript/TypeScript functions
      `class\\s+${query}`,                 // Classes
      `interface\\s+${query}`,             // TypeScript interfaces
      `type\\s+${query}`,                  // TypeScript types
      `const\\s+${query}`,                 // Constants
      `let\\s+${query}`,                   // Variables
      `var\\s+${query}`,                   // Variables
      `def\\s+${query}`,                   // Python functions
      `class\\s+${query}:`,                // Python classes
      `public\\s+.*${query}`,              // Java/C# public methods
      `private\\s+.*${query}`,             // Java/C# private methods
      `protected\\s+.*${query}`,           // Java/C# protected methods
    ];

    const searchOptions: SearchOptions = {
      query: symbolPatterns.join('|'),
      useRegex: true,
      caseSensitive: false,
      maxResults: 50
    };

    return this.search(searchOptions);
  }
}
