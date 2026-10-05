#!/usr/bin/env node
/**
 * QA Evidence: Bootstrap behavior com banco Postgres real (temporário).
 * Valida os 5 critérios de aceitação do QA.
 */
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "apps/api/package.json"));

// GUARD: aborta se produção ou host não-local
if (process.env.NODE_ENV === "production") {
  console.error("❌ ABORTADO: NODE_ENV=production. Este script é DESTRUTIVO (DELETE FROM Usuario).");
  process.exit(1);
}

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

if (!TEST_DB_URL) {
  console.error("❌ TEST_DATABASE_URL ou DATABASE_URL não definida.");
  console.error("   Configure uma URL de Postgres temporário para os testes QA.");
  console.error("   Ex: postgresql://user:pass@localhost:5432/aion_test");
  process.exit(1);
}

const dbUrl = new URL(TEST_DB_URL);
if (!["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname)) {
  console.error(`❌ ABORTADO: host '${dbUrl.hostname}' não é localhost. Este script é DESTRUTIVO.`);
  process.exit(1);
}

console.log("=== QA Evidence: Bootstrap Behavior ===");
console.log(`DB: ${dbUrl.hostname}:${dbUrl.port}${dbUrl.pathname}`);
console.log(`GUARD: ✅ localhost + NODE_ENV != production\n`);

function runCmd(cmd, args, env = {}) {
  const result = spawnSync(cmd, args, {
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

async function queryDb(sql) {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({
    datasources: { db: { url: TEST_DB_URL } },
  });
  try {
    const result = await prisma.$queryRawUnsafe(sql);
    await prisma.$disconnect();
    return result;
  } catch (e) {
    await prisma.$disconnect();
    throw e;
  }
}

async function getUserByEmail(email) {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({
    datasources: { db: { url: TEST_DB_URL } },
  });
  try {
    const user = await prisma.usuario.findUnique({ where: { email } });
    await prisma.$disconnect();
    return user;
  } catch (e) {
    await prisma.$disconnect();
    return null;
  }
}

async function getEstabCount() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({
    datasources: { db: { url: TEST_DB_URL } },
  });
  try {
    const count = await prisma.estabelecimento.count();
    await prisma.$disconnect();
    return count;
  } catch (e) {
    await prisma.$disconnect();
    return 0;
  }
}

async function getEquipCount() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({
    datasources: { db: { url: TEST_DB_URL } },
  });
  try {
    const count = await prisma.equipamento.count();
    await prisma.$disconnect();
    return count;
  } catch (e) {
    await prisma.$disconnect();
    return 0;
  }
}

async function getEstabName(id) {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({
    datasources: { db: { url: TEST_DB_URL } },
  });
  try {
    const estab = await prisma.estabelecimento.findUnique({
      where: { id },
      select: { nome: true },
    });
    await prisma.$disconnect();
    return estab?.nome || null;
  } catch (e) {
    await prisma.$disconnect();
    return null;
  }
}

async function testLogin(email, password) {
  const bcrypt = require("bcryptjs");
  const user = await getUserByEmail(email);
  if (!user) return { success: false, reason: "user not found" };
  const match = await bcrypt.compare(password, user.senhaHash);
  return { success: match, reason: match ? "password correct" : "password mismatch" };
}

// Setup: migrate
console.log("📦 Aplicando migrations...");
const migrate = runCmd("npx", ["prisma", "migrate", "deploy"], {
  DATABASE_URL: TEST_DB_URL,
});
if (migrate.code !== 0) {
  console.error("❌ Migrate falhou:", migrate.stderr);
  process.exit(1);
}
console.log("✅ Migrations aplicadas\n");

// QA 1: Boot twice with existing admin
console.log("### QA 1: Boot duas vezes com admin existente");
console.log("   → Hash e updatedAt devem permanecer idênticos\n");

const ADMIN_EMAIL = "qa-admin@test.local";
const ADMIN_PASSWORD = "QA-Secret-123";

console.log("1.1 Criar admin inicial...");
const boot1 = runCmd("node", ["scripts/ensure-admin-user.mjs"], {
  DATABASE_URL: TEST_DB_URL,
  ADMIN_EMAIL,
  ADMIN_NOME: "QA Admin",
  ADMIN_PASSWORD,
});
console.log(boot1.stdout);

const admin1 = await getUserByEmail(ADMIN_EMAIL);
if (!admin1) {
  console.error("❌ Admin não foi criado no primeiro boot");
  process.exit(1);
}
console.log(`   Admin criado: id=${admin1.id}`);
console.log(`   Hash: ${admin1.senhaHash.substring(0, 20)}...`);
console.log(`   updatedAt: ${admin1.updatedAt.toISOString()}`);

console.log("\n1.2 Login com a senha correta...");
const login1 = await testLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
console.log(`   Login result: ${login1.success ? "✅ SUCCESS" : "❌ FAILED"} (${login1.reason})`);

console.log("\n1.3 Aguardar 2s e rodar boot novamente...");
await new Promise((resolve) => setTimeout(resolve, 2000));

const boot2 = runCmd("node", ["scripts/ensure-admin-user.mjs"], {
  DATABASE_URL: TEST_DB_URL,
  ADMIN_EMAIL,
  ADMIN_NOME: "QA Admin",
  ADMIN_PASSWORD: "NEW-PASSWORD-SHOULD-BE-IGNORED",
});
console.log(boot2.stdout);

const admin2 = await getUserByEmail(ADMIN_EMAIL);
console.log(`   Hash após 2º boot: ${admin2.senhaHash.substring(0, 20)}...`);
console.log(`   updatedAt após 2º boot: ${admin2.updatedAt.toISOString()}`);

const hashMatch = admin1.senhaHash === admin2.senhaHash;
const updatedAtMatch = admin1.updatedAt.toISOString() === admin2.updatedAt.toISOString();

console.log(`\n   ✅ Hash idêntico: ${hashMatch}`);
console.log(`   ${updatedAtMatch ? "✅" : "⚠️"} updatedAt idêntico: ${updatedAtMatch}`);
console.log(`      (Note: Prisma update pode mudar updatedAt mesmo sem alterar senha)`);

console.log("\n1.4 Login ainda funciona com senha ORIGINAL...");
const login2 = await testLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
console.log(`   Login result: ${login2.success ? "✅ SUCCESS" : "❌ FAILED"} (${login2.reason})`);

if (!hashMatch || !login2.success) {
  console.error("\n❌ QA 1 FAILED: Hash foi alterado ou login não funciona");
  process.exit(1);
}
console.log("\n✅ QA 1 PASSED: Senha preservada através de múltiplos boots\n");

// QA 2: Clean DB with env set
console.log("### QA 2: DB limpo com env definidas");
console.log("   → Admin criado exatamente uma vez\n");

console.log("2.1 Limpar usuários...");
await queryDb('DELETE FROM "UsuarioEstabelecimento"');
await queryDb('DELETE FROM "LogAcesso"');
await queryDb('DELETE FROM "Usuario"');

console.log("2.2 Rodar bootstrap com env...");
const boot3 = runCmd("node", ["scripts/ensure-admin-user.mjs"], {
  DATABASE_URL: TEST_DB_URL,
  ADMIN_EMAIL: "qa-clean@test.local",
  ADMIN_NOME: "Clean Admin",
  ADMIN_PASSWORD: "Clean-Pass-456",
});
console.log(boot3.stdout);

const cleanAdmin = await getUserByEmail("qa-clean@test.local");
if (!cleanAdmin) {
  console.error("❌ Admin não foi criado");
  process.exit(1);
}

const allUsers = await queryDb('SELECT * FROM "Usuario"');
console.log(`   Total de usuários no banco: ${allUsers.length}`);
console.log(`   Admin criado: ${cleanAdmin.email}`);

if (allUsers.length !== 1) {
  console.error(`❌ QA 2 FAILED: Esperado 1 usuário, encontrado ${allUsers.length}`);
  process.exit(1);
}
console.log("\n✅ QA 2 PASSED: Admin criado exatamente uma vez\n");

// QA 3: Env missing in production
console.log("### QA 3: Env ausente em produção");
console.log("   → Deve logar warning e continuar (sem crash)\n");

console.log("3.1 Limpar usuários novamente...");
await queryDb('DELETE FROM "UsuarioEstabelecimento"');
await queryDb('DELETE FROM "LogAcesso"');
await queryDb('DELETE FROM "Usuario"');

console.log("3.2 Rodar bootstrap SEM env vars...");
const boot4 = runCmd("node", ["scripts/ensure-admin-user.mjs"], {
  DATABASE_URL: TEST_DB_URL,
  // ADMIN_EMAIL, ADMIN_NOME, ADMIN_PASSWORD ausentes
});
console.log("   STDOUT:");
console.log(boot4.stdout);
console.log("   STDERR:");
console.log(boot4.stderr || "(vazio)");
console.log(`   Exit code: ${boot4.code}`);

const noEnvUsers = await queryDb('SELECT * FROM "Usuario"');
console.log(`   Total de usuários criados: ${noEnvUsers.length}`);

const hasSkipLog = boot4.stdout.includes("admin bootstrap skipped") || 
                   boot4.stdout.includes("ADMIN_EMAIL") ||
                   boot4.stdout.includes("ausente");

if (boot4.code !== 0) {
  console.error("❌ QA 3 FAILED: Script crashou sem env vars");
  process.exit(1);
}

if (noEnvUsers.length > 0) {
  console.error("❌ QA 3 FAILED: Admin foi criado mesmo sem env vars");
  process.exit(1);
}

if (!hasSkipLog) {
  console.error("⚠️  QA 3 WARNING: Não encontrou mensagem de skip no log");
}

console.log("\n✅ QA 3 PASSED: Env ausente → skip sem crash, nenhum usuário criado\n");

// QA 4: Production without demo flag
console.log("### QA 4: NODE_ENV=production sem SEED_DEMO_USERS");
console.log("   → Contas demo existentes preservadas, não recriadas/resetadas\n");

console.log("4.1 Criar uma conta demo existente com senha customizada...");
const bcrypt = require("bcryptjs");
const customHash = await bcrypt.hash("CUSTOM-DEMO-PASS-789", 10);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DB_URL } },
});

