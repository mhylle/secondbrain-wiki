import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { SearchService, SearchResult } from '../../core/services/search.service';
import { PAGE_TYPE_META } from '../../core/models/wiki-page.model';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './search.html',
  styleUrl: './search.css'
})
export class Search implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly searchService = inject(SearchService);
  private routeSub?: Subscription;

  readonly typeMeta = PAGE_TYPE_META;
  query = '';
  results: SearchResult[] = [];

  ngOnInit(): void {
    this.routeSub = this.route.queryParamMap.subscribe(params => {
      this.query = params.get('q') || '';
      if (this.query) {
        this.searchService.query.set(this.query);
        this.results = this.searchService.results();
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }
}
