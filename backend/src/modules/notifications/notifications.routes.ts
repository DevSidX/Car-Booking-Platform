import { Router } from 'express';
import type { ModuleContext } from '../../context';
import { createNotificationsController } from './notifications.controller';
import type { NotificationsService } from './notifications.service';

/** Devices and the in-app inbox: for every signed-in user, always scoped to the caller. */
export function notificationsRouter(ctx: ModuleContext, service: NotificationsService): Router {
  const r = Router();
  const c = createNotificationsController(service);

  r.post('/devices', ctx.authenticate, c.registerDevice);
  r.delete('/devices/:deviceId', ctx.authenticate, c.removeDevice);
  r.get('/notifications', ctx.authenticate, c.list);
  r.post('/notifications/read', ctx.authenticate, c.markRead);

  return r;
}
