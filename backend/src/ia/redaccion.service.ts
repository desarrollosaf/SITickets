import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

const LIMITE_SALIDA = 2000;

/**
 * El tecnico escribe la observacion con sus palabras; esto la reescribe en
 * el registro formal que exige un "Dictamen Tecnico" oficial, sin inventar
 * datos que el tecnico no haya dado. El resultado sigue siendo editable
 * antes de enviarse — este servicio nunca cierra el ticket por su cuenta.
 */
const SYSTEM = `Eres un asistente de redacción para técnicos de soporte informático del \
Congreso del Estado de México. Tu única tarea es reescribir, en español formal y \
técnico, el texto que el técnico capturó para el cuerpo ("II. DICTAMEN") de un \
Dictamen Técnico oficial de baja de equipo de cómputo.

Reglas estrictas:
- No inventes hechos, causas, fechas, marcas ni componentes que no estén en el texto original.
- Conserva todos los hechos técnicos que el técnico ya dio (falla observada, diagnóstico, causa, prueba realizada, conclusión/recomendación).
- Redacta en tercera persona, tiempo pasado cuando describas lo revisado, con vocabulario técnico de soporte informático.
- Máximo dos párrafos, sin viñetas, sin títulos, sin markdown.
- Extensión similar a la del texto original: no lo alargues de forma artificial.
- Responde únicamente con el texto final, sin comillas ni comentarios.`;

@Injectable()
export class RedaccionService {
  private readonly log = new Logger('Redaccion');
  private readonly cliente: Anthropic | null;
  private readonly modelo: string;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('ANTHROPIC_API_KEY');
    this.cliente = key ? new Anthropic({ apiKey: key }) : null;
    this.modelo = this.config.get<string>('ANTHROPIC_MODEL', 'claude-sonnet-5');
  }

  async mejorarObservaciones(texto: string): Promise<string> {
    if (!this.cliente) {
      throw new ServiceUnavailableException(
        'El servicio de redacción no está configurado (falta ANTHROPIC_API_KEY).',
      );
    }

    try {
      const respuesta = await this.cliente.messages.create({
        model: this.modelo,
        max_tokens: 700,
        system: SYSTEM,
        messages: [{ role: 'user', content: texto.trim() }],
      });

      const bloque = respuesta.content.find((b) => b.type === 'text');
      const salida = bloque?.type === 'text' ? bloque.text.trim() : '';
      if (!salida) throw new Error('Respuesta vacía del modelo');

      return salida.length > LIMITE_SALIDA ? salida.slice(0, LIMITE_SALIDA) : salida;
    } catch (e) {
      this.log.warn(`No se pudo mejorar la redacción: ${(e as Error).message}`);
      throw new ServiceUnavailableException('No se pudo mejorar la redacción. Intenta de nuevo.');
    }
  }
}
