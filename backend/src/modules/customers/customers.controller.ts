import type { RequestHandler } from 'express';
import { actorFrom } from '../../common/actor';
import { ok } from '../../common/response';
import { updateCustomerSchema } from './customers.schemas';
import type { CustomersService } from './customers.service';

export function createCustomersController(service: CustomersService) {
  const getMe: RequestHandler = async (req, res) => {
    ok(res, await service.getProfile(actorFrom(req).userId));
  };

  const updateMe: RequestHandler = async (req, res) => {
    const input = updateCustomerSchema.parse(req.body);
    ok(res, await service.updateProfile(actorFrom(req).userId, input));
  };

  return { getMe, updateMe };
}
