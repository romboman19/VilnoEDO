import { Hono } from 'hono';

import { bootstrapRoute } from './bootstrap';
import { completeRoute } from './complete';
import { evidenceRoute } from './evidence';
import { pkiProxyRoute } from './pki-proxy';
import { prepareRoute } from './prepare';
import { statusRoute } from './status';

export const uaKep = new Hono();

uaKep.route('/bootstrap', bootstrapRoute);
uaKep.route('/prepare', prepareRoute);
uaKep.route('/complete', completeRoute);
uaKep.route('/evidence', evidenceRoute);
uaKep.route('/status', statusRoute);
uaKep.route('/pki', pkiProxyRoute);
