import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/connection.js';

declare global {
  namespace Express {
    interface Request {
      domainKey?: string | null;
    }
  }
}

export function domainKeyMiddleware(req: Request, _res: Response, next: NextFunction): void {
  let domainKey = req.headers['x-domain-key'] as string | undefined;

  if (!domainKey) {
    const host = req.hostname || '';
    const parts = host.split('.');
    if (parts.length >= 3) {
      domainKey = parts[0];
    }
  }

  if (domainKey) {
    const db = getDb();
    const domain = db.prepare('SELECT domain_key FROM domains WHERE domain_key = ? AND active = 1').get(domainKey) as { domain_key: string } | undefined;
    req.domainKey = domain ? domainKey : null;
  } else {
    req.domainKey = null;
  }

  next();
}
