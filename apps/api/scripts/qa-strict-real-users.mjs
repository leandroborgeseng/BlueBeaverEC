#!/usr/bin/env node
/**
 * Evidência estrita QA/Analyst: usuários reais NUNCA são modificados.
 * Dumpa todos os usuários não-demo ANTES e DEPOIS de 2 boots,
 * mostra diff vazio (nenhuma alteração).
 */
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));

const TEST_DB_URL = "postgresql://aion_test:test123@localhost:5432/aion_test?schema=public";

// GUARD: aborta se não for ambiente de teste local
if (process.env.NODE_ENV === "production") {
  console.error("❌ ABORTADO: NODE_ENV=production detectado. Este script é DESTRUTIVO e só pode rodar em teste local.");
  process.exit(1);
}

const url = new URL(TEST_DB_URL);
if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
  console.error(`❌ ABORTADO: host '${url.hostname}' não é localhost. Este script é DESTRUTIVO.`);
  process.exit(1);
}

process.env.DATABASE_URL = TEST_DB_URL;

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

console.log("=== Evidência Estrita: Usuários Reais Inalterados ===");
console.log(`    DB: ${url.hostname}:${url.port}${url.pathname}`);
console.log(`    GUARD: ✅ localhost + NODE_ENV != production\n`);

function runScript(script, env = {}) {
  const result = spawnSync("node", [path.join(root, "scripts", script)], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    code: result.status ?? 1,
  };
}

async function dumpNonDemoUsers(label) {
  const users = await prisma.usuario.findMany({
    where: {
      AND: [
        { email: { not: { endsWith: "@aion.local" } } },
        { email: { not: { endsWith: "@nexo.local" } } },
      ],
    },
    include: {
      estabelecimentos: {
        include: {
          estabelecimento: { select: { id: true, nome: true } },
        },
        orderBy: { estabelecimentoId: "asc" },
      },
      colaborador: {
        select: {
          id: true,
          estabelecimentoId: true,
          matricula: true,
          nome: true,
          cargo: true,
          ativo: true,
        },
      },
    },
    orderBy: { email: "asc" },
  });

  const dump = users.map((u) => ({
    email: u.email,
    nome: u.nome,
    senhaHash: u.senhaHash,
    ativo: u.ativo,
    updatedAt: u.updatedAt.toISOString(),
    createdAt: u.createdAt.toISOString(),
    estabelecimentos: u.estabelecimentos.map((e) => ({
      estabelecimentoId: e.estabelecimentoId,
      estabelecimentoNome: e.estabelecimento.nome,
      perfil: e.perfil,
      setorIds: e.setorIds,
    })),
    colaborador: u.colaborador
      ? {
          id: u.colaborador.id,
          estabelecimentoId: u.colaborador.estabelecimentoId,
          matricula: u.colaborador.matricula,
          nome: u.colaborador.nome,
          cargo: u.colaborador.cargo,
          ativo: u.colaborador.ativo,
        }
      : null,
  }));

  const filename = `/tmp/${label}.json`;
  writeFileSync(filename, JSON.stringify(dump, null, 2));
  console.log(`\n[dump] ${label}: ${users.length} usuários não-demo salvos em ${filename}`);
  console.log(`   Inclui: email, nome, senhaHash, ativo, updatedAt, estabelecimentos[], colaborador`);
  
  return { dump, count: users.length };
}

