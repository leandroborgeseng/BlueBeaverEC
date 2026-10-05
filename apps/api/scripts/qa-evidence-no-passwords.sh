#!/bin/bash
# QA 6: Verificar que não há senhas hardcoded no código

echo "=== QA 6: Verificação de Credenciais Hardcoded ==="
echo ""

echo "### 6.1 Buscar 'Lean777\$' no diff (senha antiga do admin - apenas remoções):"
ADDITIONS=$(git diff main..HEAD | grep "^+.*Lean777" | grep -v "^+.*A senha antiga" | grep -v "^+.*git history" || true)
if [ -n "$ADDITIONS" ]; then
  echo "❌ FOUND adições com Lean777\$ no diff:"
  echo "$ADDITIONS"
  exit 1
else
  echo "✅ Apenas remoções e documentação (nenhuma adição de código)"
fi
echo ""

echo "### 6.2 Buscar 'Lean777\$' na árvore atual:"
if rg -i "Lean777\\\$" --type-add 'code:*.{ts,js,mjs,tsx,jsx}' -t code -g '!*.md' 2>/dev/null | grep -v "^docs/"; then
  echo "❌ FOUND na árvore (fora de docs)"
  exit 1
else
  echo "✅ Não encontrada na árvore (apenas em docs como nota)"
fi
echo ""

echo "### 6.3 Buscar literais de senha demo no ensure-admin-user.mjs:"
if grep -E '(const|let|var).*(PASSWORD|SENHA).*=.*["\x27]' apps/api/scripts/ensure-admin-user.mjs | grep -v process.env; then
  echo "❌ FOUND senha literal"
  exit 1
else
  echo "✅ Nenhuma senha literal (apenas process.env)"
fi
echo ""

echo "### 6.4 Buscar literais de senha demo no ensure-demo-users.mjs:"
if grep -E '(const|let|var).*(PASSWORD|SENHA).*=.*["\x27]' apps/api/scripts/ensure-demo-users.mjs | grep -v process.env; then
  echo "❌ FOUND senha literal"
  exit 1
else
  echo "✅ Nenhuma senha literal (apenas process.env)"
fi
echo ""

echo "### 6.5 Buscar 'aion1234' ou 'nexo1234' em scripts de boot (exceto fallback no seed.ts):"
if rg -i "aion1234|nexo1234" \
  apps/api/scripts/ensure-admin-user.mjs \
  apps/api/scripts/ensure-demo-users.mjs \
  apps/api/scripts/maybe-seed.mjs 2>/dev/null; then
  echo "❌ FOUND senha literal em scripts de boot"
  exit 1
else
  echo "✅ Nenhuma senha literal nos scripts de boot"
fi
echo ""

echo "### 6.6 Verificar seed.ts (fallback de dev é permitido):"
if grep "process.env.DEMO_PASSWORD" apps/api/prisma/seed.ts >/dev/null && \
   grep "process.env.ADMIN_PASSWORD" apps/api/prisma/seed.ts >/dev/null; then
  echo "✅ seed.ts usa process.env (fallback OK para dev)"
else
  echo "❌ seed.ts não está usando env vars"
  exit 1
fi
echo ""

echo "### 6.7 Buscar bcrypt.hash com string literal (exceto seed.ts e testes):"
if rg 'bcrypt\.hash\s*\(\s*["\x27]' --type-add 'code:*.{ts,js,mjs}' -t code \
  -g '!prisma/seed.ts' \
  -g '!*.test.*' \
  -g '!qa-evidence-*' \
  apps/api/scripts/ 2>/dev/null; then
  echo "❌ FOUND bcrypt.hash com literal"
  exit 1
else
  echo "✅ Nenhum bcrypt.hash com senha literal em scripts de boot"
fi
echo ""

echo "=== ✅ QA 6 PASSED: Nenhuma credencial hardcoded nos locais críticos ==="
