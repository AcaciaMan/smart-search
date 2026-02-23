import { SearchOptions, StoredSearchResult } from '../types';

export interface HighlightOptions {
  preTag?: string;
  postTag?: string;
  fragmentSize?: number;
  maxFragments?: number;
  className?: string;
}

export interface HighlightedText {
  text: string;
  highlighted: boolean;
}

export interface HighlightFragment {
  content: string;
  score: number;
  startOffset: number;
}

export class HighlightService {
  private defaultOptions: HighlightOptions = {
    preTag: '<mark class="highlight">',
    postTag: '</mark>',
    fragmentSize: 150,
    maxFragments: 3,
    className: 'highlight'
  };

  /**
   * Build Solr highlighting parameters for queries
   */
  public buildSolrHighlightParams(options: SearchOptions, highlightOptions?: HighlightOptions): Record<string, any> {
    const opts = { ...this.defaultOptions, ...highlightOptions };
    
    return {
      hl: 'true',
      'hl.fl': 'content_highlight,code_highlight,match_text,full_line,context_before,context_after',
      'hl.simple.pre': opts.preTag,
      'hl.simple.post': opts.postTag,
      'hl.fragsize': opts.fragmentSize,
      'hl.snippets': opts.maxFragments,
      'hl.maxAnalyzedChars': 500000, // Analyze up to 500KB per field
      'hl.alternateField': 'match_text', // Fallback field if no highlights found
      'hl.maxAlternateFieldLength': 200,
      'hl.highlightMultiTerm': 'true', // Highlight wildcard, fuzzy, range queries
      'hl.mergeContiguous': 'true', // Merge adjacent highlighted terms
      'hl.requireFieldMatch': 'false', // Allow highlights from different fields
      'hl.usePhraseHighlighter': 'true', // Better phrase highlighting
      'hl.highlightPhrase': 'true'
      // Removed problematic parameters that cause 400 errors:
      // 'hl.regex.slop': '0.6', // Flexibility for regex fragmenter
      // 'hl.fragmenter': 'gap', // Use gap fragmenter for better performance
      // 'hl.formatter': 'html', // Use HTML formatter
      // 'hl.encoder': 'html' // Safe HTML encoding
    };
  }

  /**
   * Apply highlighting to search results using Solr highlighting response
   */
  public applySolrHighlighting(
    results: StoredSearchResult[], 
    highlighting: Record<string, any>, 
    query: string
  ): StoredSearchResult[] {
    return results.map(result => {
      const docHighlighting = highlighting[result.id] || {};
      
      // Apply highlighting to various fields
      const highlightedResult = { ...result };

      // Highlight main match text
      if (docHighlighting.match_text && docHighlighting.match_text.length > 0) {
        highlightedResult.match_text = docHighlighting.match_text[0];
      } else if (docHighlighting.full_line && docHighlighting.full_line.length > 0) {
        highlightedResult.match_text = docHighlighting.full_line[0];
      } else {
        // Fallback: apply client-side highlighting
        highlightedResult.match_text = this.highlightText(result.match_text || '', query);
      }

      // Highlight full line if available
      if (docHighlighting.full_line && docHighlighting.full_line.length > 0) {
        highlightedResult.full_line = docHighlighting.full_line[0];
      } else if (result.full_line) {
        highlightedResult.full_line = this.highlightText(result.full_line, query);
      }

      // Highlight context before
      if (docHighlighting.context_before && docHighlighting.context_before.length > 0) {
        highlightedResult.context_before_highlighted = docHighlighting.context_before;
      } else if (result.context_before) {
        highlightedResult.context_before_highlighted = result.context_before.map(line => 
          this.highlightText(line, query)
        );
      }

      // Highlight context after
      if (docHighlighting.context_after && docHighlighting.context_after.length > 0) {
        highlightedResult.context_after_highlighted = docHighlighting.context_after;
      } else if (result.context_after) {
        highlightedResult.context_after_highlighted = result.context_after.map(line => 
          this.highlightText(line, query)
        );
      }

      // Generate snippets from highlighted content
      highlightedResult.snippets = this.generateSnippets(result, docHighlighting, query);

      return highlightedResult;
    });
  }

