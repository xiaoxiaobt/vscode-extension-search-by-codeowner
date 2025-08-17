// @ts-check
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = [
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts', '**/*.tsx'],
        rules: {
            '@typescript-eslint/naming-convention': 'warn',
            '@typescript-eslint/consistent-type-imports': ['error', { 'prefer': 'type-imports' }],
            'curly': 'warn',
            'eqeqeq': 'warn',
            'no-throw-literal': 'warn',
            'semi': 'off'
        }
    },
    {
        ignores: [
            'out/**',
            'dist/**',
            '**/*.d.ts'
        ]
    }
];
