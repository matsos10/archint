import { createDb } from '@somar/db';
import { createWorker } from './worker';

const { db, close } = createDb(process.env.DATABASE_URL ?? '', { max: 4, applicationName: 'somar-worker' });
const worker = createWorker({ db, heartbeatFile: process.env.WORKER_HEARTBEAT_FILE ?? '/tmp/worker-heartbeat' });

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    worker.stop();
    setTimeout(() => close().finally(() => process.exit(0)), 2500);
  });
}

worker.run().catch((err) => {
  console.error(err);
  process.exit(1);
});
