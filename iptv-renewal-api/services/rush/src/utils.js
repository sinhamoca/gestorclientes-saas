export function log(msg, level = 'INFO') {
  const time = new Date().toLocaleTimeString('pt-BR');
  const prefix = level === 'OK' ? '✅' : level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : '🟠';
  console.log(`${time} ${prefix} [RUSH] ${msg}`);
}
