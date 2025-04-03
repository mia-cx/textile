import { Hono } from 'hono';
import { getEnv } from '../lib/util/getEnv';
import { getRoutes } from '../lib/util/getRoutes';
import { logger } from 'hono/logger';
import { showRoutes } from 'hono/dev';

export type CloudflareBindings = {};

export type CloudflareVariables = {};

export type Env = {
	Bindings: CloudflareBindings;
	Variables: CloudflareVariables;
};

const app = new Hono<Env>().basePath('/api');

app.use(logger());

app.get('/', (c) => {
	console.debug();
	return c.json({
		name: 'Textile API',
		version: getEnv(c, 'VERSION'),
		routes: getRoutes(app),
	});
});

showRoutes(app);

export default app;