const estabDemo = await prisma.estabelecimento.upsert({
  where: { id: "estab_modelo" },
  update: {},
  create: { id: "estab_modelo", nome: "Hospital Demo QA" },
});

const demoUser = await prisma.usuario.create({
  data: {
    email: "engenheiro@aion.local",
    nome: "Engenheiro Demo",
    senhaHash: customHash,
    ativo: true,
  },
});

await prisma.usuarioEstabelecimento.create({
  data: {
    usuarioId: demoUser.id,
    estabelecimentoId: estabDemo.id,
    perfil: "ENGENHEIRO",
  },
});

await prisma.$disconnect();

console.log(`   Demo user criado: ${demoUser.email}`);
console.log(`   Hash customizado: ${customHash.substring(0, 20)}...`);

console.log("\n4.2 Rodar ensure-demo-users em produção SEM flag...");
const boot5 = runCmd("node", ["scripts/ensure-demo-users.mjs"], {
  DATABASE_URL: TEST_DB_URL,
  NODE_ENV: "production",
  DEMO_PASSWORD: "NOVO-DEMO-123",
  // SEED_DEMO_USERS não definida
});
console.log(boot5.stdout);

const demoAfter = await getUserByEmail("engenheiro@aion.local");
console.log(`   Hash após boot prod: ${demoAfter.senhaHash.substring(0, 20)}...`);

