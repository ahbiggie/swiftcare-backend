import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import routes from './routes/index.js';
import errorHandler from './middlewares/errorHandler.js';
import swaggerSpec from './config/swagger.js';

const app = express();

// TEMPORARY: frontend asked to allow all origins while their dev/deploy
// URL is in flux. Reflects the request's Origin rather than a bare "*"
// so this stays compatible if credentialed requests are ever added later.
// REVERT to the CORS_ORIGIN allowlist once frontend has a stable origin — see DECISIONS.md.
app.use(cors({ origin: true }));

app.use(express.json());

// Interactive docs, generated from @openapi JSDoc blocks in src/routes/*.js.
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api', routes);
app.use(errorHandler);

export default app;
