import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { WikiStoreService } from '../../core/services/wiki-store.service';
import { SearchService } from '../../core/services/search.service';
import { WikiPage, PAGE_TYPE_META } from '../../core/models/wiki-page.model';
import { MarkdownRenderer } from '../../shared/components/markdown-renderer/markdown-renderer';
import { TagChip } from '../../shared/components/tag-chip/tag-chip';

@Component({
  selector: 'app-page',
  standalone: true,
  imports: [RouterLink, MarkdownRenderer, TagChip],
  templateUrl: './page.html',
  styleUrl: './page.css'
})
export class Page implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(WikiStoreService);
  private readonly searchService = inject(SearchService);
  private routeSub?: Subscription;

  readonly page = signal<WikiPage | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly typeMeta = PAGE_TYPE_META;

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe(params => {
      const slug = params.get('slug');
      if (slug) {
        this.loadPage(slug);
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  get typeColor(): string {
    const p = this.page();
    return p ? this.typeMeta[p.frontmatter.type]?.color || '' : '';
  }

  get typeLabel(): string {
    const p = this.page();
    return p ? this.typeMeta[p.frontmatter.type]?.label || p.frontmatter.type : '';
  }

  private loadPage(slug: string): void {
    this.loading.set(true);
    this.error.set('');
    const page = this.store.getPage(slug);
    if (page) {
      this.page.set(page);
      this.searchService.enrichWithBody(slug, page.rawMarkdown);
    } else {
      this.error.set(`Page "${slug}" not found.`);
    }
    this.loading.set(false);
  }
}
