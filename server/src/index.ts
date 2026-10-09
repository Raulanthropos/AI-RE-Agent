import { createApp } from './app.js';
import { port } from './config.js';
import { openDatabase } from './db/database.js';

const db = openDatabase();
const server = createApp(db).listen(port, '127.0.0.1');
server.on('listening', () => {
  console.log(`Property API listening at http://127.0.0.1:${port}`);
});
server.on('error', error => { console.error(error); db.close(); process.exitCode = 1; });
const shutdown = () => {
  server.close(() => { db.close(); process.exit(0); });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
