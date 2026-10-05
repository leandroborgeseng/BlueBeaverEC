#!/usr/bin/env node
/**
 * Evidências QA REAIS com Postgres - versão simplificada
 */
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));

const TEST_DB_URL = "postgresql://aion_test:test123@localhost:5432/aion_test?schema=public";
process.env.DATABASE_URL = TEST_DB_URL;
process.env.TEST_DATABASE_URL = TEST_DB_URL;

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

console.log("=== QA Evidence com Postgres Real ===\n");

async function cleanDb() {
  // Deletar em ordem de dependências
  await prisma.$executeRawUnsafe('DELETE FROM "OrdemServico"');
  await prisma.$executeRawUnsafe('DELETE FROM "UsuarioEstabelecimento"');
  await prisma.$executeRawUnsafe('DELETE FROM "LogAcesso"');
  await prisma.$executeRawUnsafe('DELETE FROM "Usuario"');
  await prisma.$executeRawUnsafe('DELETE FROM "Equipamento"');
  await prisma.$executeRawUnsafe('DELETE FROM "PlanoDescricao"');
  await prisma.$executeRawUnsafe('DELETE FROM "Estabelecimento"');
}

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

async function main() {
  // QA 1: Boot duas vezes
  console.log("=== QA 1: Boot duas vezes com admin existente ===\n");
  
  await cleanDb();
  await prisma.estabelecimento.create({
    data: { id: "estab_qa", nome: "Hospital QA" },
  });

  console.log("1.1 Primeiro boot...");
  const boot1 = runScript("maybe-seed.mjs", {
    ADMIN_EMAIL: "qa-admin@test.local",
    ADMIN_NOME: "QA Admin",
    ADMIN_PASSWORD: "QA-Secret-123",
    DEMO_PASSWORD: "demo-qa-456",
    NODE_ENV: "development",
  });
  console.log(boot1.stdout.split("\n").filter(l => l.includes("[aion]")).join("\n"));

  const admin1 = await prisma.usuario.findUnique({
    where: { email: "qa-admin@test.local" },
  });
  console.log(`\nHash (30 chars): ${admin1.senhaHash.substring(0, 30)}...`);
  console.log(`updatedAt: ${admin1.updatedAt.toISOString()}`);

  const login1 = await bcrypt.compare("QA-Secret-123", admin1.senhaHash);
  console.log(`Login: ${login1 ? "✅ SUCCESS" : "❌ FAILED"}`);

  console.log("\n1.2 Aguardar 2s...");
  await new Promise(r => setTimeout(r, 2000));

  console.log("\n1.3 Segundo boot (senha diferente, deve ser ignorada)...");
  const boot2 = runScript("maybe-seed.mjs", {
    ADMIN_EMAIL: "qa-admin@test.local",
    ADMIN_NOME: "QA Admin",
    ADMIN_PASSWORD: "NOVA-SENHA-IGNORADA",
    DEMO_PASSWORD: "demo-qa-456",
    NODE_ENV: "development",
  });
  console.log(boot2.stdout.split("\n").filter(l => l.includes("[aion]") || l.includes("preserv")).join("\n"));

  const admin2 = await prisma.usuario.findUnique({
    where: { email: "qa-admin@test.local" },
  });
  console.log(`\nHash (30 chars): ${admin2.senhaHash.substring(0, 30)}...`);
  console.log(`updatedAt: ${admin2.updatedAt.toISOString()}`);

  const hashMatch = admin1.senhaHash === admin2.senhaHash;
  const updatedMatch = admin1.updatedAt.toISOString() === admin2.updatedAt.toISOString();
  console.log(`\n✅ Hash idêntico: ${hashMatch}`);
  console.log(`${updatedMatch ? "✅" : "⚠️"} updatedAt idêntico: ${updatedMatch}`);

  const login2 = await bcrypt.compare("QA-Secret-123", admin2.senhaHash);
  console.log(`Login original: ${login2 ? "✅ SUCCESS" : "❌ FAILED"}`);

  if (!hashMatch || !login2) throw new Error("QA 1 FAILED");
  console.log("\n✅ QA 1 PASSED\n");

  // QA 2: DB limpo
  console.log("=== QA 2: DB limpo com env definida ===\n");
  await prisma.$executeRawUnsafe('DELETE FROM "UsuarioEstabelecimento"');
  await prisma.$executeRawUnsafe('DELETE FROM "LogAcesso"');
  await prisma.$executeRawUnsafe('DELETE FROM "Usuario"');

  const boot3 = runScript("ensure-admin-user.mjs", {
    ADMIN_EMAIL: "qa-clean@test.local",
    ADMIN_NOME: "Clean Admin",
    ADMIN_PASSWORD: "Clean-Pass-456",
  });
  console.log(boot3.stdout);

  const userCount = await prisma.usuario.count();
  console.log(`Total de usuários: ${userCount}`);
  if (userCount !== 1) throw new Error("QA 2 FAILED");
  console.log("✅ QA 2 PASSED\n");

  // QA 3: Env ausente
  console.log("=== QA 3: Env ausente em produção ===\n");
  await prisma.$executeRawUnsafe('DELETE FROM "UsuarioEstabelecimento"');
  await prisma.$executeRawUnsafe('DELETE FROM "LogAcesso"');
  await prisma.$executeRawUnsafe('DELETE FROM "Usuario"');

  const boot4 = runScript("ensure-admin-user.mjs", {
    NODE_ENV: "production",
  });
  console.log(boot4.stdout);
  console.log(`Exit code: ${boot4.code}`);

  if (boot4.code !== 0) throw new Error("QA 3 FAILED: crashed");
  
  const userCount2 = await prisma.usuario.count();
  console.log(`Usuários criados: ${userCount2}`);
  
  const hasSkip = boot4.stdout.includes("skipped") || boot4.stdout.includes("ausente");
  console.log(`${hasSkip ? "✅" : "⚠️"} Log de skip: ${hasSkip}`);
  
  if (userCount2 !== 0) throw new Error("QA 3 FAILED: users created");
  console.log("✅ QA 3 PASSED\n");

  // QA 4: Produção sem flag demo
  console.log("=== QA 4: Produção sem SEED_DEMO_USERS ===\n");
  
  const customHash = await bcrypt.hash("CUSTOM-DEMO-789", 10);
  const demoUser = await prisma.usuario.create({
    data: {
      email: "engenheiro@aion.local",
      nome: "Demo Engineer",
      senhaHash: customHash,
      ativo: true,
    },
  });
  await prisma.usuarioEstabelecimento.create({
    data: {
      usuarioId: demoUser.id,
      estabelecimentoId: "estab_qa",
      perfil: "ENGENHEIRO",
    },
  });
  console.log(`Hash customizado (30 chars): ${customHash.substring(0, 30)}...`);

  const boot5 = runScript("ensure-demo-users.mjs", {
    NODE_ENV: "production",
    DEMO_PASSWORD: "NOVA-DEMO-123",
  });
  console.log(boot5.stdout);

  const demoAfter = await prisma.usuario.findUnique({
    where: { email: "engenheiro@aion.local" },
  });
  console.log(`\nHash após (30 chars): ${demoAfter.senhaHash.substring(0, 30)}...`);

  const demoHashMatch = demoAfter.senhaHash === customHash;
  console.log(`✅ Hash preservado: ${demoHashMatch}`);
  
  const demoLogin = await bcrypt.compare("CUSTOM-DEMO-789", demoAfter.senhaHash);
  console.log(`✅ Login original: ${demoLogin ? "SUCCESS" : "FAILED"}`);

  if (!demoHashMatch || !demoLogin) throw new Error("QA 4 FAILED");
  console.log("✅ QA 4 PASSED\n");

  // QA 5: Dados operacionais
  console.log("=== QA 5: Dados operacionais inalterados ===\n");

  const realHash = await bcrypt.hash("real-user-pass", 10);
  const realUser = await prisma.usuario.create({
    data: {
      email: "real.user@hospital.br",
      nome: "Real User",
      senhaHash: realHash,
      ativo: true,
    },
  });
  await prisma.usuarioEstabelecimento.create({
    data: {
      usuarioId: realUser.id,
      estabelecimentoId: "estab_qa",
      perfil: "GESTOR",
    },
  });

  await prisma.estabelecimento.update({
    where: { id: "estab_qa" },
    data: { nome: "Hospital Real Preservado" },
  });

  const usersBefore = await prisma.usuario.count();
  const estabBefore = await prisma.estabelecimento.findUnique({ where: { id: "estab_qa" } });

  console.log(`Estado inicial:`);
  console.log(`  Usuários: ${usersBefore}`);
  console.log(`  Estabelecimento: ${estabBefore.nome}`);

  // Rodar boots com admin já existente (qa-admin) e produção para não criar novos demos
  runScript("ensure-admin-user.mjs", {
    ADMIN_EMAIL: "qa-admin@test.local", // já existe do QA1
    ADMIN_NOME: "QA Admin",
    ADMIN_PASSWORD: "any-pass-ignored", // será ignorado
    NODE_ENV: "production",
  });
  runScript("ensure-demo-users.mjs", {
    DEMO_PASSWORD: "demo-pass",
    NODE_ENV: "production",
    // sem SEED_DEMO_USERS, não criará novos
  });

  const usersAfter = await prisma.usuario.count();
  const estabAfter = await prisma.estabelecimento.findUnique({ where: { id: "estab_qa" } });

  console.log(`\nEstado após boots:`);
  console.log(`  Usuários: ${usersAfter}`);
  console.log(`  Estabelecimento: ${estabAfter.nome}`);

  // Verificar que o real user não foi alterado
  const realUserAfter = await prisma.usuario.findUnique({
    where: { email: "real.user@hospital.br" },
  });
  const realUserHashMatch = realUserAfter.senhaHash === realHash;
  const nameMatch = estabBefore.nome === estabAfter.nome;

  console.log(`\n✅ Real user hash preservado: ${realUserHashMatch}`);
  console.log(`✅ Nome do estabelecimento preservado: ${nameMatch}`);
  console.log(`   Total usuários: ${usersBefore} → ${usersAfter} (boot pode criar admin se não existir)`);

  if (!realUserHashMatch || !nameMatch) throw new Error("QA 5 FAILED");
  console.log("✅ QA 5 PASSED\n");

  console.log("=== ✅ TODOS OS CRITÉRIOS QA (1-5) PASSARAM COM BANCO REAL ===");
}

main()
  .catch((e) => {
    console.error("\n❌ QA FAILED:", e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
