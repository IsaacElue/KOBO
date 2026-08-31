export const NAV_ITEMS = [
  "Overview",
  "Send money",
  "Recipients",
  "Activity",
  "Settings",
  "Help",
] as const;

export const OVERVIEW_INDEX = 0;
export const SEND_MONEY_INDEX = 1;
export const RECIPIENTS_INDEX = 2;
export const ACTIVITY_INDEX = 3;
export const SETTINGS_INDEX = 4;
export const HELP_INDEX = 5;

/**
 * The subset shown in the mobile bottom tab bar (< 1024px). Same items and
 * labels as the sidebar, minus Settings — which stays reachable from the
 * account dropdown in the header, exactly as on desktop.
 */
export const MOBILE_NAV_INDICES = [
  OVERVIEW_INDEX,
  SEND_MONEY_INDEX,
  RECIPIENTS_INDEX,
  ACTIVITY_INDEX,
  HELP_INDEX,
] as const;
