import type { CarDataSource } from '../types.js';
import { MercadoLibreSource } from './mercadoLibre.js';
import { AutocosmosSource } from './autocosmos.js';
import { KavakSource } from './kavak.js';
import { DeMotoresSource } from './demotores.js';

/** Registry: add new sources here without touching the core pipeline. */
export function buildSources(): CarDataSource[] {
  return [new MercadoLibreSource(), new AutocosmosSource(), new KavakSource(), new DeMotoresSource()];
}
