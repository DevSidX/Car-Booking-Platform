import type { RequestHandler } from 'express';
import { actorFrom } from '../../common/actor';
import { ok } from '../../common/response';
import { objectId } from '../../common/zod';
import {
  bookingListQuerySchema,
  expiringDocumentsQuerySchema,
  userListQuerySchema,
  userStatusSchema,
  waiveFeeSchema,
} from './admin.schemas';
import type { AdminService } from './admin.service';

export function createAdminController(service: AdminService) {
  const listUsers: RequestHandler = async (req, res) => {
    const { items, meta } = await service.listUsers(userListQuerySchema.parse(req.query));
    ok(res, items, 200, meta);
  };

  const userDetail: RequestHandler = async (req, res) => {
    ok(res, await service.userDetail(objectId.parse(req.params['userId'])));
  };

  const setUserStatus: RequestHandler = async (req, res) => {
    const userId = objectId.parse(req.params['userId']);
    ok(res, await service.setUserStatus(actorFrom(req), userId, userStatusSchema.parse(req.body)));
  };

  const listBookings: RequestHandler = async (req, res) => {
    const { items, meta } = await service.listBookings(bookingListQuerySchema.parse(req.query));
    ok(res, items, 200, meta);
  };

  const bookingDetail: RequestHandler = async (req, res) => {
    ok(res, await service.bookingDetail(actorFrom(req), String(req.params['bookingId'])));
  };

  const rideTrail: RequestHandler = async (req, res) => {
    ok(res, await service.rideTrail(actorFrom(req), String(req.params['rideId'])));
  };

  const waiveFee: RequestHandler = async (req, res) => {
    const input = waiveFeeSchema.parse(req.body);
    ok(res, await service.waiveFee(actorFrom(req), String(req.params['bookingId']), input));
  };

  const expiringDocuments: RequestHandler = async (req, res) => {
    const { items, meta } = await service.expiringDocuments(
      expiringDocumentsQuerySchema.parse(req.query),
    );
    ok(res, items, 200, meta);
  };

  const dashboard: RequestHandler = async (_req, res) => {
    ok(res, await service.dashboard());
  };

  return {
    listUsers,
    userDetail,
    setUserStatus,
    listBookings,
    bookingDetail,
    rideTrail,
    waiveFee,
    expiringDocuments,
    dashboard,
  };
}
