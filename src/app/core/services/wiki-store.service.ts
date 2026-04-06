import { Injectable, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { GitHubApiService } from './github-api.service';
import { MarkdownParserService } from './markdown-parser.service';
import { WikiPage, WikiPageSummary, PageType } from '../models/wiki-page.model';

@Injectable({ providedIn: 'root' })
export class WikiStoreService {
  private readonly githubApi = inject(GitHubApiService);
  private readonly parser = inject(MarkdownParserService);

  readonly pageIndex = signal<Map<string, WikiPageSummary>>(new Map());
  readonly loadedPages = signal<Map<string, WikiPage>>(new Map());
  readonly loading = signal(false);
  readonly initialized = signal(false);

  readonly allTags = computed(() => {
    const tags = new Set<string>();
    this.pageIndex().forEach(page => page.tags.forEach(tag => tags.add(tag)));
    return [...tags].sort();
  });

  readonly pagesByType = computed(() => {
    const grouped: Record<string, WikiPageSummary[]> = {};
    this.pageIndex().forEach(page => {
      if (!grouped[page.type]) {
        grouped[page.type] = [];
      }
      grouped[page.type].push(page);
    });
    Object.values(grouped).forEach(pages => pages.sort((a, b) => a.title.localeCompare(b.title)));
    return grouped as Record<PageType, WikiPageSummary[]>;
  });

  readonly pageCount = computed(() => this.pageIndex().size);
  readonly sourceCount = computed(() => (this.pagesByType()['source'] || []).length);

  private filePaths: Map<string, string> = new Map();

  async initialize(): Promise<void> {
    if (this.initialized()) return;
    this.loading.set(true);

    try {
      const paths = await firstValueFrom(this.githubApi.fetchTree());
      this.buildFilePathMap(paths);
      await this.buildPageIndex(paths);
      this.initialized.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  async getPage(slug: string): Promise<WikiPage | null> {
    const cached = this.loadedPages().get(slug);
    if (cached) return cached;

    const filePath = this.filePaths.get(slug);
    if (!filePath) return null;

    const raw = await firstValueFrom(this.githubApi.fetchFileContent(filePath));
    const { frontmatter, body } = this.parser.parseFrontmatter(raw);
    const renderedHtml = this.parser.renderToHtml(body);
    const outgoingLinks = this.parser.extractLinks(raw);

    const page: WikiPage = {
      slug,
      path: filePath,
      frontmatter,
      rawMarkdown: raw,
      renderedHtml,
      outgoingLinks
    };

    this.loadedPages.update(m => {
      const updated = new Map(m);
      updated.set(slug, page);
      return updated;
    });

    return page;
  }

  getPageSummary(slug: string): WikiPageSummary | undefined {
    return this.pageIndex().get(slug);
  }

  resolveSlugPath(slug: string): string | null {
    return this.filePaths.get(slug) || null;
  }

  private buildFilePathMap(paths: string[]): void {
    this.filePaths.clear();
    for (const p of paths) {
      const slug = this.pathToSlug(p);
      if (slug) {
        this.filePaths.set(slug, p);
      }
    }
  }

  private async buildPageIndex(paths: string[]): Promise<void> {
    const summaryPaths = paths.filter(
      p =>
        p !== 'wiki/log.md' &&
        p !== 'wiki/index.md' &&
        p.startsWith('wiki/')
    );

    const batchSize = 10;
    const index = new Map<string, WikiPageSummary>();
    const pages = new Map<string, WikiPage>();

    for (let i = 0; i < summaryPaths.length; i += batchSize) {
      const batch = summaryPaths.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async filePath => {
          try {
            const raw = await firstValueFrom(this.githubApi.fetchFileContent(filePath));
            const { frontmatter, body } = this.parser.parseFrontmatter(raw);
            const slug = this.pathToSlug(filePath);
            if (!slug) return;

            const firstLine = body
              .split('\n')
              .find(line => line.trim() && !line.startsWith('#'));

            index.set(slug, {
              slug,
              path: filePath,
              title: frontmatter.title || this.slugToTitle(slug),
              type: frontmatter.type,
              tags: frontmatter.tags,
              summary: firstLine?.trim() || '',
              updated: frontmatter.updated || frontmatter.created || ''
            });

            pages.set(slug, {
              slug,
              path: filePath,
              frontmatter,
              rawMarkdown: raw,
              renderedHtml: this.parser.renderToHtml(body),
              outgoingLinks: this.parser.extractLinks(raw)
            });
          } catch {
            // skip files that fail to load
          }
        })
      );
    }

    this.pageIndex.set(index);
    this.loadedPages.set(pages);
  }

  private pathToSlug(filePath: string): string | null {
    const match = filePath.match(/wiki\/(?:[\w-]+\/)?(.+)\.md$/);
    return match ? match[1] : null;
  }

  private slugToTitle(slug: string): string {
    return slug
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }
}
