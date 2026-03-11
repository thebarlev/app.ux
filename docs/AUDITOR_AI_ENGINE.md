# Auditor AI Engine

## Overview

The Auditor now includes an SEO + AI analysis layer that extends the existing crawl, extraction, and rules pipeline. The goal is to convert sampled page data into actionable recommendations for Google, ChatGPT, Claude, Perplexity, and other AI search surfaces.

## Pipeline Integration

The scan pipeline now flows through these analysis stages after page extraction:

1. `extract`
2. `keyword_analysis`
3. `topic_discovery`
4. `rules`
5. `ai_readiness`
6. `recommendations`
7. `persist`

For backward compatibility, legacy `ai_files` support is still preserved in the runner, but new scans collect those assets during the `sample` stage instead of using a dedicated step.

## Keyword Extraction System

Keyword extraction is implemented in `lib/auditor/analysis/keywords.ts`.

It combines:

- title and heading weighting
- phrase frequency analysis
- question detection
- entity promotion from extracted content

Keywords are stored in `auditor_keywords` with these categories:

- `primary`
- `secondary`
- `question`
- `entity`

Each keyword record is persisted with a confidence score so the admin screen can prioritize the strongest terms.

## Topic Discovery Engine

Topic discovery is implemented in `lib/auditor/analysis/topics.ts`.

The engine:

- groups related keywords by normalized phrase roots
- clusters scan-wide topic themes
- computes `coverage_score`
- computes `missing_pages`

Results are stored in `auditor_topics` and are intended to reveal topic gaps across the sampled site.

## AI Readiness Scoring

AI readiness analysis is implemented in `lib/auditor/analysis/ai-readiness.ts`.

Each extracted page receives an `ai_analysis` JSON payload in `auditor_scan_pages` with:

- `ai_score`
- `ai_signals`
- `analyzed_at`

The scoring model evaluates:

- entity coverage
- question coverage
- semantic heading structure
- structured data presence
- content depth

The scan-level report also stores an `ai_readiness_summary` with average score, top strengths, and top gaps.

## Recommendation Engine

Recommendation generation is implemented in `lib/auditor/analysis/recommendations.ts`.

The engine combines:

- rules output
- extracted keywords
- discovered topics
- per-page AI readiness scores

It generates persisted recommendations in `auditor_recommendations` for opportunities such as:

- missing supporting pages
- weak heading structure
- missing schema
- unanswered question patterns
- weak internal linking
- missing AI crawler metadata

## Content Extraction Engine

Content extraction is implemented in `lib/auditor/analysis/content-extract.ts`.

It uses:

- `cheerio`
- `@mozilla/readability`

The extractor cleans page HTML and returns:

- page title
- heading list
- text paragraphs
- links
- detected entities

These derived content signals are stored inside `auditor_scan_pages.extracted` and then reused by keyword and AI readiness analysis.

## Admin Scan Detail View

The admin scan detail page now exposes dedicated tabs for:

- keywords
- topics
- recommendations

These tabs read directly from:

- `auditor_keywords`
- `auditor_topics`
- `auditor_recommendations`

## Database Changes

Migration `scripts/095-auditor-ai-analysis.sql` introduces:

- `auditor_keywords`
- `auditor_topics`
- `auditor_recommendations`
- `auditor_scan_pages.ai_analysis`

The migration stays isolated to Auditor objects and does not modify billing, invoices, Cardcom, or subscription logic.
