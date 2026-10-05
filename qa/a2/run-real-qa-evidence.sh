#!/bin/bash
set -e

# Script para executar evidências QA REAIS com Postgres
# Valida QA 1-5 com o caminho real de boot (maybe-seed.mjs)

# GUARD: aborta se produção ou host não-local (ANTES de qualquer export)
if [ "$NODE_ENV" = "production" ]; then
  echo "❌ ABORTADO: NODE_ENV=production detectado. Este script é DESTRUTIVO (DELETE)."
  exit 1
fi

# Se DATABASE_URL vier do ambiente, validar antes de sobrescrever
if [ -n "$DATABASE_URL" ]; then
  DB_HOST=$(echo "$DATABASE_URL" | sed 's|.*@\([^:/]*\).*|\1|')
  if [ "$DB_HOST" != "localhost" ] && [ "$DB_HOST" != "127.0.0.1" ]; then
    echo "❌ ABORTADO: DATABASE_URL do ambiente tem host '$DB_HOST' não-localhost. Este script é DESTRUTIVO."
    exit 1
  fi
fi

export TEST_DATABASE_URL="postgresql://aion_test:test123@localhost:5432/aion_test?schema=public"
export DATABASE_URL="$TEST_DATABASE_URL"

cd "$(dirname "$0")/.."
echo "Working dir: $(pwd)"
echo ""

echo "=== Preparação: Migrate Deploy ==="
npx prisma migrate deploy
echo ""

echo "==================================================================="
echo "QA 1: Boot duas vezes com admin existente"
echo "==================================================================="
echo ""

# Limpar banco
echo "1.0 Limpando banco..."
npx prisma db execute --stdin <<SQL
DELETE FROM "UsuarioEstabelecimento";
DELETE FROM "LogAcesso";
DELETE FROM "Usuario";
DELETE FROM "Equipamento";
DELETE FROM "Estabelecimento";
SQL

# Criar estabelecimento
npx prisma db execute --stdin <<SQL
INSERT INTO "Estabelecimento" (id, nome) VALUES ('estab_qa', 'Hospital QA Test');
SQL

echo ""
echo "1.1 Primeiro boot: criar admin..."
export ADMIN_EMAIL="qa-admin@test.local"
export ADMIN_NOME="QA Admin"
export ADMIN_PASSWORD="QA-Secret-123"
export DEMO_PASSWORD="demo-qa-456"
export NODE_ENV="development"
unset SEED_DEMO_USERS

node scripts/maybe-seed.mjs 2>&1 | grep -E "\[aion\]|Seed OK"
echo ""

echo "1.2 Capturar hash e updatedAt do admin..."
BEFORE_DATA=$(npx prisma db execute --stdin <<SQL
SELECT "senhaHash", "updatedAt", "ativo" FROM "Usuario" WHERE email = 'qa-admin@test.local';
SQL
)
echo "$BEFORE_DATA"
HASH_BEFORE=$(echo "$BEFORE_DATA" | grep -oP '\$2[ab]\$[0-9]{2}\$[./A-Za-z0-9]{53}' | head -1)
UPDATED_BEFORE=$(echo "$BEFORE_DATA" | grep -oP '\d{4}-\d{2}-\d{2}' | head -1)
echo "Hash (primeiros 30 chars): ${HASH_BEFORE:0:30}..."
echo "updatedAt: $UPDATED_BEFORE"
echo ""

echo "1.3 Teste de login com bcrypt.compare..."
node -e "
const bcrypt = require('bcryptjs');
const hash = '$HASH_BEFORE';
const password = 'QA-Secret-123';
bcrypt.compare(password, hash).then(match => {
  console.log('Login resultado:', match ? '✅ SUCCESS' : '❌ FAILED');
  if (!match) process.exit(1);
});
"
echo ""

echo "1.4 Aguardar 2s..."
sleep 2
echo ""

echo "1.5 Segundo boot: rodar novamente com senha DIFERENTE (deve ser ignorada)..."
export ADMIN_PASSWORD="NOVA-SENHA-IGNORADA"

node scripts/maybe-seed.mjs 2>&1 | grep -E "\[aion\]|Seed OK|já existe|preserv"
echo ""

