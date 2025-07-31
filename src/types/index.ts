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
  searchInResults?: boolean; // Search within previously stored ripgrep results
}

export interface StoredSearchResult {
  id: string;
  originalQuery: string;
  timestamp: Date;
  file: string;
  line: number;  
  column: number;
  content: string;
  context: string[];
  score: number;
  summary?: string;
}