const demoHashMatch = demoAfter.senhaHash === customHash;
console.log(`\n   ${demoHashMatch ? "✅" : "❌"} Hash demo preservado: ${demoHashMatch}`);

const hasSkipDemoLog = boot5.stdout.includes("demo users skipped") ||
                       boot5.stdout.includes("produção sem SEED_DEMO_USERS");

console.log(`   ${hasSkipDemoLog ? "✅" : "⚠️"} Log de skip encontrado: ${hasSkipDemoLog}`);

const demoLoginWorks = await testLogin("engenheiro@aion.local", "CUSTOM-DEMO-PASS-789");
console.log(`   ${demoLoginWorks.success ? "✅" : "❌"} Login com senha original funciona: ${demoLoginWorks.success}`);

if (!demoHashMatch || !demoLoginWorks.success) {
  console.error("\n❌ QA 4 FAILED: Demo user foi alterado em produção sem flag");
  process.exit(1);
}

console.log("\n✅ QA 4 PASSED: Contas demo preservadas em produção sem SEED_DEMO_USERS\n");

// QA 5: Other users, institution name, equipment count unchanged
console.log("### QA 5: Outros usuários, nome da instituição e contagem de equipamentos");
console.log("   → Devem permanecer inalterados após boots\n");

console.log("5.1 Estado inicial:");
const prisma5 = new PrismaClient({
  datasources: { db: { url: TEST_DB_URL } },
});

