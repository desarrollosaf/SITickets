import { Routes } from '@angular/router';
import { guardAnonimo, guardRol, guardSesion } from './core/guards';

export const routes: Routes = [
  {
    path: 'entrar',
    canActivate: [guardAnonimo],
    loadComponent: () => import('./paginas/login/login').then((m) => m.Login),
  },
  {
    path: '',
    canActivate: [guardSesion],
    loadComponent: () => import('./paginas/shell/shell').then((m) => m.Shell),
    children: [
      {
        path: 'tickets',
        canActivate: [guardRol('admin', 'operador')],
        loadComponent: () => import('./paginas/tickets/tickets').then((m) => m.Tickets),
      },
      {
        path: 'nuevo',
        canActivate: [guardRol('solicitante', 'admin', 'operador', 'gestor')],
        loadComponent: () => import('./paginas/solicitante/nuevo').then((m) => m.Nuevo),
      },
      {
        path: 'mis-tickets',
        canActivate: [guardRol('solicitante', 'admin', 'gestor')],
        loadComponent: () => import('./paginas/solicitante/mis-tickets').then((m) => m.MisTickets),
      },
      {
        path: 'bandeja',
        canActivate: [guardRol('tecnico', 'jefe', 'proveedor')],
        loadComponent: () => import('./paginas/bandeja/bandeja').then((m) => m.Bandeja),
      },
      {
        path: 'monitor',
        canActivate: [guardRol('admin', 'jefe', 'tecnico', 'proveedor', 'operador')],
        loadComponent: () => import('./paginas/monitor/monitor').then((m) => m.Monitor),
      },
      {
        path: 'tablero',
        canActivate: [guardRol('admin', 'jefe', 'operador')],
        loadComponent: () => import('./paginas/tablero/tablero').then((m) => m.Tablero),
      },
      {
        path: 'disponibilidad',
        canActivate: [guardRol('admin')],
        loadComponent: () =>
          import('./paginas/disponibilidad/disponibilidad').then((m) => m.Disponibilidad),
      },
      {
        path: 'internos',
        canActivate: [guardRol('admin', 'jefe')],
        loadComponent: () => import('./paginas/internos/internos').then((m) => m.Internos),
      },
      {
        path: 'catalogo',
        canActivate: [guardRol('admin')],
        loadComponent: () => import('./paginas/catalogo/catalogo').then((m) => m.Catalogo),
      },
      {
        path: 'usuarios',
        canActivate: [guardRol('admin')],
        loadComponent: () => import('./paginas/usuarios/usuarios').then((m) => m.Usuarios),
      },
      {
        path: 'prioridades',
        canActivate: [guardRol('admin')],
        loadComponent: () =>
          import('./paginas/prioridades/prioridades').then((m) => m.Prioridades),
      },
      { path: '', pathMatch: 'full', redirectTo: 'mis-tickets' },
    ],
  },
  { path: '**', redirectTo: '' },
];
