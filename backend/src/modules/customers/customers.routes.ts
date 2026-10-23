import { Router } from 'express';
import { requireRole } from '../../middleware/auth';
import type { ModuleContext } from '../../context';
import { createCustomersController } from './customers.controller';
import { createCustomersService } from './customers.service';

export function customersRouter(ctx: ModuleContext): Router {
  const r = Router();
  const c = createCustomersController(createCustomersService());
  const customerOnly = [ctx.authenticate, requireRole('CUSTOMER')];

  r.get('/customers/me', ...customerOnly, c.getMe);
  r.patch('/customers/me', ...customerOnly, c.updateMe);

  return r;
}
