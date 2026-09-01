import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adapterJsonSchema } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const destination = resolve(here, '..', 'adapter.schema.json');

await writeFile(destination, `${JSON.stringify(adapterJsonSchema, null, 2)}\n`, 'utf8');
