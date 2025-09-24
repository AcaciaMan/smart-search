# Changelog

All notable changes to the "smart-search" extension will be documented in this file.

## [Unreleased]

### Added
- Initial release
- Smart search functionality with ripgrep integration
- Optional Solr indexing support
- AI-powered search result summaries
- Symbol search capabilities
- Interactive search results panel
- Workspace indexing commands
- Multi-folder workspace search support
- Intelligent file-based result limiting
- Enhanced relevance scoring with file frequency bonuses
- Grouped UI with file-level aggregation

### Changed
- **BREAKING**: Replaced `maxResults` configuration with `maxFiles` for better search experience
- Search now returns complete match sets from the most relevant files instead of arbitrary result limits
- UI now groups results by file to reduce repetitive file headers
- Improved relevance scoring (0.5-1.0 range) with file type awareness and match quality bonuses
- Enhanced multi-folder search with intelligent parallel/sequential processing

### Features
- Fast text search using ripgrep with file-based limiting
- Configurable search options (case sensitivity, regex, whole word)
- Webview-based results panel with file navigation and grouping
- Fallback from Solr to ripgrep search
- Smart file selection prioritizing complete match sets
- Context-aware search results

## [0.0.1] - 2025-07-31

### Added
- Initial project structure
- Core extension framework
- Basic search providers and services
- Configuration options
- Documentation