  /**
   * HTML-escape a plain-text string to prevent XSS injection.
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Client-side text highlighting for fallback scenarios.
   * The input text is HTML-escaped before <mark> tags are inserted,
   * so the caller must not escape it again before injecting into HTML.
   */
  public highlightText(text: string, query: string, className: string = 'highlight'): string {
    if (!query || !text) return text;
    
    // Split query into individual terms and remove operators
    const terms = this.extractSearchTerms(query);
    // Escape the whole text FIRST so that raw HTML in source content cannot
    // be injected into the webview (XSS fix).
    let highlightedText = this.escapeHtml(text);
    
    terms.forEach(term => {
      if (term.length > 0) {
        // HTML-escape the term before regex-escaping, because we are now
        // matching against the already-HTML-escaped text.
        const escapedTerm = this.escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedTerm})`, 'gi');
        highlightedText = highlightedText.replace(regex, `<mark class="${className}">$1</mark>`);
      }
    });
    
    return highlightedText;
  }

  /**
   * Generate text snippets with highlighting
   */
  public generateSnippets(
    result: StoredSearchResult, 
    highlighting: Record<string, any>, 
    query: string,
    maxSnippets: number = 3
  ): string[] {
    const snippets: string[] = [];

    // Use Solr-generated snippets if available
    if (highlighting.content_all) {
      snippets.push(...highlighting.content_all.slice(0, maxSnippets));
    } else if (highlighting.code_all) {
      snippets.push(...highlighting.code_all.slice(0, maxSnippets));
    }

    // If we have snippets from Solr, return them
    if (snippets.length > 0) {
      return snippets;
    }

    // Generate client-side snippets as fallback
    const content = result.full_line || result.match_text || '';
    if (content) {
      const snippet = this.extractSnippet(content, query, 150);
      if (snippet) {
        snippets.push(this.highlightText(snippet, query));
      }
    }

    // Add context snippets if available
    if (result.context_before && result.context_before.length > 0) {
      const contextSnippet = result.context_before[result.context_before.length - 1];
      if (contextSnippet && this.containsSearchTerms(contextSnippet, query)) {
        snippets.push(this.highlightText(contextSnippet, query));
      }
    }

    if (result.context_after && result.context_after.length > 0) {
      const contextSnippet = result.context_after[0];
      if (contextSnippet && this.containsSearchTerms(contextSnippet, query)) {
        snippets.push(this.highlightText(contextSnippet, query));
      }
    }

    return snippets.slice(0, maxSnippets);
  }

  /**
   * Extract a snippet around search terms
   */
  private extractSnippet(text: string, query: string, maxLength: number = 150): string {
    const terms = this.extractSearchTerms(query);
    if (terms.length === 0) return text.substring(0, maxLength);

    // Find the first occurrence of any search term
    let earliestIndex = text.length;
    let foundTerm = '';

    terms.forEach(term => {
      const index = text.toLowerCase().indexOf(term.toLowerCase());
      if (index !== -1 && index < earliestIndex) {
        earliestIndex = index;
        foundTerm = term;
      }
    });

    if (earliestIndex === text.length) {
      return text.substring(0, maxLength);
    }

    // Calculate snippet boundaries
    const halfLength = Math.floor(maxLength / 2);
    let start = Math.max(0, earliestIndex - halfLength);
    let end = Math.min(text.length, earliestIndex + foundTerm.length + halfLength);

    // Adjust to word boundaries if possible
    if (start > 0) {
      const spaceIndex = text.indexOf(' ', start);
      if (spaceIndex !== -1 && spaceIndex < start + 20) {
        start = spaceIndex + 1;
      }
    }

    if (end < text.length) {
      const spaceIndex = text.lastIndexOf(' ', end);
      if (spaceIndex !== -1 && spaceIndex > end - 20) {
        end = spaceIndex;
      }
    }

    let snippet = text.substring(start, end);

    // Add ellipsis if truncated
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';

    return snippet;
  }

  /**
   * Extract search terms from query, handling operators and quotes
   */
  private extractSearchTerms(query: string): string[] {
    // Remove Solr operators and field specifications
    let cleanQuery = query
      .replace(/\b(AND|OR|NOT)\b/gi, ' ')
      .replace(/[+\-]/g, ' ')
      .replace(/\w+:/g, ' ') // Remove field specifications like "content:"
      .replace(/[()]/g, ' ');

    // Extract quoted phrases
    const phrases: string[] = [];
    const phraseRegex = /"([^"]+)"/g;
    let match;
    while ((match = phraseRegex.exec(cleanQuery)) !== null) {
      phrases.push(match[1]);
      cleanQuery = cleanQuery.replace(match[0], ' ');
    }

    // Extract individual words
    const words = cleanQuery
      .split(/\s+/)
      .filter(term => term.length > 1)
      .map(term => term.replace(/[^a-zA-Z0-9]/g, ''))
      .filter(term => term.length > 1);

    return [...phrases, ...words];
  }

  /**
   * Check if text contains any of the search terms
   */
  private containsSearchTerms(text: string, query: string): boolean {
    const terms = this.extractSearchTerms(query);
    const lowerText = text.toLowerCase();
    
    return terms.some(term => lowerText.includes(term.toLowerCase()));
  }

  /**
   * Parse highlighted text into segments
   */
  public parseHighlightedText(highlightedText: string): HighlightedText[] {
    const segments: HighlightedText[] = [];
    const regex = /<mark[^>]*>(.*?)<\/mark>/gi;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(highlightedText)) !== null) {
      // Add text before highlight
      if (match.index > lastIndex) {
        const beforeText = highlightedText.substring(lastIndex, match.index);
        if (beforeText) {
          segments.push({ text: beforeText, highlighted: false });
        }
      }

      // Add highlighted text
      segments.push({ text: match[1], highlighted: true });
      lastIndex = regex.lastIndex;
    }

    // Add remaining text after last highlight
    if (lastIndex < highlightedText.length) {
      const afterText = highlightedText.substring(lastIndex);
      if (afterText) {
        segments.push({ text: afterText, highlighted: false });
      }
    }

    return segments;
  }

  /**
   * Remove HTML tags from highlighted text
   */
  public stripHighlighting(highlightedText: string): string {
    return highlightedText.replace(/<\/?mark[^>]*>/gi, '');
  }

  /**
   * Get highlighting statistics
   */
  public getHighlightStats(highlightedText: string): { totalHighlights: number; totalLength: number; highlightedLength: number } {
    const segments = this.parseHighlightedText(highlightedText);
    const highlightedSegments = segments.filter(s => s.highlighted);
    
    return {
      totalHighlights: highlightedSegments.length,
      totalLength: segments.reduce((sum, s) => sum + s.text.length, 0),
      highlightedLength: highlightedSegments.reduce((sum, s) => sum + s.text.length, 0)
    };
  }
}
