import { IsIn, IsString, Matches } from 'class-validator';

export const WHATSAPP_ATTEMPT_STAGES = [
  'launch-attempted',
  'launch-opened',
  'launch-blocked',
  'launch-failed',
  'handoff-succeeded',
  'handoff-failed',
  'returned-to-app',
  'navigation-failed',
] as const;

export const WHATSAPP_CLIENT_MODES = [
  'ios-pwa',
  'ios-browser',
  'android-browser',
  'other-browser',
] as const;

export class WhatsAppAttemptDto {
  @IsString()
  @Matches(/^wa-[a-z0-9-]+$/)
  attemptId: string;

  @IsIn(WHATSAPP_ATTEMPT_STAGES)
  stage: (typeof WHATSAPP_ATTEMPT_STAGES)[number];

  @IsIn(WHATSAPP_CLIENT_MODES)
  clientMode: (typeof WHATSAPP_CLIENT_MODES)[number];
}
