import { handler } from './handler.ts';
import { healthResponse } from './health.ts';

Deno.serve((req) => new URL(req.url).searchParams.get('health') === '1'
  ? healthResponse()
  : handler(req));
