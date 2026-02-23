export { AISummaryService } from './aiSummaryService';
export { IndexManager } from './indexManager';
export { RipgrepSearcher } from './ripgrepSearcher';
export { HighlightService } from './highlightService';
export { SolrQueryBuilder } from './solrQueryBuilder';
export { SolrSessionManager } from './solrSessionManager';
export {
    SearchFilterPreset,
    getGlobalFilters,
    getWorkspaceFilters,
    saveGlobalFilters,
    saveWorkspaceFilters,
} from './filtersConfig';
export {
    FilterScope,
    ScopedPreset,
    listAllFilters,
    createFilter,
    updateFilter,
    deleteFilter,
    findFilter,
} from './presetsService';
export { resolveActiveFilterGlobs } from './globResolver';
