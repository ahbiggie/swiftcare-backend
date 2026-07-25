import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import errorHandler from './middlewares/errorHandler.js';
import ApiError from './utils/ApiError.js';
import { ErrorCode } from './constants/index.js';

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
app.use('/api', routes);
app.use(errorHandler);

export default app;
