import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-tag-chip',
  standalone: true,
  imports: [RouterLink],
  template: `<a class="tag-chip" [routerLink]="['/tags', tag()]">{{ tag() }}</a>`,
  styles: `
    .tag-chip {
      display: inline-block;
      padding: 2px 10px;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--color-tag-text);
      background: var(--color-tag-bg);
      border-radius: 12px;
      text-decoration: none;
      transition: background 0.12s;
    }
    .tag-chip:hover {
      background: var(--color-border);
      text-decoration: none;
    }
  `
})
export class TagChip {
  readonly tag = input.required<string>();
}
