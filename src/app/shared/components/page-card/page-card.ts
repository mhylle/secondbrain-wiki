import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { WikiPageSummary, PAGE_TYPE_META, CONFIDENCE_META, TIER_META } from '../../../core/models/wiki-page.model';

@Component({
  selector: 'app-page-card',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './page-card.html',
  styleUrl: './page-card.css'
})
export class PageCard {
  readonly page = input.required<WikiPageSummary>();
  readonly typeMeta = PAGE_TYPE_META;
  readonly confidenceMeta = CONFIDENCE_META;
  readonly tierMeta = TIER_META;

  get typeColor(): string {
    return this.typeMeta[this.page().type]?.color || 'var(--color-text-muted)';
  }

  get typeLabel(): string {
    return this.typeMeta[this.page().type]?.label || this.page().type;
  }
}
