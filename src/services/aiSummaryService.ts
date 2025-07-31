import { SearchResult } from '../types';

export class AISummaryService {
  async addSummaries(results: SearchResult[]): Promise<SearchResult[]> {
    // This is a placeholder for AI summary functionality
    // In a real implementation, you would integrate with an AI service
    // like OpenAI GPT, Azure Cognitive Services, or a local model
    
    return results.map(result => ({
      ...result,
      summary: this.generateSimpleSummary(result)
    }));
  }

  private generateSimpleSummary(result: SearchResult): string {
    const content = result.content.trim();
    
    // Simple heuristic-based summary
    if (content.length <= 100) {
      return content;
    }

    // Extract first sentence or first 100 characters
    const firstSentence = content.match(/^[^.!?]*[.!?]/);
    if (firstSentence) {
      return firstSentence[0].trim();
    }

    return content.substring(0, 97) + '...';
  }

  // Future method for AI-powered summaries
  async generateAISummary(content: string): Promise<string> {
    // TODO: Implement actual AI integration
    // This could use OpenAI API, Azure OpenAI, or local models
    return this.generateSimpleSummary({ content } as SearchResult);
  }
}
