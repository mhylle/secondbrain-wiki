import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { WikiStoreService } from '../../core/services/wiki-store.service';
import { PAGE_TYPE_META, PageType } from '../../core/models/wiki-page.model';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css'
})
export class Sidebar {
  private readonly store = inject(WikiStoreService);

  readonly pagesByType = this.store.pagesByType;
  readonly typeMeta = PAGE_TYPE_META;

  readonly typeOrder: PageType[] = [
    'source',
    'concept',
    'entity',
    'comparison',
    'question',
    'artifact'
  ];

  expandedTypes = new Set<PageType>(['source', 'concept', 'entity']);

  toggleType(type: PageType): void {
    if (this.expandedTypes.has(type)) {
      this.expandedTypes.delete(type);
    } else {
      this.expandedTypes.add(type);
    }
  }

  isExpanded(type: PageType): boolean {
    return this.expandedTypes.has(type);
  }

  getTypesWithPages(): PageType[] {
    const grouped = this.pagesByType();
    return this.typeOrder.filter(type => grouped[type]?.length > 0);
  }
}