async function main() {
  // Limpar e preparar banco
  console.log("1. Limpando banco de teste...\n");
  await prisma.$executeRawUnsafe('DELETE FROM "OrdemServico"');
  await prisma.$executeRawUnsafe('DELETE FROM "Colaborador"');
  await prisma.$executeRawUnsafe('DELETE FROM "UsuarioEstabelecimento"');
  await prisma.$executeRawUnsafe('DELETE FROM "LogAcesso"');
  await prisma.$executeRawUnsafe('DELETE FROM "Usuario"');
  await prisma.$executeRawUnsafe('DELETE FROM "Equipamento"');
  await prisma.$executeRawUnsafe('DELETE FROM "PlanoDescricao"');
  await prisma.$executeRawUnsafe('DELETE FROM "Estabelecimento"');

  console.log("2. Criando estabelecimento...\n");
  const estab = await prisma.estabelecimento.create({
    data: { id: "estab_hef", nome: "Hospital Estadual de Formosa" },
  });

  const setor = await prisma.setor.create({
    data: { estabelecimentoId: estab.id, nome: "UTI" },
  });

  console.log("3. Criando usuários REAIS (não-demo)...\n");
  
  // Admin real
  const adminHash = await bcrypt.hash("AdminRealPass2024", 10);
  const adminReal = await prisma.usuario.create({
    data: {
      email: "leandro.borges@aion.eng.br",
      nome: "Leandro Borges",
      senhaHash: adminHash,
      ativo: true,
    },
  });
  await prisma.usuarioEstabelecimento.create({
    data: {
      usuarioId: adminReal.id,
      estabelecimentoId: estab.id,
      perfil: "ADMIN",
    },
  });
  console.log(`   ✓ Admin real: ${adminReal.email}`);

  // Engenheiro real
  const engHash = await bcrypt.hash("Eng2024Secure", 10);
  const engReal = await prisma.usuario.create({
    data: {
      email: "bsnaldi@hrtc.faepa.br",
      nome: "Bruno Snaldi",
      senhaHash: engHash,
      ativo: true,
    },
  });
  await prisma.usuarioEstabelecimento.create({
    data: {
      usuarioId: engReal.id,
      estabelecimentoId: estab.id,
      perfil: "ENGENHEIRO",
    },
  });
  console.log(`   ✓ Engenheiro real: ${engReal.email}`);

  // Gestor real com setores
  const gestorHash = await bcrypt.hash("Gestor2024Safe", 10);
  const gestorReal = await prisma.usuario.create({
    data: {
      email: "rmjuvencio@hrtc.faepa.br",
      nome: "Rodrigo Juvencio",
      senhaHash: gestorHash,
      ativo: true,
    },
  });
  await prisma.usuarioEstabelecimento.create({
    data: {
      usuarioId: gestorReal.id,
      estabelecimentoId: estab.id,
      perfil: "GESTOR",
      setorIds: [setor.id],
    },
  });
  console.log(`   ✓ Gestor real: ${gestorReal.email}`);

  // Colaboradores operacionais
  await prisma.colaborador.create({
    data: {
      estabelecimentoId: estab.id,
      usuarioId: engReal.id,
      matricula: "ENG-001",
      nome: "Bruno Snaldi",
      cargo: "Engenheiro Clínico",
      ativo: true,
    },
  });
  console.log(`   ✓ Colaborador engenheiro vinculado\n`);

  console.log("4. DUMP ANTES dos boots:");
  const before = await dumpNonDemoUsers("before");

  console.log("\n\n5. PRIMEIRO BOOT (maybe-seed com env de admin E demo)...\n");
  const boot1 = runScript("maybe-seed.mjs", {
    ADMIN_EMAIL: "leandro.borges@aion.eng.br",
    ADMIN_NOME: "Leandro Borges",
    ADMIN_PASSWORD: "NewPasswordIgnored", // deve ser ignorado
    DEMO_PASSWORD: "DemoPass123",
    NODE_ENV: "development",
  });
  console.log(boot1.stdout.split("\n").filter(l => l.includes("[aion]")).join("\n"));

  console.log("\n6. SEGUNDO BOOT (repetir)...\n");
  const boot2 = runScript("maybe-seed.mjs", {
    ADMIN_EMAIL: "leandro.borges@aion.eng.br",
    ADMIN_NOME: "Leandro Borges ALTERADO", // deve ser ignorado
    ADMIN_PASSWORD: "AnotherPasswordIgnored",
    DEMO_PASSWORD: "DemoPass123",
    NODE_ENV: "development",
  });
  console.log(boot2.stdout.split("\n").filter(l => l.includes("[aion]")).join("\n"));

  console.log("\n\n7. DUMP DEPOIS dos 2 boots:");
  const after = await dumpNonDemoUsers("after");

  console.log("\n\n8. COMPARAÇÃO (deve ser VAZIO):\n");
  console.log("Comando: diff /tmp/before.json /tmp/after.json\n");

  const beforeStr = JSON.stringify(before.dump, null, 2);
  const afterStr = JSON.stringify(after.dump, null, 2);

  if (beforeStr === afterStr) {
    console.log("✅ DIFF VAZIO - Nenhuma alteração nos usuários reais!\n");
    console.log("Arquivos:");
    console.log("  /tmp/before.json");
    console.log("  /tmp/after.json");
    console.log("\nPara verificar manualmente:");
    console.log("  diff /tmp/before.json /tmp/after.json");
  } else {
    console.log("❌ DIFF NÃO VAZIO - Usuários reais foram alterados!");
    console.log("\nDiferenças encontradas:");
    
    // Mostrar diferenças detalhadas
    for (let i = 0; i < before.dump.length; i++) {
      const b = before.dump[i];
      const a = after.dump[i];
      
      if (JSON.stringify(b) !== JSON.stringify(a)) {
        console.log(`\n  Usuário: ${b.email}`);
        if (b.nome !== a.nome) console.log(`    nome: "${b.nome}" → "${a.nome}"`);
        if (b.senhaHash !== a.senhaHash) console.log(`    senhaHash: ALTERADO`);
        if (b.ativo !== a.ativo) console.log(`    ativo: ${b.ativo} → ${a.ativo}`);
        if (b.updatedAt !== a.updatedAt) console.log(`    updatedAt: ${b.updatedAt} → ${a.updatedAt}`);
      }
    }
    
    throw new Error("FALHA: Usuários reais foram modificados");
  }

  console.log("\n9. Verificar que demos foram criados (mas reais intactos):");
  const allUsers = await prisma.usuario.count();
  const demoUsers = await prisma.usuario.count({
    where: {
      OR: [
        { email: { endsWith: "@aion.local" } },
        { email: { endsWith: "@nexo.local" } },
      ],
    },
  });
  console.log(`   Total de usuários: ${allUsers}`);
  console.log(`   Usuários demo: ${demoUsers}`);
  console.log(`   Usuários reais: ${before.count} (inalterados)\n`);

  console.log("10. Teste de desativação em produção (NODE_ENV=production, sem SEED_DEMO_USERS):\n");
  const boot3 = runScript("maybe-seed.mjs", {
    NODE_ENV: "production",
    ADMIN_EMAIL: "leandro.borges@aion.eng.br",
    ADMIN_NOME: "Leandro Borges",
    ADMIN_PASSWORD: "IgnoredInProduction",
    // SEED_DEMO_USERS não definido → demos devem ser desativados
  });
  console.log(boot3.stdout.split("\n").filter(l => l.includes("[aion]")).join("\n"));

  const demosAtivos = await prisma.usuario.count({
    where: {
      OR: [
        { email: { endsWith: "@aion.local" } },
        { email: { endsWith: "@nexo.local" } },
      ],
      ativo: true,
    },
  });
  const demosInativos = await prisma.usuario.count({
    where: {
      OR: [
        { email: { endsWith: "@aion.local" } },
        { email: { endsWith: "@nexo.local" } },
      ],
      ativo: false,
    },
  });

  console.log(`\n   Demos ativos após boot produção: ${demosAtivos}`);
  console.log(`   Demos inativos após boot produção: ${demosInativos}`);

  if (demosAtivos > 0) {
    throw new Error(`❌ Demos ainda ativos em produção: ${demosAtivos}`);
  }
  console.log("   ✅ Todos os demos foram desativados em produção");

  console.log("\n11. Idempotência da desativação (segundo boot em produção):\n");
  const boot4 = runScript("maybe-seed.mjs", {
    NODE_ENV: "production",
    ADMIN_EMAIL: "leandro.borges@aion.eng.br",
    ADMIN_NOME: "Leandro Borges",
    ADMIN_PASSWORD: "IgnoredInProduction",
  });
  const boot4Output = boot4.stdout.split("\n").filter(l => l.includes("[aion]")).join("\n");
  console.log(boot4Output);

  if (!boot4Output.includes("0 conta(s)")) {
    throw new Error("❌ Segundo boot deveria desativar 0 contas (idempotência)");
  }
  console.log("   ✅ Segundo boot desativou 0 contas (idempotente)");

  console.log("\n12. DUMP FINAL dos usuários reais (após desativação de demos):");
  const afterDeactivation = await dumpNonDemoUsers("after-deactivation");

  console.log("\n13. COMPARAÇÃO FINAL (before vs after-deactivation):\n");
  const beforeStr2 = JSON.stringify(before.dump, null, 2);
  const afterDeactivationStr = JSON.stringify(afterDeactivation.dump, null, 2);

  if (beforeStr2 === afterDeactivationStr) {
    console.log("✅ DIFF VAZIO - Usuários reais inalterados após desativação de demos!\n");
  } else {
    console.log("❌ DIFF NÃO VAZIO após desativação!");
    throw new Error("FALHA: Usuários reais foram modificados durante desativação");
  }

  console.log("=== ✅ EVIDÊNCIA ESTRITA PASSED ===");
  console.log("✅ Usuários reais (admin + colaboradores) NUNCA foram modificados.");
  console.log("✅ Demos desativados em produção (ativo=false).");
  console.log("✅ Desativação é idempotente (0 no segundo boot).");
}

main()
  .catch((e) => {
    console.error("\n❌ EVIDÊNCIA FALHOU:", e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