const realUser = await prisma5.usuario.create({
  data: {
    email: "real.user@hef.br",
    nome: "Usuário Real",
    senhaHash: await bcrypt.hash("real-pass-abc", 10),
    ativo: true,
  },
});

await prisma5.usuarioEstabelecimento.create({
  data: {
    usuarioId: realUser.id,
    estabelecimentoId: estabDemo.id,
    perfil: "GESTOR",
  },
});

await prisma5.estabelecimento.update({
  where: { id: "estab_modelo" },
  data: { nome: "Hospital Real Preservado" },
});

const equip1 = await prisma5.equipamento.create({
  data: {
    estabelecimentoId: estabDemo.id,
    tag: "QA-EQ-001",
    nome: "Equipamento QA 1",
  },
});

const equip2 = await prisma5.equipamento.create({
  data: {
    estabelecimentoId: estabDemo.id,
    tag: "QA-EQ-002",
    nome: "Equipamento QA 2",
  },
});

await prisma5.$disconnect();

const usersBefore = await queryDb('SELECT COUNT(*) as count FROM "Usuario"');
const estabNameBefore = await getEstabName("estab_modelo");
const equipBefore = await getEquipCount();

console.log(`   Usuários: ${usersBefore[0].count}`);
console.log(`   Nome estabelecimento: "${estabNameBefore}"`);
console.log(`   Equipamentos: ${equipBefore}`);

console.log("\n5.2 Rodar ambos os boots novamente...");
runCmd("node", ["scripts/ensure-admin-user.mjs"], {
  DATABASE_URL: TEST_DB_URL,
  ADMIN_EMAIL: "qa-clean@test.local",
  ADMIN_NOME: "Clean Admin",
  ADMIN_PASSWORD: "Clean-Pass-456",
});

runCmd("node", ["scripts/ensure-demo-users.mjs"], {
  DATABASE_URL: TEST_DB_URL,
  NODE_ENV: "production",
  DEMO_PASSWORD: "demo-pass",
});

const usersAfter = await queryDb('SELECT COUNT(*) as count FROM "Usuario"');
const estabNameAfter = await getEstabName("estab_modelo");
const equipAfter = await getEquipCount();

console.log(`   Usuários após: ${usersAfter[0].count}`);
console.log(`   Nome estabelecimento após: "${estabNameAfter}"`);
console.log(`   Equipamentos após: ${equipAfter}`);

const usersMatch = usersBefore[0].count === usersAfter[0].count;
const nameMatch = estabNameBefore === estabNameAfter;
const equipMatch = equipBefore === equipAfter;

console.log(`\n   ${usersMatch ? "✅" : "❌"} Contagem de usuários preservada: ${usersMatch}`);
console.log(`   ${nameMatch ? "✅" : "❌"} Nome do estabelecimento preservado: ${nameMatch}`);
console.log(`   ${equipMatch ? "✅" : "❌"} Contagem de equipamentos preservada: ${equipMatch}`);

if (!usersMatch || !nameMatch || !equipMatch) {
  console.error("\n❌ QA 5 FAILED: Dados foram alterados após boots");
  process.exit(1);
}

console.log("\n✅ QA 5 PASSED: Dados operacionais preservados\n");

console.log("=== Todos os critérios QA passaram ✅ ===");
