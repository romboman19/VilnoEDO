import { Hono } from 'hono';

export const bootstrapRoute = new Hono().get('/', (c) => {
  return c.json({
    ok: true,
    methods: [
      { id: 'file-key', label: 'Файловий ключ КЕП', status: 'ready', enabled: true },
      { id: 'iit-token', label: 'Апаратний токен IIT', status: 'experimental', enabled: false },
      { id: 'privatbank-smartid', label: 'PrivatBank SmartID', status: 'experimental', enabled: false },
      { id: 'diia-signature', label: 'Дія.Підпис', status: 'disabled', enabled: false },
    ],
    formats: ['CADES_DETACHED'],
    assets: {
      workerUrl: '/ua-kep/vendor/euscp.worker.js',
      caRegistryUrl: '/ua-kep/data/CAs.json',
      caBundleUrl: '/ua-kep/data/CACertificates.p7b',
    },
  });
});
