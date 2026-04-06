import { Injectable, inject, signal, computed } from '@angular/core';
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

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly store = inject(WikiStoreService);
  private miniSearch: MiniSearch | null = null;
  private indexedSlugs = new Set<string>();

  readonly query = signal('');
  readonly results = computed<SearchResult[]>(() => {
    const q = this.query().trim();
    if (!q || !this.miniSearch) return [];
    return this.search(q);
  });

  buildIndex(): void {
    this.miniSearch = new MiniSearch({
      fields: ['title', 'summary', 'tags', 'body'],
      storeFields: ['title', 'type', 'summary', 'tags'],
      searchOptions: {
        boost: { title: 3, tags: 2, summary: 1.5 },
        fuzzy: 0.2,
        prefix: true
      }
    });

    this.indexedSlugs.clear();
    const index = this.store.pageIndex();
    const docs: Array<Record<string, unknown>> = [];

    index.forEach((page, slug) => {
      docs.push({
        id: slug,
        title: page.title,
        summary: page.summary,
        tags: page.tags.join(' '),
        type: page.type,
        body: ''
      });
      this.indexedSlugs.add(slug);
    });

    this.miniSearch.addAll(docs);
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
