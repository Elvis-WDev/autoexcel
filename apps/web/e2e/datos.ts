import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** La cuenta desechable de las pruebas. Se crea y se borra en cada ejecucion. */
export const CUENTA = {
  correo: 'e2e@example.test',
  contrasena: 'pruebas-de-navegador-e2e',
  nombre: 'Ana de Pruebas',
};

export const DIRECTORIO_DE_ARCHIVOS = join(tmpdir(), 'ets-e2e');

export const ARCHIVO_VIAJES = join(DIRECTORIO_DE_ARCHIVOS, 'viajes.xlsx');
export const ARCHIVO_INVENTARIO = join(DIRECTORIO_DE_ARCHIVOS, 'inventario.xlsx');