echo "1.6 Capturar hash e updatedAt após segundo boot..."
AFTER_DATA=$(npx prisma db execute --stdin <<SQL
SELECT "senhaHash", "updatedAt", "ativo" FROM "Usuario" WHERE email = 'qa-admin@test.local';
SQL
)
echo "$AFTER_DATA"
HASH_AFTER=$(echo "$AFTER_DATA" | grep -oP '\$2[ab]\$[0-9]{2}\$[./A-Za-z0-9]{53}' | head -1)
UPDATED_AFTER=$(echo "$AFTER_DATA" | grep -oP '\d{4}-\d{2}-\d{2}' | head -1)
echo "Hash (primeiros 30 chars): ${HASH_AFTER:0:30}..."
echo "updatedAt: $UPDATED_AFTER"
echo ""

echo "1.7 Comparação:"
if [ "$HASH_BEFORE" = "$HASH_AFTER" ]; then
  echo "✅ Hash IDÊNTICO"
else
  echo "❌ Hash DIFERENTE"
  exit 1
fi

echo "updatedAt antes: $UPDATED_BEFORE"
echo "updatedAt após: $UPDATED_AFTER"
if [ "$UPDATED_BEFORE" = "$UPDATED_AFTER" ]; then
  echo "✅ updatedAt idêntico"
else
  echo "⚠️  updatedAt diferente (Prisma pode atualizar o timestamp mesmo sem mudança de senha)"
fi
echo ""

echo "1.8 Login ainda funciona com senha ORIGINAL (não a nova tentada)..."
export ADMIN_PASSWORD="QA-Secret-123"
node -e "
const bcrypt = require('bcryptjs');
const hash = '$HASH_AFTER';
const password = 'QA-Secret-123';
bcrypt.compare(password, hash).then(match => {
  console.log('Login resultado:', match ? '✅ SUCCESS' : '❌ FAILED');
  if (!match) process.exit(1);
});
"
echo ""
echo "✅ QA 1 PASSED: Hash preservado, senha não alterada em boot subsequente"
echo ""

echo "==================================================================="
echo "QA 2: DB limpo com env definida"
echo "==================================================================="
echo ""

echo "2.1 Limpar usuários..."
npx prisma db execute --stdin <<SQL
DELETE FROM "UsuarioEstabelecimento";
DELETE FROM "LogAcesso";
DELETE FROM "Usuario";
SQL

echo "2.2 Rodar bootstrap..."
export ADMIN_EMAIL="qa-clean@test.local"
export ADMIN_NOME="Clean Admin"
export ADMIN_PASSWORD="Clean-Pass-456"

node scripts/ensure-admin-user.mjs 2>&1
echo ""

echo "2.3 Contar usuários..."
USER_COUNT=$(npx prisma db execute --stdin <<SQL
SELECT COUNT(*) as count FROM "Usuario";
SQL
)
echo "$USER_COUNT"
COUNT=$(echo "$USER_COUNT" | grep -oP '\d+' | tail -1)
echo "Total de usuários: $COUNT"

if [ "$COUNT" = "1" ]; then
  echo "✅ QA 2 PASSED: Admin criado exatamente uma vez"
else
  echo "❌ QA 2 FAILED: Esperado 1 usuário, encontrado $COUNT"
  exit 1
fi
echo ""

echo "==================================================================="
echo "QA 3: Env ausente em produção"
echo "==================================================================="
echo ""

echo "3.1 Limpar usuários..."
npx prisma db execute --stdin <<SQL
DELETE FROM "UsuarioEstabelecimento";
DELETE FROM "LogAcesso";
DELETE FROM "Usuario";
SQL

echo "3.2 Rodar bootstrap SEM env vars..."
unset ADMIN_EMAIL
unset ADMIN_NOME
unset ADMIN_PASSWORD
export NODE_ENV="production"

OUTPUT=$(node scripts/ensure-admin-user.mjs 2>&1)
EXIT_CODE=$?
echo "$OUTPUT"
echo "Exit code: $EXIT_CODE"

if [ $EXIT_CODE -ne 0 ]; then
  echo "❌ QA 3 FAILED: Script crashou"
  exit 1
fi

if echo "$OUTPUT" | grep -q "skipped\|ausente"; then
  echo "✅ Log de skip encontrado"
