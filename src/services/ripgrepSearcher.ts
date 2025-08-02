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
        '--with-filename',
        '--context', (options.contextLines || 2).toString()
      ];

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

      rg.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.type === 'match') {
                const result: SearchResult = {
                  file: parsed.data.path.text,
                  line: parsed.data.line_number,
                  column: parsed.data.submatches[0]?.start || 0,
                  content: parsed.data.lines.text,
                  context: [], // Context would need additional processing
                  score: 1.0
                };
                results.push(result);
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
