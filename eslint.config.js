import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import ts from 'typescript-eslint'

export default ts.config(
  { ignores: ['dist', 'coverage', 'examples'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { languageOptions: { globals: globals.node } },
  prettier,
)