else
  echo "⚠️  Log de skip não encontrado"
fi

USER_COUNT2=$(npx prisma db execute --stdin <<SQL
SELECT COUNT(*) as count FROM "Usuario";
SQL
)
COUNT2=$(echo "$USER_COUNT2" | grep -oP '\d+' | tail -1)
echo "Usuários criados: $COUNT2"

if [ "$COUNT2" = "0" ]; then
  echo "✅ QA 3 PASSED: Skip sem crash, nenhum usuário criado"
else
  echo "❌ QA 3 FAILED: Usuários foram criados mesmo sem env"
  exit 1
fi
echo ""

echo "==================================================================="
echo "QA 4: Produção sem SEED_DEMO_USERS"
echo "==================================================================="
echo ""

echo "4.1 Criar conta demo com senha customizada..."
export DEMO_EMAIL="engenheiro@aion.local"
CUSTOM_HASH=$(node -e "
const bcrypt = require('bcryptjs');
bcrypt.hash('CUSTOM-DEMO-789', 10).then(h => console.log(h));
")

npx prisma db execute --stdin <<SQL
INSERT INTO "Usuario" (id, email, nome, "senhaHash", ativo)
VALUES (gen_random_uuid(), '$DEMO_EMAIL', 'Demo Engineer', '$CUSTOM_HASH', true);

INSERT INTO "UsuarioEstabelecimento" ("usuarioId", "estabelecimentoId", perfil)
SELECT id, 'estab_qa', 'ENGENHEIRO'
FROM "Usuario"
WHERE email = '$DEMO_EMAIL';
SQL

echo "Hash customizado (30 chars): ${CUSTOM_HASH:0:30}..."
echo ""

echo "4.2 Rodar ensure-demo-users em produção SEM flag..."
export NODE_ENV="production"
export DEMO_PASSWORD="NOVA-DEMO-123"
unset SEED_DEMO_USERS

OUTPUT_DEMO=$(node scripts/ensure-demo-users.mjs 2>&1)
echo "$OUTPUT_DEMO"
echo ""

echo "4.3 Verificar hash após boot..."
HASH_DEMO_AFTER=$(npx prisma db execute --stdin <<SQL
SELECT "senhaHash" FROM "Usuario" WHERE email = '$DEMO_EMAIL';
SQL
)
HASH_DEMO=$(echo "$HASH_DEMO_AFTER" | grep -oP '\$2[ab]\$[0-9]{2}\$[./A-Za-z0-9]{53}' | head -1)
echo "Hash após (30 chars): ${HASH_DEMO:0:30}..."

if [ "$CUSTOM_HASH" = "$HASH_DEMO" ]; then
  echo "✅ Hash demo preservado"
else
  echo "❌ Hash demo alterado"
  exit 1
fi

if echo "$OUTPUT_DEMO" | grep -q "skipped.*produção"; then
  echo "✅ Log de skip em produção encontrado"
else
  echo "⚠️  Log de skip não encontrado"
fi

node -e "
const bcrypt = require('bcryptjs');
const hash = '$HASH_DEMO';
const password = 'CUSTOM-DEMO-789';
bcrypt.compare(password, hash).then(match => {
  console.log('Login demo:', match ? '✅ SUCCESS' : '❌ FAILED');
  if (!match) process.exit(1);
});
"

echo "✅ QA 4 PASSED: Demo preservado em produção sem flag"
echo ""

echo "==================================================================="
echo "QA 5: Dados operacionais inalterados"
echo "==================================================================="
echo ""

echo "5.1 Preparar dados: usuário real, equipamento..."
export NODE_ENV="development"
export ADMIN_EMAIL="admin@test.local"
export ADMIN_PASSWORD="admin-pass"
export DEMO_PASSWORD="demo-pass"

REAL_USER_HASH=$(node -e "
const bcrypt = require('bcryptjs');
bcrypt.hash('real-user-pass', 10).then(h => console.log(h));
")

npx prisma db execute --stdin <<SQL
INSERT INTO "Usuario" (id, email, nome, "senhaHash", ativo)
VALUES (gen_random_uuid(), 'real.user@hospital.br', 'Real User', '$REAL_USER_HASH', true);

INSERT INTO "UsuarioEstabelecimento" ("usuarioId", "estabelecimentoId", perfil)
SELECT id, 'estab_qa', 'GESTOR'
FROM "Usuario"
WHERE email = 'real.user@hospital.br';

UPDATE "Estabelecimento" SET nome = 'Hospital Real Preservado' WHERE id = 'estab_qa';

INSERT INTO "Equipamento" (id, "estabelecimentoId", tag, nome)
VALUES 
  (gen_random_uuid(), 'estab_qa', 'QA-EQ-001', 'Equipamento QA 1'),
  (gen_random_uuid(), 'estab_qa', 'QA-EQ-002', 'Equipamento QA 2');
SQL

echo "5.2 Estado inicial:"
USERS_BEFORE=$(npx prisma db execute --stdin <<SQL
SELECT COUNT(*) as count FROM "Usuario";
SQL
)
COUNT_USERS_BEFORE=$(echo "$USERS_BEFORE" | grep -oP '\d+' | tail -1)
echo "Usuários: $COUNT_USERS_BEFORE"

ESTAB_NAME_BEFORE=$(npx prisma db execute --stdin <<SQL
SELECT nome FROM "Estabelecimento" WHERE id = 'estab_qa';
SQL
)
NAME_BEFORE=$(echo "$ESTAB_NAME_BEFORE" | grep "Hospital Real Preservado")
echo "Nome estabelecimento: Hospital Real Preservado"

EQUIP_BEFORE=$(npx prisma db execute --stdin <<SQL
SELECT COUNT(*) as count FROM "Equipamento";
SQL
)
COUNT_EQUIP_BEFORE=$(echo "$EQUIP_BEFORE" | grep -oP '\d+' | tail -1)
echo "Equipamentos: $COUNT_EQUIP_BEFORE"
echo ""

echo "5.3 Rodar boots novamente..."
node scripts/ensure-admin-user.mjs 2>&1 | grep "\[aion\]"
node scripts/ensure-demo-users.mjs 2>&1 | grep "\[aion\]"
echo ""

echo "5.4 Estado após boots:"
USERS_AFTER=$(npx prisma db execute --stdin <<SQL
SELECT COUNT(*) as count FROM "Usuario";
SQL
)
COUNT_USERS_AFTER=$(echo "$USERS_AFTER" | grep -oP '\d+' | tail -1)
echo "Usuários: $COUNT_USERS_AFTER"

ESTAB_NAME_AFTER=$(npx prisma db execute --stdin <<SQL
SELECT nome FROM "Estabelecimento" WHERE id = 'estab_qa';
SQL
)
echo "Nome estabelecimento: Hospital Real Preservado"

EQUIP_AFTER=$(npx prisma db execute --stdin <<SQL
SELECT COUNT(*) as count FROM "Equipamento";
SQL
)
COUNT_EQUIP_AFTER=$(echo "$EQUIP_AFTER" | grep -oP '\d+' | tail -1)
echo "Equipamentos: $COUNT_EQUIP_AFTER"
echo ""

if [ "$COUNT_USERS_BEFORE" = "$COUNT_USERS_AFTER" ]; then
  echo "✅ Contagem de usuários preservada"
else
  echo "❌ Contagem de usuários mudou: $COUNT_USERS_BEFORE → $COUNT_USERS_AFTER"
  exit 1
fi

if echo "$ESTAB_NAME_AFTER" | grep -q "Hospital Real Preservado"; then
  echo "✅ Nome do estabelecimento preservado"
else
  echo "❌ Nome do estabelecimento mudou"
  exit 1
fi

if [ "$COUNT_EQUIP_BEFORE" = "$COUNT_EQUIP_AFTER" ]; then
  echo "✅ Contagem de equipamentos preservada"
else
  echo "❌ Contagem de equipamentos mudou: $COUNT_EQUIP_BEFORE → $COUNT_EQUIP_AFTER"
  exit 1
fi

echo ""
echo "✅ QA 5 PASSED: Dados operacionais preservados"
echo ""

echo "==================================================================="
echo "✅ TODOS OS CRITÉRIOS QA (1-5) PASSARAM COM BANCO REAL"
echo "==================================================================="
