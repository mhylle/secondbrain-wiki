import { Component, output, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { SearchBar } from '../../shared/components/search-bar/search-bar';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, SearchBar],
  templateUrl: './header.html',
  styleUrl: './header.css'
})
export class Header {
  private readonly router = inject(Router);
  readonly menuToggle = output<void>();

  onMenuToggle(): void {
    this.menuToggle.emit();
  }

  navigateToGraph(): void {
    const match = this.router.url.match(/\/wiki\/([^?#]+)/);
    if (match) {
      this.router.navigate(['/graph'], { queryParams: { focus: match[1] } });
    } else {
      this.router.navigate(['/graph']);
    }
  }
}
