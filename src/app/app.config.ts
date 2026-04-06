import { ApplicationConfig, provideBrowserGlobalErrorListeners, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { WikiStoreService } from './core/services/wiki-store.service';
import { SearchService } from './core/services/search.service';

function initializeApp(store: WikiStoreService, search: SearchService) {
  return async () => {
    await store.initialize();
    search.buildIndex();
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    {
      provide: APP_INITIALIZER,
      useFactory: (store: WikiStoreService, search: SearchService) => initializeApp(store, search),
      deps: [WikiStoreService, SearchService],
      multi: true
    }
  ]
};
