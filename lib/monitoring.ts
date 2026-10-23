import {Temporal} from '@js-temporal/polyfill';
import {z} from 'zod';
export const calendarSchema=z.object({timezone:z.string().min(1).max(100).refine(zone=>{try{Temporal.Now.zonedDateTimeISO(zone);return true;}catch{return false;}},'Use an IANA timezone.'),weekdays:z.array(z.number().int().min(1).max(7)).min(1).max(7).refine(days=>new Set(days).size===days.length,'Working weekdays must be unique.'),holidays:z.array(z.iso.date()).max(1000)}).strict();
export type WorkingCalendar=z.infer<typeof calendarSchema>&{version:number};
export const defaultCalendar:WorkingCalendar={timezone:'Asia/Singapore',weekdays:[1,2,3,4,5],holidays:[],version:1};
export function workingDeadline(sentAt:string,calendar:WorkingCalendar){
 calendarSchema.parse({timezone:calendar.timezone,weekdays:calendar.weekdays,holidays:calendar.holidays});
 const start=Temporal.Instant.from(sentAt).toZonedDateTimeISO(calendar.timezone);let date=start.toPlainDate(),count=0;
 while(count<5){date=date.add({days:1});if(calendar.weekdays.includes(date.dayOfWeek)&&!calendar.holidays.includes(date.toString()))count++;}
 // Preserve the original wall-clock time. DST gaps shift forward; overlaps use the earlier instant.
 return Temporal.ZonedDateTime.from({timeZone:calendar.timezone,year:date.year,month:date.month,day:date.day,hour:start.hour,minute:start.minute,second:start.second,millisecond:start.millisecond,microsecond:start.microsecond,nanosecond:start.nanosecond},{disambiguation:'compatible'}).toInstant().toString({smallestUnit:'millisecond'});
}
export type MonitorNamespace='live'|'test';
export type InvitationMonitor={id:string;companyId:string;company:string;contactKey:string;contact:string;owner:string;sentAt:string;recordedAt:string;dueAt:string;calendar:WorkingCalendar;calendarCapturedAt:string;migrated:boolean;status:'accepted'|'checked/pending'|'declined'|'wrong contact'|null;statusAt:string|null;statusBy:string|null;statusNote:string|null};
export type AlertState='queued'|'provider-accepted'|'failed'|'resolved';
export type AlertPayload={from:string;to:string;subject:string;text:string};
export type ProviderEvidence={at:string;operation:'prepare'|'send'|'retrieve';realProvider:boolean;httpStatus:number|null;providerId:string|null;requestId:string|null;code:string|null;lastEvent:string|null;payloadHash?:string;draftId?:string|null;labels?:string[]};
export type MonitorAlert={namespace:MonitorNamespace;send_id:string;state:AlertState;idempotency_key:string;claim_token:string|null;claim_until:string|null;attempts:number;first_attempt_at:string|null;next_attempt_at:string|null;payload:AlertPayload|null;provider_id:string|null;draft_id:string|null;dispatch_at:string|null;error_code:string|null;error_message:string|null;retryable:boolean;resolved_at:string|null;created_at:string;accepted_at:string|null};
export type MonitorSnapshot={namespace:MonitorNamespace;now:string;calendar:WorkingCalendar;events:{sendId:string;state:string;at:string;detail:unknown}[];invitations:InvitationMonitor[];alerts:(MonitorAlert&{evidence:ProviderEvidence[]})[];email:{configured:boolean;recipientConfigured:boolean;provider:'gmail';testRecipientOnly:true};schedulerConfigured:boolean};
export class MonitorError extends Error{constructor(public code:string,message:string,public status=422){super(message);}}
