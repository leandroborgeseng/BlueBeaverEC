#!/bin/bash
# QA 6: Verificar que não há senhas hardcoded no código

echo "=== QA 6: Verificação de Credenciais Hardcoded ==="
echo ""

echo "### 6.1 Buscar literais de senha no diff (apenas remoções permitidas):"
# Busca por constantes de senha atribuídas a strings literais (adições)
# Excluindo scripts de demo/qa, comentários e objetos de config
PASS_ADDITIONS=$(git diff main..HEAD | grep "^+.*PASSWORD.*=.*['\"]" | grep -v process.env | grep -v "^+.*#" | grep -v "^+.*obrigatórias" | grep -v "^+.*opcional" | grep -v "console.log" | grep -v "^+export" | grep -v "^+if grep" | grep -v '",\s*$' | grep -v "demo-bootstrap-behavior\|qa-evidence\|run-real-qa" || true)
if [ -n "$PASS_ADDITIONS" ]; then
  echo "❌ FOUND adições com PASSWORD literal no diff (fora de demos/qa):"
  echo "$PASS_ADDITIONS"
  exit 1
else
  echo "✅ Nenhuma adição de PASSWORD literal no código de produção"
fi
echo ""

echo "### 6.2 Buscar bcrypt.hash com string literal em scripts de boot:"
if rg 'bcrypt\.hash\s*\(\s*["\x27][^"'\'']*["\x27]' --type-add 'code:*.{js,mjs}' -t code \
  apps/api/scripts/ensure-admin-user.mjs \
  apps/api/scripts/ensure-demo-users.mjs 2>/dev/null; then
  echo "❌ FOUND bcrypt.hash com senha literal em scripts de boot"
  exit 1
else
  echo "✅ Nenhum bcrypt.hash com senha literal nos scripts de boot"
fi
echo ""

echo "### 6.3 Buscar constantes PASSWORD com literais nos scripts de boot:"
if grep -E '(const|let|var)\s+(ADMIN_|DEMO_)?PASSWORD\s*=\s*["\x27]' \
  apps/api/scripts/ensure-admin-user.mjs \
  apps/api/scripts/ensure-demo-users.mjs \
  apps/api/scripts/maybe-seed.mjs 2>/dev/null; then
  echo "❌ FOUND constantes PASSWORD com literais"
  exit 1
else
  echo "✅ Todas as constantes PASSWORD vêm de process.env"
fi
echo ""

echo "### 6.4 Verificar seed.ts não tem fallback para senha literal:"
if grep -E '(DEMO_PASSWORD|ADMIN_PASSWORD).*\|\|.*["\x27][^"'\'']*["\x27]' apps/api/prisma/seed.ts 2>/dev/null; then
  echo "❌ FOUND fallback de senha literal no seed.ts"
  exit 1
else
  echo "✅ seed.ts não tem fallback para senha literal"
fi
echo ""

echo "### 6.5 Verificar seed.ts usa process.env:"
if grep "process.env.DEMO_PASSWORD" apps/api/prisma/seed.ts >/dev/null && \
   grep "process.env.ADMIN_PASSWORD" apps/api/prisma/seed.ts >/dev/null; then
  echo "✅ seed.ts usa process.env"
else
  echo "❌ seed.ts não está usando env vars"
  exit 1
fi
echo ""

echo "=== ✅ QA 6 PASSED: Nenhuma credencial hardcoded nos locais críticos ==="
