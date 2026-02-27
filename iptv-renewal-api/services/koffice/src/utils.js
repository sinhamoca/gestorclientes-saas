/* ========================================
   UTILS - Koffice Microservice
   ======================================== */

const PREFIX = {
  INFO: '🟠 [KOFFICE]',
  OK: '✅ [KOFFICE]',
  ERROR: '❌ [KOFFICE]',
  WARN: '⚠️  [KOFFICE]'
};

export function log(message, type = 'INFO') {
  const prefix = PREFIX[type] || PREFIX.INFO;
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`${ts} ${prefix} ${message}`);
}
