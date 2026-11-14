import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { clientIp, userAgent } from '../utils/request';

/** Audit uchun amal bajaruvchi: id + IP + UA + request_id. */
export type Actor = { id: string; ip: string | null; ua: string | null; request_id: string | null };

export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest();
  return { id: req.user?.id, ip: clientIp(req), ua: userAgent(req), request_id: (req.headers['x-request-id'] as string) ?? req.id ?? null };
});
