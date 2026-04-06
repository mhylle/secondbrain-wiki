import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { GitHubTreeResponse } from '../models/wiki-page.model';

@Injectable({ providedIn: 'root' })
export class GitHubApiService {
  private readonly http = inject(HttpClient);
  private readonly config = environment.github;

  fetchTree(): Observable<string[]> {
    const url = `${this.config.apiBase}/repos/${this.config.owner}/${this.config.repo}/git/trees/${this.config.branch}?recursive=1`;
    return this.http
      .get<GitHubTreeResponse>(url, { headers: this.buildHeaders() })
      .pipe(
        map(response =>
          response.tree
            .filter(
              entry =>
                entry.type === 'blob' &&
                entry.path.startsWith(`${this.config.wikiPath}/`) &&
                entry.path.endsWith('.md')
            )
            .map(entry => entry.path)
        )
      );
  }

  fetchFileContent(filePath: string): Observable<string> {
    const url = `${this.config.rawBase}/${this.config.owner}/${this.config.repo}/${this.config.branch}/${filePath}`;
    return this.http.get(url, {
      headers: this.buildHeaders(),
      responseType: 'text'
    });
  }

  private buildHeaders(): HttpHeaders {
    let headers = new HttpHeaders({ Accept: 'application/vnd.github.v3+json' });
    if (this.config.token) {
      headers = headers.set('Authorization', `Bearer ${this.config.token}`);
    }
    return headers;
  }
}
