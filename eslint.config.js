import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import ts from 'typescript-eslint'

export default ts.config({ ignores: ['dist', 'coverage'] }, js.configs.recommended, ...ts.configs.recommended, prettier)
