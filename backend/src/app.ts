import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { requestLogger } from './middleware/request-logger';
import { errorHandler } from './middleware/error-handler';
import routes from './routes';
import { env } from './config/env';

const app: Express = express();

app.use(requestLogger);
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);

app.use(errorHandler);

export default app;
