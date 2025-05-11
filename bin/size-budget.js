#!/usr/bin/env node
import { run } from '../dist/cli.js'

const [code, output] = await run(process.argv.slice(2))
;(code === 0 ? process.stdout : process.stderr).write(output)
process.exit(code)
