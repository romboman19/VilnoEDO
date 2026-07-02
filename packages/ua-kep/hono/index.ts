import { Hono } from 'hono';

import { bootstrapRoute } from './bootstrap';
import { completeRoute } from './complete';
import { pkiProxyRoute } from './pki-proxy';
import { prepareRoute } from './prepare';

export const uaKep = new Hono();

uaKep.route('/bootstrap', bootstrapRoute);
uaKep.route('/prepare', prepareRoute);
uaKep.route('/complete', completeRoute);
uaKep.route('/pki', pkiProxyRoute);
