import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export interface WikiDataBundle {
  fetchedAt: string;
  branch: string;
  fileCount: number;
  files: Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class GitHubApiService {
  private readonly http = inject(HttpClient);
  private bundle: WikiDataBundle | null = null;

  /**
   * Loads the pre-built wiki-data.json bundle (generated at build time
   * by tools/fetch-wiki.mjs from the private secondbrain repo).
   */
  loadBundle(): Observable<WikiDataBundle> {
    return this.http.get<WikiDataBundle>('assets/wiki-data.json').pipe(
      map(data => {
        this.bundle = data;
        return data;
      })
    );
  }

  getBundle(): WikiDataBundle | null {
    return this.bundle;
  }

  getFilePaths(): string[] {
    if (!this.bundle) return [];
    return Object.keys(this.bundle.files);
  }

  getFileContent(filePath: string): string | null {
    if (!this.bundle) return null;
    return this.bundle.files[filePath] ?? null;
  }
}
