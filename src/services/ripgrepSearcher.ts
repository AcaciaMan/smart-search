import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { SearchResult, SearchOptions } from '../types';

export class RipgrepSearcher {
  async search(options: SearchOptions): Promise<SearchResult[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder found');
    }

    // Log workspace folders being searched (can be disabled in production)
    const enableDebugLogging = vscode.workspace.getConfiguration('smart-search').get('enableDebugLogging', false);
    if (enableDebugLogging) {
      console.log(`Searching in ${workspaceFolders.length} workspace folder(s):`);
      workspaceFolders.forEach((folder, index) => {
        console.log(`  ${index + 1}. ${folder.name} (${folder.uri.fsPath})`);
      });
    }

    const results: SearchResult[] = [];
    
    // Decide whether to search in parallel or sequentially
    const config = vscode.workspace.getConfiguration('smart-search');
    const maxParallelFolders = config.get('maxParallelFolders', 5);
    const useParallelSearch = workspaceFolders.length > 1 && workspaceFolders.length <= maxParallelFolders;
    
    if (useParallelSearch) {
      // Parallel search for better performance with multiple folders
      if (enableDebugLogging) {
        console.log('Using parallel search for multiple folders...');
      }
      const searchPromises = workspaceFolders.map(async (folder) => {
        try {
          if (enableDebugLogging) {
            console.log(`Starting search in folder: ${folder.name}...`);
          }
          const folderResults = await this.searchInFolder(folder.uri.fsPath, options);
          if (enableDebugLogging) {
            console.log(`Found ${folderResults.length} results in ${folder.name}`);
          }
          return folderResults;
        } catch (error) {
          console.warn(`Error searching in folder ${folder.name}:`, error);
          return []; // Return empty array on error
        }
      });
      
      const allFolderResults = await Promise.all(searchPromises);
      allFolderResults.forEach(folderResults => results.push(...folderResults));
    } else {
      // Sequential search for single folder or many folders (to avoid overwhelming system)
      if (enableDebugLogging) {
        console.log('Using sequential search...');
      }
      for (const folder of workspaceFolders) {
        try {
          if (enableDebugLogging) {
            console.log(`Searching folder: ${folder.name}...`);
          }
          const folderResults = await this.searchInFolder(folder.uri.fsPath, options);
          if (enableDebugLogging) {
            console.log(`Found ${folderResults.length} results in ${folder.name}`);
          }
          results.push(...folderResults);
        } catch (error) {
          console.warn(`Error searching in folder ${folder.name}:`, error);
          // Continue with other folders even if one fails
        }
      }
    }

    if (enableDebugLogging) {
      console.log(`Total results from all folders: ${results.length}`);
    }

    // Apply file-level scoring bonuses based on match frequency per file
    this.applyFileFrequencyBonus(results);
    
    // Sort results by relevance score (highest first) before applying limit
    // This ensures that when we exceed maxResults, we keep the most relevant results
    results.sort((a, b) => b.score - a.score);
    
    const maxResults = options.maxResults || 100;
    const limitedResults = results.slice(0, maxResults);
    
    if (enableDebugLogging && results.length > maxResults) {
      console.log(`Sorted and limited results: ${limitedResults.length}/${results.length} (kept highest scoring)`);
      console.log(`Score range: ${limitedResults[0]?.score.toFixed(3)} - ${limitedResults[limitedResults.length - 1]?.score.toFixed(3)}`);
    }
    
