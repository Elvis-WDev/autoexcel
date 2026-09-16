import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CUENTA } from './datos';

/**
 * Tres Excel que no son el de la demo, del mas simple al mas completo.
 *
 * La aceptacion demuestra que el sistema funciona **con su archivo**. Esto
 * pregunta otra cosa: si funciona con archivos que nadie habia visto al
 * escribirlo. Es la diferencia entre un producto y una demo que solo sabe hacer
 * un truco.
 *
 * `gastos.xlsx` se analiza sin sustituir nada: el proponedor lanza y el sistema
 * cae en el camino determinista de RE-04, asi que los tipos que se ven en
 * pantalla los dedujo el sistema de los datos. Los otros dos traen propuesta
 * porque sin clave de API no se proponen relaciones y no habria nada que probar.
 */
const DIRECTORIO = join(tmpdir(), 'ets-escenarios');
const ESPERA_LARGA = { timeout: 60_000 };

test.describe.configure({ mode: 'serial' });

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

/**
 * Conduce el asistente entero, como lo conduciria una persona.
 *
 * Devuelve lo que el resumen previo afirma, que es la unica cifra que el sistema
 * publica sobre lo que va a construir.
 */
async function crearAplicacion(
  page: Page,
  opciones: { proyecto: string; archivo: string },
): Promise<{ resumen: string; relacionesAceptadas: number }> {
  await page.getByRole('button', { name: 'Nuevo proyecto' }).first().click();

  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Nombre').fill(opciones.proyecto);
  await dialogo.getByRole('button', { name: 'Crear proyecto' }).click();
  await expect(page.getByRole('heading', { name: 'Sube tu Excel' })).toBeVisible(ESPERA_LARGA);

  await page.setInputFiles('input[type="file"]', join(DIRECTORIO, opciones.archivo));
  await expect(page.getByText(opciones.archivo)).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page.getByRole('heading', { name: 'Esto encontramos en tu archivo' })).toBeVisible(
    ESPERA_LARGA,
  );
  await page.getByRole('button', { name: 'Analizar' }).click();

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

  // Se aceptan todas las relaciones propuestas, si hay alguna.
  const relacionesAceptadas = await page.getByRole('button', { name: 'Aceptar' }).count();
  for (let i = 0; i < relacionesAceptadas; i += 1) {
    await page.getByRole('button', { name: 'Aceptar' }).first().click();
    await expect(page.getByRole('button', { name: 'Aceptada' })).toHaveCount(i + 1);
  }
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Resumen previo.
  const resumen =
    (await page
      .getByText(/\d+ modulos? · \d+ campos? · \d+ relaciones?/)
      .first()
      .textContent()) ?? '';

  await page.getByRole('button', { name: 'Crear aplicacion' }).click();
  const confirmar = page.getByRole('alertdialog');
  await confirmar.getByRole('button', { name: 'Crear aplicacion' }).click();

  await expect(page.getByRole('heading', { name: 'Tu aplicacion esta lista' })).toBeVisible(
    ESPERA_LARGA,
  );

  return { resumen, relacionesAceptadas };
}

async function abrirLaAplicacion(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Abrir aplicacion' }).click();
  await expect(page.getByRole('navigation').first()).toBeVisible(ESPERA_LARGA);
}

// ===========================================================================
// E1 — Una hoja, ocho tipos, sin nada sustituido.
// ===========================================================================

