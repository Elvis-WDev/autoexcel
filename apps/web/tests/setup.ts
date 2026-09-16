import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/**
 * Lo que jsdom no trae y Radix necesita.
 *
 * Los primitivos de Radix —menus, popovers, dialogos— miden y colocan sus capas
 * flotantes con APIs de navegador que jsdom no implementa. Sin estos dobles,
 * cualquier test que abra un menu falla con `ResizeObserver is not defined`, que
 * no dice nada sobre el componente que se esta probando.
 */
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

if (!('DOMRect' in globalThis)) {
  Object.defineProperty(globalThis, 'DOMRect', {
    writable: true,
    value: class {
      constructor(
        public x = 0,
        public y = 0,
        public width = 0,
        public height = 0,
      ) {}
      top = 0;
      left = 0;
      right = 0;
      bottom = 0;
      toJSON(): object {
        return this;
      }
    },
  });
}

function rellenar(nombre: string, valor: unknown): void {
  if (nombre in Element.prototype) return;
  Object.defineProperty(Element.prototype, nombre, { writable: true, value: valor });
}

rellenar('scrollIntoView', vi.fn());
rellenar('hasPointerCapture', () => false);
rellenar('setPointerCapture', vi.fn());
rellenar('releasePointerCapture', vi.fn());

afterEach(() => {
  cleanup();
});
