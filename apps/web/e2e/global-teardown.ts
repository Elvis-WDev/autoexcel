import { execFileSync } from 'node:child_process';
import { CUENTA } from './datos';

/**
 * Borra lo que la ejecucion dejo.
 *
 * Los proyectos caen en cascada con la cuenta, pero **sus schemas no**: eso solo
 * lo hace borrar el proyecto por la API, que pasa por el materializador. Aqui se
 * eliminan a mano, o cada ejecucion dejaria un `proj_*` huerfano detras.
 */
const SQL = `
do $$
declare
  s text;
begin
  for s in
    select p."schemaName"
    from project p
    join "user" u on u.id = p."ownerId"
    where u.email = '${CUENTA.correo}'
  loop
    execute format('drop schema if exists %I cascade', s);
  end loop;

  delete from "user" where email = '${CUENTA.correo}';
end $$;
`;

export default function limpiar(): void {
  try {
    execFileSync(
      'docker',
      ['exec', '-i', 'ets-postgres', 'psql', '-U', 'ets_owner', '-d', 'ets', '-q'],
      { input: SQL, stdio: 'pipe' },
    );
  } catch (error) {
    // Que falle la limpieza no puede tumbar una ejecucion que ya termino bien.
    process.stderr.write(`\nNo se pudo limpiar: ${String(error)}\n`);
  }
}
