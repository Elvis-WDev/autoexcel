const UNIDADES = ['B', 'KB', 'MB', 'GB'] as const;

/** Tamano legible, con coma decimal como se escribe en español. */
export function tamanoLegible(bytes: number): string {
  if (bytes <= 0) return '0 B';

  const escala = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNIDADES.length - 1);
  const valor = bytes / 1024 ** escala;
  const decimales = escala === 0 || valor >= 100 ? 0 : 1;

  return `${valor.toFixed(decimales).replace('.', ',')} ${UNIDADES[escala]}`;
}
