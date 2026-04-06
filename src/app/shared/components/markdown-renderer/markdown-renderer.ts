import { Component, input, inject, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-markdown-renderer',
  standalone: true,
  template: `<div class="markdown-body" [innerHTML]="safeHtml()"></div>`,
  styleUrl: './markdown-renderer.css'
})
export class MarkdownRenderer implements AfterViewInit, OnDestroy {
  readonly html = input.required<string>();

  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly elRef = inject(ElementRef);
  private clickHandler?: (event: MouseEvent) => void;

  safeHtml(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.html());
  }

  ngAfterViewInit(): void {
    this.clickHandler = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const anchor = target.closest('a.wiki-link') as HTMLAnchorElement | null;
      if (anchor) {
        event.preventDefault();
        const href = anchor.getAttribute('href');
        if (href) {
          this.router.navigateByUrl(href);
        }
      }
    };
    (this.elRef.nativeElement as HTMLElement).addEventListener('click', this.clickHandler);
  }

  ngOnDestroy(): void {
    if (this.clickHandler) {
      (this.elRef.nativeElement as HTMLElement).removeEventListener('click', this.clickHandler);
    }
  }
}
