import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TicketsService } from '../../core/tickets.service';
import { mensajeError, quitarAcentos } from '../../core/formato';
import type { InmuebleAdmin } from '../../core/modelos';

/**
 * §16 · Catalogo de inmuebles: edificios propios/arrendados que aparecen en
 * el selector de "Edificio o ubicación" al registrar un ticket. Cada uno
 * puede ademas tener una sede (coordenadas) ligada, que es lo que usa el
 * reloj checador para comparar la ubicación del técnico (ver RelojService).
 */
@Component({
  selector: 'app-catalogo-inmuebles',
  imports: [FormsModule],
  templateUrl: './catalogo-inmuebles.html',
})
export class CatalogoInmuebles {
  private readonly api = inject(TicketsService);

  readonly inmuebles = signal<InmuebleAdmin[]>([]);
  readonly error = signal('');

  busqueda = '';
  readonly filtrados = computed(() => {
    const texto = quitarAcentos(this.busqueda.trim().toLowerCase());
    const lista = this.inmuebles();
    if (!texto) return lista;
    return lista.filter((i) =>
      quitarAcentos(`${i.dependencia} ${i.ubicacion} ${i.tipo}`.toLowerCase()).includes(texto),
    );
  });
  readonly sinCoordenadas = computed(() => this.inmuebles().filter((i) => !i.sede).length);

  readonly mostrarForm = signal(false);
  readonly editandoId = signal<number | null>(null);
  readonly guardando = signal(false);
  readonly errorForm = signal('');

  iDependencia = '';
  iUbicacion = '';
  iPropiedad: 'propio' | 'renta' = 'propio';
  iTipo = '';

  /** Modal aparte: capturar/corregir coordenadas de un inmueble ya existente. */
  readonly inmuebleSede = signal<InmuebleAdmin | null>(null);
  readonly guardandoSede = signal(false);
  readonly errorSede = signal('');
  sLatitud = '';
  sLongitud = '';
  sRadio = '120';

  constructor() {
    this.cargar();
  }

  private cargar() {
    this.api.inmueblesAdmin().subscribe({
      next: (r) => this.inmuebles.set(r),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  /** Para abrir la direccion en Google Maps y ubicar las coordenadas a mano (no hay geocodificador integrado). */
  urlMapa(direccion: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
  }

  /** Solo decorativo: un icono distinto segun el tipo de inmueble, para que la tabla sea mas facil de escanear. */
  iconoTipo(tipo: string): string {
    const t = quitarAcentos(tipo.toLowerCase());
    if (t.includes('bodega')) return 'bi-box-seam';
    if (t.includes('estacionamiento')) return 'bi-p-square';
    if (t.includes('oficina')) return 'bi-building';
    return 'bi-geo';
  }

  abrirNuevo() {
    this.editandoId.set(null);
    this.iDependencia = '';
    this.iUbicacion = '';
    this.iPropiedad = 'propio';
    this.iTipo = '';
    this.errorForm.set('');
    this.mostrarForm.set(true);
  }

  abrirEditar(i: InmuebleAdmin) {
    this.editandoId.set(i.id);
    this.iDependencia = i.dependencia;
    this.iUbicacion = i.ubicacion;
    this.iPropiedad = i.propiedad;
    this.iTipo = i.tipo;
    this.errorForm.set('');
    this.mostrarForm.set(true);
  }

  cancelar() {
    this.mostrarForm.set(false);
  }

  guardar() {
    if (this.iDependencia.trim().length < 2) {
      this.errorForm.set('Captura el nombre del inmueble.');
      return;
    }
    if (this.iUbicacion.trim().length < 5) {
      this.errorForm.set('Captura la dirección completa.');
      return;
    }
    if (this.iTipo.trim().length < 2) {
      this.errorForm.set('Captura el tipo de inmueble (ej. Oficinas, Bodega).');
      return;
    }

    const id = this.editandoId();
    const datos = {
      dependencia: this.iDependencia.trim(),
      ubicacion: this.iUbicacion.trim(),
      propiedad: this.iPropiedad,
      tipo: this.iTipo.trim(),
    };

    this.guardando.set(true);
    this.errorForm.set('');
    const peticion = id ? this.api.actualizarInmueble(id, datos) : this.api.crearInmueble(datos);

    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.mostrarForm.set(false);
        this.cargar();
      },
      error: (e) => {
        this.guardando.set(false);
        this.errorForm.set(mensajeError(e));
      },
    });
  }

  /** Baja logica: activo=false lo oculta del selector de "Registrar ticket" sin borrarlo. */
  alternarActivo(i: InmuebleAdmin) {
    this.api.actualizarInmueble(i.id, { activo: !i.activo }).subscribe({
      next: () => this.cargar(),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  /* ---------------- coordenadas (sede) ---------------- */

  abrirSede(i: InmuebleAdmin) {
    this.inmuebleSede.set(i);
    this.sLatitud = i.sede ? String(i.sede.latitud) : '';
    this.sLongitud = i.sede ? String(i.sede.longitud) : '';
    this.sRadio = i.sede ? String(i.sede.radio_m) : '120';
    this.errorSede.set('');
  }

  cancelarSede() {
    this.inmuebleSede.set(null);
  }

  guardarSede() {
    const i = this.inmuebleSede();
    if (!i) return;

    const lat = Number(this.sLatitud);
    const lng = Number(this.sLongitud);
    const radio = this.sRadio.trim() ? Number(this.sRadio) : undefined;

    if (!this.sLatitud.trim() || Number.isNaN(lat) || lat < -90 || lat > 90) {
      this.errorSede.set('Captura una latitud válida (entre -90 y 90).');
      return;
    }
    if (!this.sLongitud.trim() || Number.isNaN(lng) || lng < -180 || lng > 180) {
      this.errorSede.set('Captura una longitud válida (entre -180 y 180).');
      return;
    }
    if (radio !== undefined && (Number.isNaN(radio) || radio < 10 || radio > 2000)) {
      this.errorSede.set('El radio de tolerancia debe ser entre 10 y 2000 metros.');
      return;
    }

    this.guardandoSede.set(true);
    this.errorSede.set('');
    this.api.capturarSedeInmueble(i.id, { latitud: lat, longitud: lng, radio_m: radio }).subscribe({
      next: () => {
        this.guardandoSede.set(false);
        this.inmuebleSede.set(null);
        this.cargar();
      },
      error: (e) => {
        this.guardandoSede.set(false);
        this.errorSede.set(mensajeError(e));
      },
    });
  }
}
