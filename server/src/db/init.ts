import { databasePath } from '../config.js';
import { openDatabase } from './database.js';
const db = openDatabase();
db.close();
console.log(`SQLite ready: ${databasePath}`);