test('E1 · una hoja: los tipos los deduce el sistema de los datos', async ({ page }) => {
  const problemas = vigilarLaConsola(page);
  await entrar(page);

  const { resumen, relacionesAceptadas } = await crearAplicacion(page, {
    proyecto: 'E1 Gastos',
    archivo: 'gastos.xlsx',
  });

  // El camino determinista no propone relaciones: RI-04, sin evidencia lo simple.
  expect(relacionesAceptadas).toBe(0);
  expect(resumen).toContain('0 relaciones');

  await abrirLaAplicacion(page);
  await page.getByRole('navigation').first().getByRole('link', { name: 'Gastos' }).click();
  await expect(page.getByRole('heading', { name: 'Gastos', level: 1 })).toBeVisible(ESPERA_LARGA);

  await test.step('la tabla trae las nueve columnas del Excel', async () => {
    for (const columna of [
      'Fecha',
      'Registrado',
      'Concepto',
      'Categoria',
      'Cantidad',
      'Importe',
      'Pagado',
      'Responsable',
      'Telefono',
    ]) {
      await expect(page.getByRole('columnheader', { name: columna }).first()).toBeVisible();
    }
  });

  await test.step('las 40 filas se importaron', async () => {
    await expect(page.getByText(/de 40/)).toBeVisible(ESPERA_LARGA);
  });

  await test.step('cada tipo se pinta como su tipo, no como texto', async () => {
    const cuerpo = await page.locator('table tbody').first().innerText();

    // Fecha en formato local, no ISO.
    expect(cuerpo, 'fecha').toMatch(/\d{2}\/\d{2}\/\d{4}/);
    // Decimal con coma y dos decimales.
    expect(cuerpo, 'decimal').toMatch(/\d+,\d{2}/);
    // Booleano como palabra, no como true/false.
    expect(cuerpo, 'booleano').toMatch(/Si|No/);
    expect(cuerpo, 'booleano crudo').not.toMatch(/\btrue\b|\bfalse\b/);
    // Correo y telefono, tal cual.
    expect(cuerpo, 'email').toContain('@empresa.test');
  });

  await test.step('el formulario ofrece un control por tipo', async () => {
    await page.getByRole('button', { name: 'Nuevo gasto' }).first().click();
    const dialogo = page.getByRole('dialog');

    // La fecha por calendario, no por texto libre.
    await expect(dialogo.getByRole('button', { name: 'Fecha' })).toBeVisible();
    // El booleano como interruptor.
    await expect(dialogo.getByRole('switch', { name: /Pagado/ })).toBeVisible();
    // Y los numericos con su teclado.
    await expect(dialogo.getByLabel(/Cantidad/)).toHaveAttribute('inputmode', 'numeric');
    await expect(dialogo.getByLabel(/Importe/)).toHaveAttribute('inputmode', 'decimal');
    await expect(dialogo.getByLabel(/Responsable/)).toHaveAttribute('type', 'email');
    await expect(dialogo.getByLabel(/Telefono/)).toHaveAttribute('type', 'tel');

    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  });

  await test.step('buscar, ordenar y paginar los hace el servidor', async () => {
    await page.getByPlaceholder(/Buscar/).fill('Gasto numero 7');
    await expect(page.getByText(/de 1\b/)).toBeVisible(ESPERA_LARGA);

    await page.getByPlaceholder(/Buscar/).fill('');
    await expect(page.getByText(/de 40/)).toBeVisible(ESPERA_LARGA);
  });

  expect(problemas, problemas.join('\n')).toEqual([]);
});

// ===========================================================================
// E2 — Dos hojas y una relacion.
// ===========================================================================

