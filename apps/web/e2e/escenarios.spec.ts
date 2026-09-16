import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CUENTA } from './datos';

/**
 * Tres Excel que no son el de la demo, contra el motor de inferencia real.
 *
 * La aceptacion demuestra que el sistema funciona **con su archivo** y con una
 * propuesta fijada. Esto pregunta otra cosa: si funciona con archivos que nadie
 * habia visto, y con la propuesta que salga.
 *
 * Por eso **no se afirma ninguna cifra concreta**. Lo que proponga el modelo es
 * variable —es un modelo— y una prueba que exigiera "cuatro modulos y tres
 * relaciones" estaria comprobando al proveedor, no al producto. Se afirman
 * invariantes: que lo que el manifiesto dice que existe, existe y se puede usar.
 *
 * Cada modulo se contrasta contra el manifiesto que sirve la propia API, asi
 * que la prueba se adapta sola a lo que se haya creado.
 */
const DIRECTORIO = join(tmpdir(), 'ets-escenarios');
const ESPERA_LARGA = { timeout: 120_000 };

test.describe.configure({ mode: 'serial' });

interface CampoDelManifiesto {
  name: string;
  label: string;
  type: string;
  required: boolean;
  options: string[] | null;
  relatedTo: string | null;
}

interface ModuloDelManifiesto {
  name: string;
  label: string;
  displayField: string;
  fields: CampoDelManifiesto[];
}

function vigilarLaConsola(page: Page): string[] {
  const problemas: string[] = [];

  page.on('console', (mensaje) => {
    if (mensaje.type() !== 'error') return;
    const texto = mensaje.text();
    if (texto.includes('401') || texto.includes('Failed to load resource')) return;
    problemas.push(texto);
  });
  page.on('pageerror', (error) => problemas.push(`pageerror: ${error.message}`));

  return problemas;
}

async function entrar(page: Page): Promise<void> {
  await page.goto('/entrar');
  await page.getByLabel('Correo').fill(CUENTA.correo);
  await page.getByLabel('Contrasena', { exact: true }).fill(CUENTA.contrasena);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Proyectos' })).toBeVisible(ESPERA_LARGA);
}

