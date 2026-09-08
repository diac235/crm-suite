import path from 'node:path';
import dotenv from 'dotenv';

// Las pruebas usan su propia base de datos (.env.test) para no tocar datos reales.
dotenv.config({ path: path.resolve(__dirname, '../.env.test'), override: true });
process.env.NODE_ENV = 'test';