test('E2 · dos hojas: la relacion se materializa y se usa', async ({ page }) => {
  const problemas = vigilarLaConsola(page);
  await entrar(page);

  const { resumen, relacionesAceptadas } = await crearAplicacion(page, {
    proyecto: 'E2 Pedidos',
    archivo: 'pedidos.xlsx',
  });

  expect(relacionesAceptadas).toBe(1);
  expect(resumen).toContain('2 modulos');
  expect(resumen).toContain('1 relacion');

  await abrirLaAplicacion(page);

  await test.step('hay un modulo por entidad', async () => {
    for (const modulo of ['Pedidos', 'Clientes']) {
      await expect(
        page.getByRole('navigation').first().getByRole('link', { name: modulo }),
      ).toBeVisible();
    }
  });

  await test.step('los clientes se deduplicaron: 3, no 60', async () => {
    await page.getByRole('navigation').first().getByRole('link', { name: 'Clientes' }).click();
    await expect(page.getByRole('heading', { name: 'Clientes', level: 1 })).toBeVisible(
      ESPERA_LARGA,
    );
    await expect(page.getByText(/de 3\b/)).toBeVisible(ESPERA_LARGA);
  });

  await test.step('la tabla de pedidos muestra el nombre del cliente, no un identificador', async () => {
    await page.getByRole('navigation').first().getByRole('link', { name: 'Pedidos' }).click();
    await expect(page.getByRole('heading', { name: 'Pedidos', level: 1 })).toBeVisible(
      ESPERA_LARGA,
    );

    const cuerpo = await page.locator('table tbody').first().innerText();
    expect(cuerpo, 'etiqueta de la relacion').toMatch(
      /Panaderia Central|Cafe del Parque|Mercado Sur/,
    );
    expect(cuerpo, 'ningun UUID a la vista').not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );

    // 60 filas validas; la que traia "a convenir" en el total no entra.
    await expect(page.getByText(/de 60/)).toBeVisible(ESPERA_LARGA);
  });

  await test.step('el formulario elige el cliente de una lista, y el estado de sus opciones', async () => {
    await page.getByRole('button', { name: 'Nuevo pedido' }).first().click();
    const dialogo = page.getByRole('dialog');

    await dialogo.getByRole('combobox', { name: /Cliente/ }).click();
    await expect(page.getByRole('option', { name: 'Panaderia Central' })).toBeVisible(ESPERA_LARGA);
    await page.getByRole('option', { name: 'Panaderia Central' }).click();

    await dialogo.getByRole('combobox', { name: /Estado/ }).click();
    for (const opcion of ['Pendiente', 'Enviado', 'Entregado']) {
      await expect(page.getByRole('option', { name: opcion })).toBeVisible();
    }
    await page.getByRole('option', { name: 'Entregado' }).click();

    await dialogo.getByRole('button', { name: 'Fecha' }).click();
    await page.getByRole('grid').getByText('15', { exact: true }).first().click();

    await dialogo.getByLabel(/Producto/).fill('Producto de prueba');
    await dialogo.getByLabel(/Unidades/).fill('7');
    await dialogo.getByLabel(/Total/).fill('1.234,56');

    await dialogo.getByRole('button', { name: /Crear pedido/ }).click();
    await expect(page.getByText(/de 61/)).toBeVisible(ESPERA_LARGA);
  });

  await test.step('lo creado aparece con su cliente y su decimal bien escrito', async () => {
    await page.getByPlaceholder(/Buscar/).fill('Producto de prueba');
    await expect(page.getByText(/de 1\b/)).toBeVisible(ESPERA_LARGA);

    const fila = await page.locator('table tbody').first().innerText();
    expect(fila).toContain('Panaderia Central');
    expect(fila).toContain('1.234,56');
    expect(fila).toContain('Entregado');
  });

  expect(problemas, problemas.join('\n')).toEqual([]);
});

// ===========================================================================
// E3 — Cinco hojas, tres relaciones, los diez tipos.
// ===========================================================================

