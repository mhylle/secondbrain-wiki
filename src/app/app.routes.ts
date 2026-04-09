import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home').then(m => m.Home),
    title: 'Second Brain Wiki'
  },
  {
    path: 'search',
    loadComponent: () => import('./features/search/search').then(m => m.Search),
    title: 'Search — Second Brain'
  },
  {
    path: 'browse/:type',
    loadComponent: () => import('./features/browse/browse').then(m => m.Browse),
    title: 'Browse — Second Brain'
  },
  {
    path: 'tags/:tag',
    loadComponent: () => import('./features/browse/browse').then(m => m.Browse),
    title: 'Tag — Second Brain'
  },
  {
    path: 'graph',
    loadComponent: () => import('./features/graph/graph').then(m => m.Graph),
    title: 'Knowledge Graph — Second Brain'
  },
  {
    path: 'wiki/:slug',
    loadComponent: () => import('./features/page/page').then(m => m.Page),
    title: 'Page — Second Brain'
  },
  {
    path: '**',
    redirectTo: ''
  }
];
