import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import routes from './routes/index.js';
import errorHandler from './middlewares/errorHandler.js';
import ApiError from './utils/ApiError.js';
import { ErrorCode } from './constants/index.js';
import swaggerSpec from './config/swagger.js';

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        // No Origin header
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new ApiError(403, ErrorCode.FORBIDDEN_ORIGIN, `Origin ${origin} is not allowed`));
    },
}));

app.use(express.json());

// Interactive docs, generated from @openapi JSDoc blocks in src/routes/*.js.
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api', routes);
app.use(errorHandler);

export default app;
