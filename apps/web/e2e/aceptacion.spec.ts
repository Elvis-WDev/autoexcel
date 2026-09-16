import { expect, test, type Page } from '@playwright/test';
import { ARCHIVO_VIAJES, CUENTA } from './datos';

/**
 * Los 18 criterios del ERS 17, en un navegador de verdad.
 *
 * El backend ya los demuestra dos veces: por HTTP en `tests/acceptance.test.ts` y
 * contra PostgreSQL en `scripts/acceptance-live.ts`. Ninguno de los dos demuestra
 * lo que pide **CA-18**, que es que *una persona* pueda completarlos. Eso solo se
 * sabe conduciendo la interfaz, y por eso esto existe.
 *
 * Todo se localiza por rol y nombre accesible —lo que usa un lector de
 * pantalla—, nunca por clase CSS. Si algo deja de tener nombre, la prueba falla
 * antes de que lo note nadie.
 */

const ESPERA_LARGA = { timeout: 60_000 };

test.describe.configure({ mode: 'serial' });

/** La consola no puede quedarse con errores nuevos ni avisos de hidratacion. */
function vigilarLaConsola(page: Page): string[] {
  const problemas: string[] = [];

  page.on('console', (mensaje) => {
    if (mensaje.type() !== 'error') return;
    const texto = mensaje.text();
    // Un 401 esperado durante el arranque no es un fallo del panel.
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

  /**
   * La contrasena no puede acabar nunca en la barra de direcciones.
   *
   * Antes de que React hidrate, `onSubmit` no existe y el navegador envia el
   * formulario de forma nativa: un GET a esta misma ruta con los campos en la
   * URL. La contrasena quedaria en el historial, en los registros del servidor
   * y en la cabecera `Referer`.
   *
   * Paso de verdad la primera vez que esta prueba relleno el formulario mas
   * rapido de lo que tardo la pagina en hidratarse, que es exactamente lo que
   * le ocurre a alguien con una conexion lenta. La defensa es no habilitar el
   * boton hasta poder atender el envio; esto lo vigila.
   */
  expect(page.url()).not.toContain('contrasena');
  expect(page.url()).not.toContain(CUENTA.contrasena);
}

test.describe('Los 18 criterios del MVP, desde el navegador', () => {
  let problemasDeConsola: string[] = [];

  test('CA-01 a CA-18: de un Excel a una aplicacion en uso', async ({ page }) => {
    problemasDeConsola = vigilarLaConsola(page);

    // ---------------------------------------------------------------
    await test.step('Entrar y crear el proyecto', async () => {
      await entrar(page);

      await page.getByRole('button', { name: 'Nuevo proyecto' }).first().click();

      const dialogo = page.getByRole('dialog');
      await dialogo.getByLabel('Nombre').fill('Gestion de Viajes');
      await dialogo.getByRole('button', { name: 'Crear proyecto' }).click();

      await expect(page.getByRole('heading', { name: 'Sube tu Excel' })).toBeVisible(ESPERA_LARGA);
    });

    // --- CA-01 ------------------------------------------------------
    await test.step('CA-01 · se carga un Excel valido', async () => {
      // Antes de elegir ya se dice que se acepta y cuanto pesa como maximo.
      await expect(page.getByText(/Formato XLSX/)).toBeVisible();

      await page.setInputFiles('input[type="file"]', ARCHIVO_VIAJES);
      await expect(page.getByText('viajes.xlsx')).toBeVisible();

      await page.getByRole('button', { name: 'Continuar' }).click();
      await expect(
        page.getByRole('heading', { name: 'Esto encontramos en tu archivo' }),
      ).toBeVisible(ESPERA_LARGA);
    });

    // --- CA-02 ------------------------------------------------------
    await test.step('CA-02 · se identifican sus columnas', async () => {
      // Las tres hojas, no solo la primera.
      for (const hoja of ['Viajes', 'Clientes', 'Notas']) {
        await expect(page.getByText(hoja, { exact: true }).first()).toBeVisible();
      }

      // Y sus columnas, con el tipo que se dedujo.
      for (const columna of ['Fecha', 'Cliente', 'RUC', 'Vehiculo', 'Conductor', 'Valor']) {
        await expect(page.getByRole('columnheader', { name: columna }).first()).toBeVisible();
      }

      // La pista de la que sale la propuesta: 4 clientes en 122 filas.
      await expect(page.getByText('4 distintos').first()).toBeVisible();
    });

    await test.step('Analizar', async () => {
      await page.getByRole('button', { name: 'Analizar' }).click();
      await expect(page.getByRole('heading', { name: 'Esto es lo que vamos a crear' })).toBeVisible(
        ESPERA_LARGA,
      );
    });

    // --- CA-03 y CA-04 ----------------------------------------------
    await test.step('CA-03 y CA-04 · propone varias entidades relacionadas', async () => {
      for (const modulo of ['Clientes', 'Vehiculos', 'Conductores', 'Viajes']) {
        await expect(page.getByRole('heading', { level: 2, name: modulo })).toBeVisible();
      }
    });

    // --- CA-05 ------------------------------------------------------
    await test.step('CA-05 · se puede revisar y corregir la propuesta', async () => {
      await page.getByRole('button', { name: 'Renombrar Clientes' }).click();
      await page.getByLabel('Nombre del modulo').fill('Empresas');
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByRole('heading', { level: 2, name: 'Empresas' })).toBeVisible();

      // Y deshacerlo, que es lo que hace que revisar no de miedo.
      await page.getByRole('button', { name: 'Renombrar Empresas' }).click();
      await page.getByLabel('Nombre del modulo').fill('Clientes');
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByRole('heading', { level: 2, name: 'Clientes' })).toBeVisible();

      await page.getByRole('button', { name: 'Continuar' }).click();
      await expect(page.getByRole('heading', { name: 'Los campos de cada modulo' })).toBeVisible(
        ESPERA_LARGA,
      );
    });

    await test.step('Los tipos se pueden corregir', async () => {
      // El control mas util de la pantalla: arreglar lo que se leyo mal.
      await expect(page.getByLabel('Tipo de Valor')).toBeVisible();

      await page.getByRole('button', { name: 'Continuar' }).click();
      await expect(page.getByRole('heading', { name: 'Como se conectan tus datos' })).toBeVisible(
        ESPERA_LARGA,
      );
    });

    // --- CA-06 ------------------------------------------------------
    await test.step('CA-06 · se aceptan o rechazan las relaciones', async () => {
      await expect(
        page.getByText('Cada viaje pertenece a un cliente. Un cliente puede tener varios viajes.'),
      ).toBeVisible();

      const aceptar = page.getByRole('button', { name: 'Aceptar' });
      await expect(aceptar).toHaveCount(3);

      for (let i = 0; i < 3; i += 1) {
        await page.getByRole('button', { name: 'Aceptar' }).first().click();
        await expect(page.getByRole('button', { name: 'Aceptada' })).toHaveCount(i + 1);
      }

      await page.getByRole('button', { name: 'Continuar' }).click();
      await expect(page.getByRole('heading', { name: 'Gestion de Viajes' })).toBeVisible(
        ESPERA_LARGA,
      );
    });

    // --- CA-07 ------------------------------------------------------
    await test.step('CA-07 · hay un resumen antes de crear', async () => {
      await expect(page.getByText(/4 modulos · 13 campos · 3 relaciones/)).toBeVisible();

      for (const modulo of ['Clientes', 'Vehiculos', 'Conductores', 'Viajes']) {
        // Un `dt` no toma su nombre accesible del contenido: se filtra por texto.
        await expect(page.getByRole('term').filter({ hasText: modulo })).toBeVisible();
      }

      // Escrito para leerse, no para auditarse.
      await expect(page.getByText(/Cada viaje pertenece a un cliente/)).toBeVisible();
    });

    // --- CA-08 ------------------------------------------------------
    await test.step('CA-08 · al confirmar se crean los modulos', async () => {
      await page.getByRole('button', { name: 'Crear aplicacion' }).click();

      // La confirmacion dice la consecuencia, no "¿estas seguro?".
      const dialogo = page.getByRole('alertdialog');
      await expect(dialogo).toContainText('el modelo ya no se puede cambiar');
      await dialogo.getByRole('button', { name: 'Crear aplicacion' }).click();

      await expect(page.getByRole('heading', { name: 'Tu aplicacion esta lista' })).toBeVisible(
        ESPERA_LARGA,
      );
    });

    // --- CA-13 (parte) ----------------------------------------------
    await test.step('CA-13 · se informa de lo importado y de lo que quedo fuera', async () => {
      await expect(page.getByText(/4 modulos · 132 registros · 3 relaciones/)).toBeVisible();

      // Decision 4: continuar y reportar. Dos celdas malas, dos filas fuera.
      await expect(page.getByRole('heading', { name: /2 filas quedaron fuera/ })).toBeVisible();
      await expect(page.getByRole('cell', { name: '122' })).toBeVisible();
      await expect(page.getByText(/deberia ser una fecha/)).toBeVisible();
      await expect(page.getByRole('link', { name: 'Descargar el informe' })).toBeVisible();

      await page.getByRole('link', { name: 'Abrir aplicacion' }).click();
      await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible(ESPERA_LARGA);
    });

    // --- CA-09 ------------------------------------------------------
    await test.step('CA-09 · cada modulo tiene su tabla', async () => {
      const navegacion = page.getByRole('navigation');

      for (const modulo of ['Clientes', 'Vehiculos', 'Conductores', 'Viajes']) {
        await expect(navegacion.getByRole('link', { name: modulo })).toBeVisible();
      }

      await navegacion.getByRole('link', { name: 'Viajes' }).click();
      await expect(page.getByRole('heading', { name: 'Viajes' })).toBeVisible();
      await expect(page.getByText('Mostrando 1-25 de 120')).toBeVisible(ESPERA_LARGA);
    });

    // --- CA-14 y CA-15 ----------------------------------------------
    await test.step('CA-14 y CA-15 · deduplicado y enlazado', async () => {
      await page.getByRole('navigation').getByRole('link', { name: 'Clientes' }).click();
      // 122 filas de Excel, cuatro clientes.
      await expect(page.getByText('Mostrando 1-4 de 4')).toBeVisible(ESPERA_LARGA);

      await page.getByRole('navigation').getByRole('link', { name: 'Viajes' }).click();
      await expect(page.getByText('Mostrando 1-25 de 120')).toBeVisible(ESPERA_LARGA);

      /*
       * La relacion se ve por su etiqueta, nunca por su identificador. No se
       * afirma un nombre concreto: cual cae en la primera pagina depende del
       * orden, y atarse a eso haria fallar la prueba por un motivo que no tiene
       * nada que ver con lo que comprueba.
       */
      await expect(
        page
          .getByRole('cell', {
            name: /Comercial Andes|Cliente Norte|Distribuidora Sur|Transportes Pacifico/,
          })
          .first(),
      ).toBeVisible();
    });

    // --- CA-10, CA-12 y CA-16 ---------------------------------------
    await test.step('CA-10, CA-12 y CA-16 · formulario, selectores y alta', async () => {
      await page.getByRole('button', { name: 'Nuevo viaje' }).first().click();

      const dialogo = page.getByRole('dialog');
      await expect(dialogo.getByLabel(/Fecha/)).toBeVisible();
      await expect(dialogo.getByLabel(/Valor/)).toBeVisible();

      // CA-12: las relaciones se eligen de una lista de registros.
      await dialogo.getByRole('combobox', { name: /Cliente/ }).click();
      await page.getByRole('option', { name: 'Comercial Andes' }).click();

      await dialogo.getByRole('combobox', { name: /Vehiculo/ }).click();
      await page.getByRole('option').first().click();

      await dialogo.getByRole('combobox', { name: /Conductor/ }).click();
      await page.getByRole('option').first().click();

      /*
       * La fecha, por su calendario. El nombre accesible del disparador es
       * "Fecha" —lo aporta su etiqueta, no su texto "Elegir fecha"— y el
       * calendario se monta en un portal, fuera del dialogo.
       */
      await dialogo.getByRole('button', { name: 'Fecha' }).click();
      await page.getByRole('grid').getByText('15', { exact: true }).first().click();

      await dialogo.getByLabel(/Valor/).fill('999.5');

      await dialogo.getByRole('combobox', { name: /Estado/ }).click();
      await page.getByRole('option', { name: 'Abierto' }).click();

      await dialogo.getByRole('button', { name: /Crear viaje/ }).click();

      await expect(page.getByText('Mostrando 1-25 de 121')).toBeVisible(ESPERA_LARGA);
    });

    // --- CA-11 y CA-17 ----------------------------------------------
    await test.step('CA-11 y CA-17 · editar un registro importado', async () => {
      await page.getByRole('button', { name: 'Editar' }).first().click();

      const dialogo = page.getByRole('dialog');
      await dialogo.getByLabel(/Valor/).fill('1234.56');
      await dialogo.getByRole('button', { name: 'Guardar' }).click();

      await expect(page.getByRole('cell', { name: '1.234,56' }).first()).toBeVisible(ESPERA_LARGA);
    });

    /*
     * El caso que motivo C1.
     *
     * La tabla mostraba `1.234,56` y ese mismo texto, escrito en el campo, daba
     * "debe ser un numero": la pantalla contradecia a la pantalla. Se comprueba
     * de la unica forma que lo demuestra: reabriendo el registro que se acaba de
     * guardar y volviendo a enviar lo que el control ya trae escrito.
     */
    await test.step('lo que la tabla muestra es lo que el formulario acepta', async () => {
      await page.getByRole('button', { name: 'Editar' }).first().click();

      const dialogo = page.getByRole('dialog');
      const valor = dialogo.getByLabel(/Valor/);

      // El control se abre diciendo lo mismo que la celda, no `1234.56`.
      await expect(valor).toHaveValue('1.234,56');

      // Y ese texto, tal cual, se acepta y vuelve a la tabla intacto.
      await dialogo.getByRole('button', { name: 'Guardar' }).click();
      await expect(dialogo).toBeHidden(ESPERA_LARGA);
      await expect(page.getByRole('cell', { name: '1.234,56' }).first()).toBeVisible(ESPERA_LARGA);
    });

    // --- CA-18 ------------------------------------------------------
    await test.step('CA-18 · nada de esto exigio escribir codigo', async () => {
      const texto = (await page.locator('body').innerText()).replace(/\s+/g, ' ');

      // Ni SQL, ni nombres fisicos, ni columnas de sistema, ni identificadores.
      for (const tecnico of ['proj_', 'tableName', 'columnName', '__dedupe_key', 'SELECT ']) {
        expect(texto, `se filtro "${tecnico}"`).not.toContain(tecnico);
      }
      expect(texto).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);

      // Y la consola quedo limpia durante todo el recorrido.
      expect(problemasDeConsola, problemasDeConsola.join('\n')).toEqual([]);
    });
  });
  /**
   * Los cuatro puntos que W8 no pudo comprobar sin navegador.
   *
   * Va despues de la aceptacion a proposito —el `describe` es serie— porque
   * necesita la aplicacion que aquella creo. Comprobar el panel vacio no diria
   * nada: lo que desborda es una tabla con siete columnas de datos reales.
   *
   * "Sin solapes" se traduce a algo comprobable: **el documento no puede
   * desbordar horizontalmente**. Si `scrollWidth` supera el ancho de la ventana,
   * hay contenido fuera de la pantalla, y eso en un movil es contenido
   * inalcanzable.
   */
  const VENTANAS = [
    { nombre: '320 (movil estrecho)', width: 320, height: 640 },
    { nombre: '768 (tableta)', width: 768, height: 1024 },
    { nombre: '1024 (portatil)', width: 1024, height: 768 },
    { nombre: '1440 (escritorio)', width: 1440, height: 900 },
  ];

  test('Responsive: sin desbordes de 320 a 1440 ni al 200%', async ({ page }) => {
    const problemas = vigilarLaConsola(page);
    await entrar(page);

    await page.getByRole('row').filter({ hasText: 'Gestion de Viajes' }).first().click();
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible(ESPERA_LARGA);
    await page.getByRole('navigation').getByRole('link', { name: 'Viajes' }).click();
    await expect(page.getByText(/Mostrando 1-25 de/)).toBeVisible(ESPERA_LARGA);

    for (const ventana of VENTANAS) {
      await test.step(ventana.nombre, async () => {
        await page.setViewportSize({ width: ventana.width, height: ventana.height });
        await page.waitForTimeout(400);

        const desborde = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(desborde, `desborda ${desborde}px horizontalmente`).toBeLessThanOrEqual(1);

        // La accion primaria sigue alcanzable, no escondida bajo otra cosa.
        await expect(page.getByRole('button', { name: /Nuevo viaje/ }).first()).toBeVisible();

        await page.screenshot({
          path: `e2e/capturas/viajes-${ventana.width}.png`,
          fullPage: false,
        });
      });
    }

    await test.step('200% de zoom a 1280', async () => {
      // Duplicar el zoom equivale a la mitad del ancho con el mismo contenido.
      await page.setViewportSize({ width: 640, height: 720 });
      await page.evaluate(() => {
        document.documentElement.style.zoom = '200%';
      });
      await page.waitForTimeout(400);

      const desborde = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(desborde, `desborda ${desborde}px al 200%`).toBeLessThanOrEqual(1);

      await page.screenshot({ path: 'e2e/capturas/viajes-zoom-200.png' });
      await page.evaluate(() => {
        document.documentElement.style.zoom = '';
      });
    });

    await test.step('la navegacion movil se abre y se cierra', async () => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.waitForTimeout(300);

      await page.getByRole('button', { name: /Mostrar u ocultar la navegacion/ }).click();
      const cajon = page.getByRole('dialog').first();
      await expect(cajon.getByRole('link', { name: 'Clientes' })).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(cajon).toBeHidden();
    });

    expect(problemas, problemas.join('\n')).toEqual([]);
  });
});
