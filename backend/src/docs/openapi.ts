/**
 * OpenAPI skeleton. Each module adds its paths here as it ships, so the published
 * contract and the implementation move together (see docs/api-contract.md).
 */
const errorEnvelope = {
  type: 'object',
  required: ['success', 'error'],
  properties: {
    success: { type: 'boolean', enum: [false] },
    error: {
      type: 'object',
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        fieldErrors: {
          type: 'array',
          items: {
            type: 'object',
            properties: { field: { type: 'string' }, message: { type: 'string' } },
          },
        },
        requestId: { type: 'string' },
      },
    },
  },
} as const;

const okResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { type: 'object' } } },
});

export const openApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Cab Booking Platform API', version: '0.1.0' },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: { ErrorEnvelope: errorEnvelope },
  },
  paths: {
    '/health/live': {
      get: {
        tags: ['Health'],
        summary: 'Liveness',
        responses: { '200': okResponse('Process is alive') },
      },
    },
    '/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness (checks MongoDB and Redis)',
        responses: {
          '200': okResponse('Ready'),
          '503': {
            description: 'A dependency is down or the service is draining',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
            },
          },
        },
      },
    },
  },
} as const;
