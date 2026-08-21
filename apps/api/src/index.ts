import { buildServer } from './server.js';

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

buildServer()
  .then((app) => app.listen({ port, host }))
  .catch((error) => {
    console.error('Failed to start the KpnSolute API:', error);
    process.exitCode = 1;
  });
