export interface SearchResult {
  file: string;
  line: number;
  column: number;
  content: string;
  context: string[];
  score: number;
  summary?: string;
}

export interface SearchOptions {
  query: string;
  maxResults?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  caseSensitive?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
}

export interface IndexEntry {
  id: string;
  file: string;
  content: string;
  symbols: Symbol[];
  lastModified: Date;
}

export interface Symbol {
  name: string;
  kind: string;
  line: number;
  column: number;
  scope: string;
}
