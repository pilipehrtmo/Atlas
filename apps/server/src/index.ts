import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { DataService } from './providers/service.js';

const config = loadConfig();
const db = openDb(config.ATLAS_DB_PATH);
const data = DataService.fromConfig(config);
const app = buildApp(config, db, data);

app.listen({ port: config.PORT, host: config.HOST }).then(() => {
  app.log.info(`${config.ATLAS_PRODUCT_NAME} API on http://${config.HOST}:${config.PORT} (data mode: ${data.mode})`);
});
