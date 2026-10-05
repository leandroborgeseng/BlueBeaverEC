#!/usr/bin/env node
/**
 * Evidencia final: 2 boots NODE_ENV=production sem ADMIN_/DEMO_PASSWORD
 * sobre banco com usuarios reais - diff vazio (usuarios + vinculos).
 */
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "apps/api/package.json"));

// GUARD: aborta se produção ou host não-local
if (process.env.NODE_ENV === "production") {
  console.error("❌ ABORTADO: NODE_ENV=production detectado. Este script é DESTRUTIVO.");
  process.exit(1);
}

const TEST_DB_URL = process.env.DATABASE_URL || "postgresql://aion_test:test123@localhost:5432/aion_test?schema=public";

const url = new URL(TEST_DB_URL);
if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
  console.error(`❌ ABORTADO: host '${url.hostname}' não é localhost. Este script é DESTRUTIVO.`);
  process.exit(1);
}

process.env.DATABASE_URL = TEST_DB_URL;

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

console.log("=== Evidência Final: 2 Boots Produção Sem Env Vars ===");
console.log(`DB: ${url.hostname}:${url.port}${url.pathname}`);
console.log(`GUARD: ✅ localhost + NODE_ENV != production\n`);

function runScript(script, env = {}) {
  const result = spawnSync("node", [path.join(root, "apps/api/scripts", script)], {
    cwd: root,
    env: { ...process.env, ...env, DATABASE_URL: TEST_DB_URL },
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
  console.log(`   [dump] ${label}: ${users.length} usuários não-demo → ${filename}`);
  
  return { dump, count: users.length };
}

async function main() {
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
  
  const adminHash = await bcrypt.hash("AdminRealSecure2024", 10);
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

  const engHash = await bcrypt.hash("EngSecure2024", 10);
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
  console.log(`   ✓ Engenheiro real: ${engReal.email} + colaborador`);

  await prisma.colaborador.create({
    data: {
      estabelecimentoId: estab.id,
      usuarioId: adminReal.id,
      matricula: "ADM-001",
      nome: "Leandro Borges",
      cargo: "Administrador",
      ativo: true,
    },
  });
  console.log(`   ✓ Admin colaborador criado\n`);

  console.log("4. DUMP ANTES dos boots:");
  const before = await dumpNonDemoUsers("final-before");

  console.log("\n\n5. PRIMEIRO BOOT (NODE_ENV=production, sem ADMIN_*/DEMO_PASSWORD):\n");
  const boot1 = runScript("maybe-seed.mjs", {
    NODE_ENV: "production",
    // ADMIN_EMAIL, ADMIN_NOME, ADMIN_PASSWORD NÃO definidos
    // DEMO_PASSWORD NÃO definido
    // SEED_DEMO_USERS NÃO definido (default: desligado em produção)
  });
  console.log(boot1.stdout.split("\n").filter(l => l.includes("[aion]") || l.includes("[seed]")).join("\n"));

  console.log("\n6. SEGUNDO BOOT (NODE_ENV=production, repetir):\n");
  const boot2 = runScript("maybe-seed.mjs", {
    NODE_ENV: "production",
  });
  console.log(boot2.stdout.split("\n").filter(l => l.includes("[aion]") || l.includes("[seed]")).join("\n"));

  console.log("\n\n7. DUMP DEPOIS dos 2 boots:");
  const after = await dumpNonDemoUsers("final-after");

  console.log("\n\n8. COMPARAÇÃO (deve ser VAZIO):\n");
  console.log("Comando: diff /tmp/final-before.json /tmp/final-after.json\n");

  const beforeStr = JSON.stringify(before.dump, null, 2);
  const afterStr = JSON.stringify(after.dump, null, 2);

  if (beforeStr === afterStr) {
    console.log("✅ DIFF VAZIO - Nenhuma alteração nos usuários reais!\n");
  } else {
    console.log("❌ DIFF NÃO VAZIO - Usuários reais foram alterados!\n");
    
    for (let i = 0; i < before.dump.length; i++) {
      const b = before.dump[i];
      const a = after.dump[i];
      
      if (JSON.stringify(b) !== JSON.stringify(a)) {
        console.log(`  Usuário: ${b.email}`);
        if (b.nome !== a.nome) console.log(`    nome: "${b.nome}" → "${a.nome}"`);
        if (b.senhaHash !== a.senhaHash) console.log(`    senhaHash: ALTERADO`);
        if (b.ativo !== a.ativo) console.log(`    ativo: ${b.ativo} → ${a.ativo}`);
        if (b.updatedAt !== a.updatedAt) console.log(`    updatedAt: ${b.updatedAt} → ${a.updatedAt}`);
      }
    }
    
    throw new Error("FALHA: Usuários reais foram modificados");
  }

  console.log("9. Verificar log dos boots (sem senhas):\n");
  const logBoot1 = boot1.stdout + boot1.stderr;
  const logBoot2 = boot2.stdout + boot2.stderr;
  
  const senhasNoLog = [
    /senha.*[:=].*[a-zA-Z0-9]{8}/i,
    /password.*[:=].*[a-zA-Z0-9]{8}/i,
    /AdminRealSecure/,
    /EngSecure/,
    /DemoPass/,
  ];
  
  let senhaEncontrada = false;
  for (const pattern of senhasNoLog) {
    if (pattern.test(logBoot1) || pattern.test(logBoot2)) {
      console.log(`   ❌ Senha encontrada no log: ${pattern}`);
      senhaEncontrada = true;
    }
  }
  
  if (!senhaEncontrada) {
    console.log("   ✅ Nenhuma senha encontrada nos logs dos boots");
  } else {
    throw new Error("FALHA: Senhas foram logadas");
  }

  console.log("\n=== ✅ EVIDÊNCIA FINAL PASSED ===");
  console.log("✅ 2 boots NODE_ENV=production sem env vars");
  console.log("✅ Usuários reais (admin + engenheiro) inalterados");
  console.log("✅ Vínculos e colaborador preservados");
  console.log("✅ Diff vazio");
  console.log("✅ Sem senhas nos logs");
}

main()
  .catch((e) => {
    console.error("\n❌ EVIDÊNCIA FALHOU:", e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
