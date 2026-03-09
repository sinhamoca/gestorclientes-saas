#!/bin/bash
DB="docker exec supabase-db psql -U postgres -d postgres -t -A"

echo "== 1. DADOS DA CLIENTE jane 2 =="
$DB -c "SELECT c.id, c.name, c.due_date, c.is_active, c.whatsapp_number IS NOT NULL AS tem_whatsapp, LEFT(c.whatsapp_number, 25) AS whatsapp_preview, c.whatsapp_number LIKE 'enc:%' AS criptografado, c.user_id FROM clients c WHERE LOWER(c.name) LIKE '%jane%2%' OR LOWER(c.name) LIKE '%jane 2%';"

echo ""
echo "== 2. LEMBRETES ATIVOS =="
$DB -c "SELECT r.id, r.name, r.days_offset, r.send_time, r.is_active, r.last_sent_date, r.user_id, mt.name AS template_name FROM reminders r LEFT JOIN message_templates mt ON mt.id = r.template_id WHERE r.is_active = true ORDER BY r.days_offset;"

echo ""
echo "== 3. CLIENTES COM VENCIMENTO 01/03 =="
$DB -c "SELECT c.name, c.due_date, c.is_active, c.whatsapp_number IS NOT NULL AS tem_whatsapp, c.whatsapp_number LIKE 'enc:%' AS criptografado, LENGTH(c.whatsapp_number) AS tam FROM clients c WHERE c.due_date = '2026-03-01' ORDER BY c.name;"

echo ""
echo "== 4. CLIENTES SEM WHATSAPP OU INATIVOS =="
$DB -c "SELECT c.name, c.due_date, c.is_active, CASE WHEN c.whatsapp_number IS NULL THEN 'NULL' WHEN c.whatsapp_number = '' THEN 'VAZIO' WHEN c.whatsapp_number LIKE 'enc:%' THEN 'OK' ELSE 'TEXTO_PURO' END AS status_wpp FROM clients c WHERE c.due_date BETWEEN '2026-02-26' AND '2026-03-05' AND (c.is_active = false OR c.whatsapp_number IS NULL OR c.whatsapp_number = '') ORDER BY c.due_date;"

echo ""
echo "== 5. LOGS DE MENSAGENS jane 2 =="
$DB -c "SELECT ml.client_name, ml.status, ml.error_message, ml.reminder_name, ml.sent_at FROM message_logs ml WHERE LOWER(ml.client_name) LIKE '%jane%2%' ORDER BY ml.sent_at DESC LIMIT 10;"

echo ""
echo "== 6. ULTIMOS ENVIOS 48h =="
$DB -c "SELECT ml.client_name, ml.status, ml.reminder_name, ml.sent_at FROM message_logs ml WHERE ml.sent_at > NOW() - INTERVAL '48 hours' ORDER BY ml.sent_at DESC LIMIT 30;"

echo ""
echo "== 7. LOG DO CRON =="
tail -30 /var/log/gestaopro-reminders.log 2>/dev/null || echo "Log nao encontrado"

echo ""
echo "== 8. EDGE FUNCTION LOGS =="
docker logs supabase-edge-functions 2>&1 | grep -i "send-reminders" | tail -20

echo ""
echo "== 9. ENCRYPTION_KEY =="
grep -c "ENCRYPTION_KEY" /opt/gestaopro/supabase-docker/docker-compose.yml 2>/dev/null && echo "Presente" || echo "AUSENTE!"

echo ""
echo "== 10. PERFIL WUZAPI =="
$DB -c "SELECT p.user_id, p.name, p.wuzapi_url IS NOT NULL AS tem_wuzapi, p.wuzapi_token IS NOT NULL AS tem_token, p.messages_per_minute FROM profiles p WHERE p.user_id IN (SELECT DISTINCT user_id FROM reminders WHERE is_active = true);"

echo ""
echo "== 11. TESTE MANUAL =="
SRK=$(grep -E "^SERVICE_ROLE_KEY=" /opt/gestaopro/supabase-docker/.env | cut -d'=' -f2-)
curl -s -X POST "http://localhost:8000/functions/v1/send-reminders" -H "Authorization: Bearer $SRK" -H "Content-Type: application/json"
echo ""
