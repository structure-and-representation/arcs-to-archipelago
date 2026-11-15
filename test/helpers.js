import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');
export const fixture = (name) => JSON.parse(readFileSync(resolve(dir, name), 'utf8'));
export const prefectures = () => fixture('prefectures.json');
export const IDX = { sapporo: 0, tokyo: 12, osaka: 26, kagoshima: 45, okinawa: 46 };
