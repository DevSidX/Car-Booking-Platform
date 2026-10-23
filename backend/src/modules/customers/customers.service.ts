import { AppError } from '../../common/errors';
import { User } from '../users/user.model';
import { CustomerProfile } from './customerProfile.model';
import type { UpdateCustomerInput } from './customers.schemas';

export function createCustomersService() {
  async function getProfile(userId: string) {
    const [user, profile] = await Promise.all([
      User.findById(userId).lean(),
      CustomerProfile.findOne({ userId }).lean(),
    ]);
    if (!user) throw new AppError('NOT_FOUND');
    return {
      id: user._id.toString(),
      phone: user.phone,
      name: user.name ?? null,
      email: profile?.email ?? null,
      accountStatus: user.accountStatus,
      createdAt: user.createdAt,
    };
  }

  return {
    getProfile,

    async updateProfile(userId: string, input: UpdateCustomerInput) {
      if (input.name !== undefined) await User.updateOne({ _id: userId }, { name: input.name });
      if (input.email !== undefined) {
        await CustomerProfile.updateOne(
          { userId },
          input.email === null ? { $unset: { email: 1 } } : { email: input.email },
          { upsert: true },
        );
      }
      return getProfile(userId);
    },
  };
}

export type CustomersService = ReturnType<typeof createCustomersService>;