/** Conduce el asistente entero y devuelve el identificador del proyecto. */
async function crearAplicacion(
  page: Page,
  opciones: { proyecto: string; archivo: string },
): Promise<{ proyectoId: string; relaciones: number; resumen: string }> {
  await page.getByRole('button', { name: 'Nuevo proyecto' }).first().click();

  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Nombre').fill(opciones.proyecto);
  await dialogo.getByRole('button', { name: 'Crear proyecto' }).click();
  await expect(page.getByRole('heading', { name: 'Sube tu Excel' })).toBeVisible(ESPERA_LARGA);

  const proyectoId = /\/proyectos\/([^/]+)/.exec(page.url())?.[1] ?? '';
  expect(proyectoId, 'no se pudo leer el proyecto de la URL').not.toBe('');

  await page.setInputFiles('input[type="file"]', join(DIRECTORIO, opciones.archivo));
  await expect(page.getByText(opciones.archivo)).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page.getByRole('heading', { name: 'Esto encontramos en tu archivo' })).toBeVisible(
    ESPERA_LARGA,
  );
  await page.getByRole('button', { name: 'Analizar' }).click();

  // El analisis habla con el modelo: puede tardar.
  await expect(page.getByRole('heading', { name: 'Esto es lo que vamos a crear' })).toBeVisible(
    ESPERA_LARGA,
  );
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page.getByRole('heading', { name: 'Los campos de cada modulo' })).toBeVisible(
    ESPERA_LARGA,
  );
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page.getByRole('heading', { name: 'Como se conectan tus datos' })).toBeVisible(
    ESPERA_LARGA,
  );

  const relaciones = await page.getByRole('button', { name: 'Aceptar' }).count();
  for (let i = 0; i < relaciones; i += 1) {
    await page.getByRole('button', { name: 'Aceptar' }).first().click();
    await expect(page.getByRole('button', { name: 'Aceptada' })).toHaveCount(i + 1);
  }
  await page.getByRole('button', { name: 'Continuar' }).click();

  const resumen =
    (await page
      .getByText(/\d+ modulos? · \d+ campos? · \d+ relacion(?:es)?/)
      .first()
      .textContent()) ?? '';

  await page.getByRole('button', { name: 'Crear aplicacion' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Crear aplicacion' }).click();

  await expect(page.getByRole('heading', { name: 'Tu aplicacion esta lista' })).toBeVisible(
    ESPERA_LARGA,
  );
  await page.getByRole('link', { name: 'Abrir aplicacion' }).click();
  await expect(page.getByRole('navigation').first()).toBeVisible(ESPERA_LARGA);

  return { proyectoId, relaciones, resumen };
}

/**
 * La comprobacion de fondo, contra el manifiesto.
 *
 * Todo lo que se afirma sale de lo que la propia API dice que existe. Si el
 * modelo propuso tres modulos o siete, la prueba se adapta; lo que no se
 * adapta es que cada uno tenga que funcionar.
 */
async function comprobarLaAplicacion(page: Page, proyectoId: string): Promise<string[]> {
  const notas: string[] = [];

  const manifiesto = (await (await page.request.get(`/api/projects/${proyectoId}/app`)).json()) as {
    data: { applicationName: string; entities: ModuloDelManifiesto[] };
  };

  const modulos = manifiesto.data.entities;
  expect(modulos.length, 'la aplicacion no tiene modulos').toBeGreaterThan(0);

  for (const modulo of modulos) {
    await page.getByRole('navigation').first().getByRole('link', { name: modulo.label }).click();
    await expect(page.getByRole('heading', { name: modulo.label, level: 1 })).toBeVisible(
      ESPERA_LARGA,
    );

    // 1. La tabla trae una columna por campo del manifiesto.
    for (const campo of modulo.fields) {
      await expect(
        page.getByRole('columnheader', { name: campo.label }).first(),
        `falta la columna "${campo.label}" en ${modulo.label}`,
      ).toBeVisible();
    }

    // 2. El pie dice lo mismo que la API.
    const respuesta = (await (
      await page.request.get(`/api/projects/${proyectoId}/app/${modulo.name}/records?limit=1`)
    ).json()) as { meta: { total: number } };
    const total = respuesta.meta.total;

    await expect(
      page.getByText(new RegExp(`de ${total}\\b`)),
      `el pie de ${modulo.label} no dice ${total}`,
    ).toBeVisible(ESPERA_LARGA);

    notas.push(`${modulo.label}: ${total} filas, ${modulo.fields.length} campos`);

    if (total === 0) continue;

    // 3. Ningun identificador interno a la vista (RF-17 y la frontera tecnica).
    const cuerpo = await page.locator('table tbody').first().innerText();
    expect(cuerpo, `${modulo.label} muestra un UUID`).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );

    // 4. Un control por tipo, en el formulario.
    const singular = modulo.label.replace(/s$/i, '');
    const abrir = new RegExp(`^(Nuevo|Nueva) ${singular}`, 'i');
    await page.getByRole('button', { name: abrir }).first().click();

    // Se acota por su titulo: el popover de un selector tambien es `dialog`, y
    // sin nombre el localizador coincidiria con los dos.
    const dialogo = page.getByRole('dialog', { name: abrir });
    await expect(dialogo).toBeVisible();

    for (const campo of modulo.fields) {
      const nombre = new RegExp(campo.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

      if (campo.type === 'relation' || campo.type === 'select') {
        await expect(
          dialogo.getByRole('combobox', { name: nombre }),
          `"${campo.label}" (${campo.type}) deberia ser un selector`,
        ).toBeVisible();
        continue;
      }
      if (campo.type === 'boolean') {
        await expect(dialogo.getByRole('switch', { name: nombre })).toBeVisible();
        continue;
      }
      if (campo.type === 'date' || campo.type === 'datetime') {
        await expect(dialogo.getByRole('button', { name: campo.label })).toBeVisible();
        continue;
      }

      const esperado =
        campo.type === 'email' ? 'email' : campo.type === 'phone' ? 'tel' : undefined;
      const entrada = dialogo.getByLabel(nombre).first();
      await expect(entrada, `falta el control de "${campo.label}"`).toBeVisible();
      if (esperado) await expect(entrada).toHaveAttribute('type', esperado);
      if (campo.type === 'integer') await expect(entrada).toHaveAttribute('inputmode', 'numeric');
      if (campo.type === 'decimal') await expect(entrada).toHaveAttribute('inputmode', 'decimal');
    }

    // 5. Una relacion tiene que ofrecer registros de verdad, no identificadores.
    const relacion = modulo.fields.find((campo) => campo.type === 'relation');
    if (relacion) {
      await dialogo.getByRole('combobox', { name: new RegExp(relacion.label) }).click();
      const opciones = page.getByRole('option');
      await expect(opciones.first()).toBeVisible(ESPERA_LARGA);

      const texto = await opciones.first().innerText();
      expect(texto, `la opcion de "${relacion.label}" es un identificador`).not.toMatch(
        /^[0-9a-f-]{36}$/,
      );
      notas.push(`  ${modulo.label}.${relacion.label} ofrece "${texto.trim()}"`);
      await page.keyboard.press('Escape');
    }

    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogo).toBeHidden();

    // 6. Buscar lo hace el servidor, y el pie lo refleja.
    const buscador = page.getByPlaceholder(/Buscar/);
    await buscador.fill('zzzz-no-existe-zzzz');
    await expect(page.getByText(/Ningun|Ninguna/).first()).toBeVisible(ESPERA_LARGA);
    await buscador.fill('');
    await expect(page.getByText(new RegExp(`de ${total}\\b`))).toBeVisible(ESPERA_LARGA);
  }

  return notas;
}

for (const escenario of [
  { id: 'E1', archivo: 'gastos.xlsx', titulo: 'una hoja, ocho tipos' },
  { id: 'E2', archivo: 'pedidos.xlsx', titulo: 'dos hojas' },
  { id: 'E3', archivo: 'academia.xlsx', titulo: 'cinco hojas' },
]) {
  test(`${escenario.id} · ${escenario.titulo}: de ${escenario.archivo} a una aplicacion en uso`, async ({
    page,
  }) => {
    test.setTimeout(300_000);

    const problemas = vigilarLaConsola(page);
    await entrar(page);

    const { proyectoId, relaciones, resumen } = await crearAplicacion(page, {
      proyecto: `${escenario.id} navegador`,
      archivo: escenario.archivo,
    });

    const notas = await comprobarLaAplicacion(page, proyectoId);

    // Lo que propuso el modelo se imprime, no se afirma: es lo que se ha venido
    // a observar. `process.stdout` y no `console`, como el resto del repo.
    process.stdout.write(
      [
        `\n${escenario.id} ${escenario.archivo}`,
        `  resumen previo: ${resumen.trim()}`,
        `  relaciones aceptadas: ${relaciones}`,
        ...notas.map((nota) => `  ${nota}`),
        '',
      ].join('\n'),
    );

    expect(problemas, problemas.join('\n')).toEqual([]);
  });
}
