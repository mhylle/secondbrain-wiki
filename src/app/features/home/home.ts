import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

import { WikiStoreService } from '../../core/services/wiki-store.service';
import { MarkdownRenderer } from '../../shared/components/markdown-renderer/markdown-renderer';
import { PageCard } from '../../shared/components/page-card/page-card';
import { PAGE_TYPE_META, PageType, WikiPageSummary } from '../../core/models/wiki-page.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, MarkdownRenderer, PageCard],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class Home implements OnInit {
  private readonly store = inject(WikiStoreService);

  readonly pageCount = this.store.pageCount;
  readonly sourceCount = this.store.sourceCount;
  readonly pagesByType = this.store.pagesByType;
  readonly typeMeta = PAGE_TYPE_META;
  readonly overviewHtml = signal('');
  readonly loading = signal(true);

  readonly typeOrder: PageType[] = ['source', 'concept', 'entity', 'comparison'];

  async ngOnInit(): Promise<void> {
    try {
      const overviewPage = await this.store.getPage('overview');
      if (overviewPage) {
        this.overviewHtml.set(overviewPage.renderedHtml);
      }
    } finally {
      this.loading.set(false);
    }
  }

  getRecentPages(): WikiPageSummary[] {
    const all: WikiPageSummary[] = [];
    this.store.pageIndex().forEach(p => all.push(p));
    return all
      .filter(p => p.type !== 'overview')
      .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))
      .slice(0, 8);
  }

  getTypesWithPages(): PageType[] {
    const grouped = this.pagesByType();
    return this.typeOrder.filter(type => grouped[type]?.length > 0);
  }
}