    return limitedResults;
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
        this.processAllLines(allLines, results, options);
        
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
  }>, results: SearchResult[], searchOptions: SearchOptions) {
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
        score: this.calculateRelevanceScore(matchData, searchOptions),
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

  /**
   * Apply file frequency bonus to results based on number of matches per file
   * Files with more matches get higher scores as they are likely more relevant
   */
  private applyFileFrequencyBonus(results: SearchResult[]): void {
    // Count matches per file
    const fileMatchCounts = new Map<string, number>();
    results.forEach(result => {
      const currentCount = fileMatchCounts.get(result.file) || 0;
      fileMatchCounts.set(result.file, currentCount + 1);
    });

    // Calculate file frequency bonuses
    const maxMatchesInFile = Math.max(...fileMatchCounts.values());
    const enableDebugLogging = vscode.workspace.getConfiguration('smart-search').get('enableDebugLogging', false);
    
    if (enableDebugLogging) {
      console.log(`File match distribution: ${fileMatchCounts.size} files, max ${maxMatchesInFile} matches per file`);
    }

    // Apply bonuses to each result based on its file's match count
    results.forEach(result => {
      const matchesInFile = fileMatchCounts.get(result.file) || 1;
      
      // Calculate frequency bonus (0.0 to 0.2 based on relative frequency)
      let frequencyBonus = 0;
      
      if (matchesInFile >= 2) {
        // Linear scaling: 2 matches = +0.05, 5 matches = +0.1, 10+ matches = +0.2
        const normalizedFreq = Math.min(matchesInFile / 10, 1.0); // Cap at 10 matches
        frequencyBonus = normalizedFreq * 0.2;
        
        // Additional bonus for files with many matches
        if (matchesInFile >= 5) {
          frequencyBonus += 0.05; // Extra bonus for high-frequency files
        }
        if (matchesInFile >= 10) {
          frequencyBonus += 0.05; // Even more bonus for very high-frequency files
        }
      }
      
      // Apply the bonus while keeping score in valid range
      const originalScore = result.score;
      result.score = Math.min(result.score + frequencyBonus, 1.0);
      
      if (enableDebugLogging && frequencyBonus > 0) {
        console.log(`File frequency bonus: ${result.file} (${matchesInFile} matches) ${originalScore.toFixed(3)} → ${result.score.toFixed(3)} (+${frequencyBonus.toFixed(3)})`);
      }
    });
  }

  /**
   * Calculate relevance score based on match characteristics
   * Returns a score between 0.0 and 1.0
   */
  private calculateRelevanceScore(matchData: any, searchOptions: SearchOptions): number {
    let score = 0.5; // Base score
    
    const matchText = matchData.lines.text.toLowerCase();
    const searchQuery = searchOptions.query.toLowerCase();
    
    // Exact match gets highest score
    if (matchText.includes(searchQuery)) {
      score += 0.3;
      
      // Whole word match gets bonus
      const wordBoundaryRegex = new RegExp(`\\b${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (wordBoundaryRegex.test(matchText)) {
        score += 0.2;
      }
    }
    
    // File type relevance
    const filePath = matchData.path.text.toLowerCase();
    const isSourceCode = /\.(js|ts|py|java|cpp|c|h|css|html|jsx|tsx)$/i.test(filePath);
    const isConfig = /\.(json|yml|yaml|xml|config|ini|properties)$/i.test(filePath);
    const isDoc = /\.(md|txt|rst|doc)$/i.test(filePath);
    
    if (isSourceCode) {
      score += 0.2;
    } else if (isConfig) {
      score += 0.1;
    } else if (isDoc) {
      score += 0.05;
    }
    
    // Submatch count (more matches in line = higher relevance)
    const submatchCount = matchData.submatches?.length || 1;
    score += Math.min(submatchCount * 0.05, 0.15);
    
    // Position in line (earlier matches slightly more relevant)
    const firstMatchColumn = matchData.submatches?.[0]?.start || 0;
    if (firstMatchColumn < 20) {
      score += 0.05;
    }
    
    // Case sensitivity bonus (if user specified case sensitive)
    if (searchOptions.caseSensitive && matchText.includes(searchOptions.query)) {
      score += 0.1;
    }
    
    // Ensure score is within bounds
    return Math.min(Math.max(score, 0.0), 1.0);
  }
}
