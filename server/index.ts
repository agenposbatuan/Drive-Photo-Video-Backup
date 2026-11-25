import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { ownerRouter } from './routes/owner.js';
import { familyRouter } from './routes/family.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'private-family-gallery-gateway' });
  });

  app.use('/api/owner', ownerRouter);
  app.use('/api/family', familyRouter);

  const distDir = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return app;
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() === path.resolve(import.meta.filename).toLowerCase();

if (isDirectRun) {
  const port = Number(process.env.PORT || 3001);
  const app = createApp();
  app.listen(port, () => {
    console.log(`[FamilyGallery Gateway] listening on http://localhost:${port}`);
  });
}
