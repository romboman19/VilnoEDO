import { Hono } from 'hono';

import { bootstrapRoute } from './bootstrap';

export const uaKep = new Hono();

uaKep.route('/bootstrap', bootstrapRoute);
