/**
 * App configuration.
 *
 * Change EXAM_URL to your production domain before building a release.
 */
export const CONFIG = {
  /** The URL the WebView loads — your Next.js exam site */
  EXAM_URL: 'https://your-domain.com',

  /** Dev URL for local testing (used when __DEV__ is true) */
  DEV_URL: 'http://10.0.2.2:12059', // Android emulator → host localhost

  /** App display name shown in the splash / header */
  APP_NAME: '智考云',

  /** User-agent suffix so the web app can detect it's inside the native shell */
  USER_AGENT_SUFFIX: 'ZhikaoExamApp/1.0',
} as const;
