import { Hono } from 'hono';
import { Env } from '..';

const auth = new Hono<Env>().basePath('/auth');

auth.post('/login', (c) => {
    // if Authentication Header is present, and is a valid session token, then we are authenticated
    

	return c.json({ message: 'Login successful' });
});
