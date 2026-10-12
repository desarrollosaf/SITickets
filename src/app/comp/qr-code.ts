import { Component, effect, input, viewChild, type ElementRef } from '@angular/core';
import QRCode from 'qrcode';

/** Dibuja un QR del valor dado. Usado para el QR "de llegada" del detalle del ticket. */
@Component({
  selector: 'app-qr-code',
  template: `<canvas #lienzo></canvas>`,
})
export class QrCode {
  readonly valor = input.required<string>();
  readonly tamano = input(220);

  private readonly lienzo = viewChild<ElementRef<HTMLCanvasElement>>('lienzo');

  constructor() {
    effect(() => {
      const lienzo = this.lienzo();
      const valor = this.valor();
      if (!lienzo || !valor) return;
      QRCode.toCanvas(lienzo.nativeElement, valor, {
        width: this.tamano(),
        margin: 1,
        color: { dark: '#1b2434', light: '#ffffff' },
      }).catch(() => {});
    });
  }
}
