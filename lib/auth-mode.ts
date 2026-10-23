/** Hosted mode is fail-closed; fixture role switching remains available only outside hosted mode. */
export const accountMode=()=>process.env.EVOX_AUTH_MODE==='accounts'||process.env.RENDER==='true';
