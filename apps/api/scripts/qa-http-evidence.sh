#!/bin/bash
set -e

echo "=== Evidência HTTP: Login e Tokens de Usuários Inativos ==="
echo ""

# Guard: só localhost
if [ "$NODE_ENV" = "production" ]; then
  echo "❌ ABORTADO: NODE_ENV=production. Este script é destrutivo."
  exit 1
fi

API_URL="${API_URL:-http://localhost:3001}"
DB_URL="postgresql://aion_test:test123@localhost:5432/aion_test?schema=public"

echo "API: $API_URL"
echo "DB:  localhost:5432/aion_test"
echo ""

# Verificar se a API está rodando
API_CHECK=$(curl -s "$API_URL/api/auth/login" | grep -o "Use POST" || echo "")
if [ -z "$API_CHECK" ]; then
  echo "❌ API não está respondendo em $API_URL"
  echo "   Inicie com: cd apps/api && DATABASE_URL='$DB_URL' pnpm dev"
  exit 1
fi

echo "✅ API respondendo em $API_URL"
echo ""

# Preparar banco: criar demo ativo e usuário real
echo "1. Preparando banco de teste (demo ativo + usuário real)..."
DATABASE_URL="$DB_URL" node - <<'EOFNODE'
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

(async () => {
  await prisma.$executeRawUnsafe('DELETE FROM "OrdemServico"');
  await prisma.$executeRawUnsafe('DELETE FROM "Colaborador"');
  await prisma.$executeRawUnsafe('DELETE FROM "UsuarioEstabelecimento"');
  await prisma.$executeRawUnsafe('DELETE FROM "Usuario"');
  await prisma.$executeRawUnsafe('DELETE FROM "Equipamento"');
  await prisma.$executeRawUnsafe('DELETE FROM "Estabelecimento"');

  const estab = await prisma.estabelecimento.create({
    data: { id: "estab_test", nome: "Hospital Teste" },
  });

  // Demo ativo
  const demoHash = await bcrypt.hash("DemoPass123", 10);
  const demo = await prisma.usuario.create({
    data: { email: "tecnico@aion.local", nome: "Técnico Demo", senhaHash: demoHash, ativo: true },
  });
  await prisma.usuarioEstabelecimento.create({
    data: { usuarioId: demo.id, estabelecimentoId: estab.id, perfil: "TECNICO" },
  });

  // Usuário real
  const realHash = await bcrypt.hash("RealPass456", 10);
  const real = await prisma.usuario.create({
    data: { email: "bsnaldi@hrtc.faepa.br", nome: "Bruno Snaldi", senhaHash: realHash, ativo: true },
  });
  await prisma.usuarioEstabelecimento.create({
    data: { usuarioId: real.id, estabelecimentoId: estab.id, perfil: "ENGENHEIRO" },
  });

  console.log("   ✓ Demo: tecnico@aion.local (ativo=true)");
  console.log("   ✓ Real: bsnaldi@hrtc.faepa.br (ativo=true)");
  await prisma.$disconnect();
})();
EOFNODE
echo ""

# a) Emitir token do demo ainda ativo
echo "2. Login demo ativo (antes da desativação):"
DEMO_LOGIN=$(curl -sf -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"tecnico@aion.local","senha":"DemoPass123"}')

DEMO_TOKEN=$(echo "$DEMO_LOGIN" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
DEMO_STATUS_BEFORE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"tecnico@aion.local","senha":"DemoPass123"}')

echo "   Status: $DEMO_STATUS_BEFORE"
echo "   Token: ${DEMO_TOKEN:0:50}..."
echo ""

if [ "$DEMO_STATUS_BEFORE" != "200" ]; then
  echo "❌ Login do demo falhou antes da desativação"
  exit 1
fi

# b) Rodar boot de produção (desativa demos)
echo "3. Boot produção (NODE_ENV=production, sem SEED_DEMO_USERS):"
cd "$(dirname "$0")/.."
DATABASE_URL="$DB_URL" NODE_ENV=production node scripts/maybe-seed.mjs | grep '\[aion\]'
echo ""

# c) Login do demo desativado → 401
echo "4. Login demo desativado (após boot produção):"
DEMO_STATUS_AFTER=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"tecnico@aion.local","senha":"DemoPass123"}')

echo "   Status: $DEMO_STATUS_AFTER"

if [ "$DEMO_STATUS_AFTER" != "401" ]; then
  echo "❌ FALHA: Esperado 401, obteve $DEMO_STATUS_AFTER"
  exit 1
fi
echo "   ✅ 401 Unauthorized (demo desativado)"
echo ""

# d) Token pré-emitido chamando rota protegida → 401
echo "5. Token pré-emitido do demo em rota protegida:"
PROTECTED_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/api/auth/impersonation-targets" \
  -H "Authorization: Bearer $DEMO_TOKEN")

echo "   Rota: GET /api/auth/impersonation-targets"
echo "   Status: $PROTECTED_STATUS"

if [ "$PROTECTED_STATUS" != "401" ]; then
  echo "❌ FALHA: Token pré-emitido deveria retornar 401, obteve $PROTECTED_STATUS"
  exit 1
fi
echo "   ✅ 401 Unauthorized (token de usuário inativo rejeitado)"
echo ""

# e) Usuário real ativo → 200
echo "6. Usuário real ativo (login + rota protegida):"
REAL_LOGIN=$(curl -sf -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"bsnaldi@hrtc.faepa.br","senha":"RealPass456"}')

REAL_TOKEN=$(echo "$REAL_LOGIN" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
REAL_LOGIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"bsnaldi@hrtc.faepa.br","senha":"RealPass456"}')

echo "   Login status: $REAL_LOGIN_STATUS"

if [ "$REAL_LOGIN_STATUS" != "200" ]; then
  echo "❌ FALHA: Login do usuário real falhou"
  exit 1
fi

REAL_PROTECTED_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/api/auth/impersonation-targets" \
  -H "Authorization: Bearer $REAL_TOKEN")

echo "   Rota protegida status: $REAL_PROTECTED_STATUS"

if [ "$REAL_PROTECTED_STATUS" != "200" ]; then
  echo "❌ FALHA: Rota protegida do usuário real falhou"
  exit 1
fi
echo "   ✅ 200 OK (usuário real ativo funciona normalmente)"
echo ""

echo "=== ✅ EVIDÊNCIA HTTP PASSED ==="
echo "✅ Demo ativo: login 200 + token válido"
echo "✅ Após desativação: demo login 401"
echo "✅ Token pré-emitido: rota protegida 401 (não 500)"
echo "✅ Usuário real: login 200 + rota protegida 200"