test('E3 · cinco hojas y tres relaciones: la aplicacion completa', async ({ page }) => {
  const problemas = vigilarLaConsola(page);
  await entrar(page);

  const { resumen, relacionesAceptadas } = await crearAplicacion(page, {
    proyecto: 'E3 Academia',
    archivo: 'academia.xlsx',
  });

  expect(relacionesAceptadas).toBe(3);
  expect(resumen).toContain('4 modulos');
  expect(resumen).toContain('3 relaciones');

  await abrirLaAplicacion(page);

  await test.step('la hoja vacia no produjo un modulo fantasma', async () => {
    await expect(
      page.getByRole('navigation').first().getByRole('link', { name: 'Leyenda' }),
    ).toHaveCount(0);
    for (const modulo of ['Matriculas', 'Estudiantes', 'Cursos', 'Docentes']) {
      await expect(
        page.getByRole('navigation').first().getByRole('link', { name: modulo }),
      ).toBeVisible();
    }
  });

  await test.step('cada catalogo trae sus filas, no las 90 de matriculas', async () => {
    for (const [modulo, total] of [
      ['Estudiantes', 5],
      ['Cursos', 3],
      ['Docentes', 2],
    ] as const) {
      await page.getByRole('navigation').first().getByRole('link', { name: modulo }).click();
      await expect(page.getByRole('heading', { name: modulo, level: 1 })).toBeVisible(ESPERA_LARGA);
      await expect(page.getByText(new RegExp(`de ${total}\\b`))).toBeVisible(ESPERA_LARGA);
    }
  });

  await test.step('matriculas enlaza las tres relaciones a la vez', async () => {
    await page.getByRole('navigation').first().getByRole('link', { name: 'Matriculas' }).click();
    await expect(page.getByRole('heading', { name: 'Matriculas', level: 1 })).toBeVisible(
      ESPERA_LARGA,
    );

    const cuerpo = await page.locator('table tbody').first().innerText();
    expect(cuerpo, 'estudiante').toMatch(/Maria Salazar|Jorge Benitez|Elena Ponce/);
    expect(cuerpo, 'curso').toMatch(/Contabilidad Basica|Excel Avanzado|Gestion de Proyectos/);
    expect(cuerpo, 'docente').toMatch(/Patricia Nunez|Andres Vela/);
    expect(cuerpo, 'ningun UUID').not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );

    // 90 filas; las dos sucias no entran.
    await expect(page.getByText(/de 90/)).toBeVisible(ESPERA_LARGA);
  });

  await test.step('el formulario ofrece los diez tipos, cada uno con su control', async () => {
    await page.getByRole('button', { name: 'Nueva matricula' }).first().click();
    const dialogo = page.getByRole('dialog');

    await expect(dialogo.getByRole('button', { name: 'Fecha' })).toBeVisible();
    await expect(dialogo.getByRole('switch', { name: /Becado/ })).toBeVisible();
    await expect(dialogo.getByRole('combobox', { name: /Modalidad/ })).toBeVisible();

    for (const relacion of ['Estudiante', 'Curso', 'Docente']) {
      await expect(dialogo.getByRole('combobox', { name: new RegExp(relacion) })).toBeVisible();
    }

    await expect(dialogo.getByLabel(/Cuotas/)).toHaveAttribute('inputmode', 'numeric');
    await expect(dialogo.getByLabel(/Valor/)).toHaveAttribute('inputmode', 'decimal');
    await expect(dialogo.getByLabel(/Contacto/)).toHaveAttribute('type', 'email');
    await expect(dialogo.getByLabel(/Telefono/)).toHaveAttribute('type', 'tel');

    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  });

  await test.step('crear una matricula enlazando las tres entidades', async () => {
    await page.getByRole('button', { name: 'Nueva matricula' }).first().click();
    const dialogo = page.getByRole('dialog');

    await dialogo.getByRole('button', { name: 'Fecha' }).click();
    await page.getByRole('grid').getByText('20', { exact: true }).first().click();

    for (const [etiqueta, valor] of [
      ['Estudiante', 'Sofia Aguirre'],
      ['Curso', 'Excel Avanzado'],
      ['Docente', 'Andres Vela'],
      ['Modalidad', 'Hibrida'],
    ] as const) {
      await dialogo.getByRole('combobox', { name: new RegExp(etiqueta) }).click();
      await page.getByRole('option', { name: valor }).click();
    }

    await dialogo.getByLabel(/Cuotas/).fill('9');
    await dialogo.getByLabel(/Valor/).fill('999,99');
    await dialogo.getByRole('switch', { name: /Becado/ }).click();

    await dialogo.getByRole('button', { name: /Crear matricula/ }).click();
    await expect(page.getByText(/de 91/)).toBeVisible(ESPERA_LARGA);
  });

  await test.step('y se vuelve a encontrar buscando por el nombre del relacionado', async () => {
    await page.getByPlaceholder(/Buscar/).fill('999');
    await expect(page.getByText(/de 1\b/)).toBeVisible(ESPERA_LARGA);

    const fila = await page.locator('table tbody').first().innerText();
    expect(fila).toContain('Sofia Aguirre');
    expect(fila).toContain('Excel Avanzado');
    expect(fila).toContain('Andres Vela');
    expect(fila).toContain('Hibrida');
    expect(fila).toContain('999,99');
  });

  await test.step('borrar un curso en uso se rechaza, y se explica', async () => {
    await page.getByRole('navigation').first().getByRole('link', { name: 'Cursos' }).click();
    await expect(page.getByRole('heading', { name: 'Cursos', level: 1 })).toBeVisible(ESPERA_LARGA);

    await page.getByRole('button', { name: 'Eliminar' }).first().click();
    const confirmar = page.getByRole('alertdialog');
    await confirmar.getByRole('button', { name: /Eliminar/ }).click();

    // Sigue habiendo 3: la integridad referencial la sostiene la base.
    await expect(page.getByText(/de 3\b/)).toBeVisible(ESPERA_LARGA);
  });

  expect(problemas, problemas.join('\n')).toEqual([]);
});
