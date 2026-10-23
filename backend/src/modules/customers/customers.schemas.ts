import { z } from 'zod';

export const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().email().max(254).nullable().optional(),
  })
  .strict();

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
