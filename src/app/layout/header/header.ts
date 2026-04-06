import { Component, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SearchBar } from '../../shared/components/search-bar/search-bar';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, SearchBar],
  templateUrl: './header.html',
  styleUrl: './header.css'
})
export class Header {
  readonly menuToggle = output<void>();

  onMenuToggle(): void {
    this.menuToggle.emit();
  }
}
