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
      await firstValueFrom(this.githubApi.loadBundle());
      const paths = this.githubApi.getFilePaths();
      this.buildFilePathMap(paths);
      this.buildPageIndex(paths);
      this.initialized.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  getPage(slug: string): WikiPage | null {
    return this.loadedPages().get(slug) ?? null;
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

  private buildPageIndex(paths: string[]): void {
    const summaryPaths = paths.filter(
      p =>
        p !== 'wiki/log.md' &&
        p !== 'wiki/index.md' &&
        p.startsWith('wiki/')
    );

    const index = new Map<string, WikiPageSummary>();
    const pages = new Map<string, WikiPage>();

    for (const filePath of summaryPaths) {
      const raw = this.githubApi.getFileContent(filePath);
      if (!raw) continue;

      const { frontmatter, body } = this.parser.parseFrontmatter(raw);
      const slug = this.pathToSlug(filePath);
      if (!slug) continue;

      const firstLine = body
        .split('\n')
        .find(line => line.trim() && !line.startsWith('#'));

      index.set(slug, {
        slug,
        path: filePath,
        title: frontmatter.title || this.slugToTitle(slug),
        type: frontmatter.type,
        confidence: frontmatter.confidence,
        tier: frontmatter.tier,
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
