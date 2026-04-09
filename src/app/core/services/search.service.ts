import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import MiniSearch from 'minisearch';

import { WikiStoreService } from './wiki-store.service';
import { WikiPageSummary } from '../models/wiki-page.model';

export interface SearchResult {
  slug: string;
  title: string;
  type: string;
  score: number;
  summary: string;
  tags: string[];
}

interface PrebuiltEntry {
  slug: string;
  title: string;
  type: string;
  confidence: string;
  tags: string[];
  headings: string[];
  summary: string;
  links: string[];
  sourceCount: number;
  bodyText: string;
}

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly store = inject(WikiStoreService);
  private readonly http = inject(HttpClient);
  private miniSearch: MiniSearch | null = null;
  private indexedSlugs = new Set<string>();

  readonly query = signal('');
  readonly results = computed<SearchResult[]>(() => {
    const q = this.query().trim();
    if (!q || !this.miniSearch) return [];
    return this.search(q);
  });

  buildIndex(): void {
    // Try pre-built index first, fall back to in-memory
    this.http.get<PrebuiltEntry[]>('assets/search-index.json').subscribe({
      next: entries => this.buildFromPrebuilt(entries),
      error: () => this.buildFromPages()
    });
  }

  private buildFromPrebuilt(entries: PrebuiltEntry[]): void {
    this.miniSearch = this.createMiniSearch();
    this.indexedSlugs.clear();

    const docs = entries.map(entry => ({
      id: entry.slug,
      title: entry.title,
      summary: entry.summary,
      tags: entry.tags.join(' '),
      headings: entry.headings.join(' '),
      type: entry.type,
      body: entry.bodyText
    }));

    this.miniSearch.addAll(docs);
    docs.forEach(d => this.indexedSlugs.add(d.id));
  }

  private buildFromPages(): void {
    this.miniSearch = this.createMiniSearch();
    this.indexedSlugs.clear();

    const index = this.store.pageIndex();
    const loadedPages = this.store.loadedPages();
    const docs: Array<Record<string, unknown>> = [];

    index.forEach((page, slug) => {
      const loaded = loadedPages.get(slug);
      const bodyText = loaded?.rawMarkdown
        ?.replace(/^---[\s\S]*?---/, '')
        .replace(/[#*_`\[\]|>]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2000) || '';
      docs.push({
        id: slug,
        title: page.title,
        summary: page.summary,
        tags: page.tags.join(' '),
        headings: '',
        type: page.type,
        body: bodyText
      });
      this.indexedSlugs.add(slug);
    });

    this.miniSearch.addAll(docs);
  }

  private createMiniSearch(): MiniSearch {
    return new MiniSearch({
      fields: ['title', 'summary', 'tags', 'headings', 'body'],
      storeFields: ['title', 'type', 'summary', 'tags'],
      searchOptions: {
        boost: { title: 3, headings: 2, tags: 2, summary: 1.5 },
        fuzzy: 0.2,
        prefix: true
      }
    });
  }

  enrichWithBody(slug: string, bodyText: string): void {
    if (!this.miniSearch || !this.indexedSlugs.has(slug)) return;

    try {
      const existing = this.miniSearch.getStoredFields(slug);
      if (existing) {
        this.miniSearch.replace({
          id: slug,
          title: existing['title'] as string,
          summary: existing['summary'] as string,
          tags: existing['tags'] as string,
          headings: '',
          type: existing['type'] as string,
          body: bodyText
        });
      }
    } catch {
      // ignore if document doesn't exist
    }
  }

  private search(query: string): SearchResult[] {
    if (!this.miniSearch) return [];

    return this.miniSearch.search(query).map(result => ({
      slug: result.id as string,
      title: (result['title'] as string) || '',
      type: (result['type'] as string) || '',
      score: result.score,
      summary: (result['summary'] as string) || '',
      tags: ((result['tags'] as string) || '').split(' ').filter(Boolean)
    }));
  }
}
