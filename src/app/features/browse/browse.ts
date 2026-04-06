import { Component, inject, computed, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';

import { WikiStoreService } from '../../core/services/wiki-store.service';
import { PAGE_TYPE_META, PageType, WikiPageSummary } from '../../core/models/wiki-page.model';
import { PageCard } from '../../shared/components/page-card/page-card';

@Component({
  selector: 'app-browse',
  standalone: true,
  imports: [PageCard],
  templateUrl: './browse.html',
  styleUrl: './browse.css'
})
export class Browse implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(WikiStoreService);
  private routeSub?: Subscription;

  readonly typeMeta = PAGE_TYPE_META;

  filterType: PageType | null = null;
  filterTag: string | null = null;
  title = '';

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe(params => {
      const type = params.get('type') as PageType | null;
      const tag = params.get('tag');

      if (type) {
        this.filterType = type;
        this.filterTag = null;
        this.title = this.typeMeta[type]?.pluralLabel || type;
      } else if (tag) {
        this.filterTag = tag;
        this.filterType = null;
        this.title = `Tagged: ${tag}`;
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  get filteredPages(): WikiPageSummary[] {
    const pages: WikiPageSummary[] = [];
    this.store.pageIndex().forEach(p => {
      if (this.filterType && p.type !== this.filterType) return;
      if (this.filterTag && !p.tags.includes(this.filterTag)) return;
      if (p.type === 'overview') return;
      pages.push(p);
    });
    return pages.sort((a, b) => a.title.localeCompare(b.title));
  }
}
