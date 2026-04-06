import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { SearchService } from '../../../core/services/search.service';

@Component({
  selector: 'app-search-bar',
  standalone: true,
  templateUrl: './search-bar.html',
  styleUrl: './search-bar.css'
})
export class SearchBar {
  private readonly router = inject(Router);
  private readonly searchService = inject(SearchService);

  readonly inputValue = signal('');
  readonly showDropdown = signal(false);

  get quickResults() {
    return this.searchService.results().slice(0, 5);
  }

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.inputValue.set(value);
    this.searchService.query.set(value);
    this.showDropdown.set(value.trim().length > 0);
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    const q = this.inputValue().trim();
    if (q) {
      this.showDropdown.set(false);
      this.router.navigate(['/search'], { queryParams: { q } });
    }
  }

  navigateTo(slug: string): void {
    this.showDropdown.set(false);
    this.inputValue.set('');
    this.searchService.query.set('');
    this.router.navigate(['/wiki', slug]);
  }

  onBlur(): void {
    setTimeout(() => this.showDropdown.set(false), 200);
  }
}
