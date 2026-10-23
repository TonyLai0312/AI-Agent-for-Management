import {randomUUID} from 'node:crypto';
const runtime=globalThis as unknown as {evoxBootIdentity?:string};
export const bootIdentity=runtime.evoxBootIdentity??=randomUUID();
