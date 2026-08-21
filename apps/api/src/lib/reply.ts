import type { FastifyReply } from 'fastify';

export function sendData(reply: FastifyReply, data: unknown, status = 200): void {
  reply.status(status).send({ data });
}
