import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import next from '@next/eslint-plugin-next';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'storage/**',
      // Scripts de medicion: se ejecutan a mano, no forman parte del build.
      'apps/api/bench/**',
      // Cliente de Prisma: generado por script, nunca editado a mano.
      'apps/api/src/infrastructure/database/generated/**',
      // Salida de Next.
      'apps/web/.next/**',
      'apps/web/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'no-console': ['error', { allow: ['error'] }],
    },
  },
  {
    /**
     * Guardarrail del ADR 0001.
     *
     * Componer SQL con plantillas solo esta permitido en el constructor, que es
     * donde viven la validacion de identificadores y el citado. Fuera de ahi,
     * cualquier `client.query(`...`)` con interpolacion es exactamente el fallo
     * que el ADR se compromete a evitar, y es el tipo de codigo que se cuela sin
     * que nadie lo note en una revision.
     */
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/infrastructure/database/sql/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='query'] > TemplateLiteral[expressions.length>0]",
          message:
            'No compongas SQL con interpolacion fuera de infrastructure/database/sql. Usa el constructor (ADR 0001).',
        },
        {
          selector: "MemberExpression[property.name='$queryRawUnsafe']",
          message: 'El SQL crudo solo puede construirse en infrastructure/database/sql (ADR 0001).',
        },
        {
          selector: "MemberExpression[property.name='$executeRawUnsafe']",
          message: 'El SQL crudo solo puede construirse en infrastructure/database/sql (ADR 0001).',
        },
      ],
    },
  },
  {
    /**
     * El panel.
     *
     * Dos diferencias con el backend, y solo dos: aqui hay navegador, asi que
     * entran sus globales; y hay React, asi que entran las reglas que evitan los
     * fallos que el compilador no ve —dependencias de efectos, hooks bajo una
     * condicion— mas las de Next.
     */
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, '@next/next': next },
    // Sin esto, el plugin busca `pages/` en la raiz del monorepo y avisa.
    settings: { next: { rootDir: 'apps/web' } },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      ...next.configs.recommended.rules,
      ...next.configs['core-web-vitals'].rules,
      /**
       * Un manejador de React devuelve `void`, y pasarle una funcion `async`
       * es habitual y correcto. La regla sigue vigilando el resto.
       */
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
  {
    files: ['**/*.config.*', '**/*.test.ts', '**/*.test.tsx', '**/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
