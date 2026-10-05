import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  PERMISSAO_NIVEL,
  PERMISSOES_PADRAO,
  permissoesDoPerfil,
  type PerfilAcesso,
  type MapaPermissoes,
} from "@aion/shared";
import { PermissionsGuard, PERMISSAO_KEY, IS_PUBLIC_KEY } from "./permissions.guard";

// Controllers a serem varridos
import { AuthController } from "./auth.controller";
import { SessionController } from "../session/session.controller";
import { NavController } from "../nav/nav.controller";
import { DashboardController } from "../dashboard/dashboard.controller";
import { EquipamentosController } from "../equipamentos/equipamentos.controller";
import { OsController } from "../os/os.controller";
import { OsDominiosController } from "../os/os-dominios.controller";
import { EstoqueController } from "../estoque/estoque.controller";
import { LaudosController } from "../laudos/laudos.controller";
import { ProcedimentosController } from "../laudos/procedimentos.controller";
import { InstrumentosController } from "../laudos/instrumentos.controller";
import { CertificadosController } from "../laudos/certificados.controller";
import { FichaVidaController } from "../laudos/ficha-vida.controller";
import { ContratosController } from "../contratos/contratos.controller";
import { AtendimentoExternoController } from "../atendimento-externo/atendimento-externo.controller";
import { PessoasController } from "../pessoas/pessoas.controller";
import { CadastrosController } from "../cadastros/cadastros.controller";
import { AuditoriasController } from "../auditorias/auditorias.controller";
import { EstrategicoController } from "../estrategico/estrategico.controller";
import { IndicadoresController } from "../indicadores/indicadores.controller";
import { FinanceiroController } from "../financeiro/financeiro.controller";
import { GestaoController } from "../gestao/gestao.controller";
import { RelatoriosController } from "../relatorios/relatorios.controller";
import { OrganizacaoConfigController } from "../config/organizacao-config.controller";
import { PortalController } from "../portal/portal.controller";
import { PlanosController } from "../planos/planos.controller";
import { FornecedoresController } from "../fornecedores/fornecedores.controller";
import { QualidadeController } from "../qualidade/qualidade.controller";
import { SolicitacoesController } from "../solicitacoes/solicitacoes.controller";
import { MobileController } from "../mobile/mobile.controller";
import { HealthController } from "../health/health.controller";

const ALL_CONTROLLERS = [
  AuthController,
  SessionController,
  NavController,
  DashboardController,
  EquipamentosController,
  OsController,
  OsDominiosController,
  EstoqueController,
  LaudosController,
  ProcedimentosController,
  InstrumentosController,
  CertificadosController,
  FichaVidaController,
  ContratosController,
  AtendimentoExternoController,
  PessoasController,
  CadastrosController,
  AuditoriasController,
  EstrategicoController,
  IndicadoresController,
  FinanceiroController,
  GestaoController,
  RelatoriosController,
  OrganizacaoConfigController,
  PortalController,
  PlanosController,
  FornecedoresController,
  QualidadeController,
  SolicitacoesController,
  MobileController,
  HealthController,
];

interface RouteInfo {
  controller: Function;
  controllerName: string;
  method: string;
  methodName: string;
  path: string;
  httpMethod: string;
}

interface PermissionMatrixEntry {
  route: string;
  method: string;
  handler: string;
  isPublic: boolean;
  results: Record<PerfilAcesso, "PERMITIDO" | "NEGADO">;
}

type PermissionMatrix = PermissionMatrixEntry[];

function extractRoutes(): RouteInfo[] {
  const routes: RouteInfo[] = [];

  for (const Controller of ALL_CONTROLLERS) {
    const controllerPath = Reflect.getMetadata("path", Controller) ?? "";
    const prototype = Controller.prototype;
    const methodNames = Object.getOwnPropertyNames(prototype).filter(
      (name) => name !== "constructor" && typeof prototype[name] === "function",
    );

    for (const methodName of methodNames) {
      const method = prototype[methodName];
      const httpMethodMeta = Reflect.getMetadata("method", method);
      const methodPath = Reflect.getMetadata("path", method) ?? "";

      if (httpMethodMeta === undefined) continue;

      // Converter enum RequestMethod para string
      const httpMethodMap: Record<number, string> = {
        0: "GET",
        1: "POST",
        2: "PUT",
        3: "DELETE",
        4: "PATCH",
        5: "ALL",
        6: "OPTIONS",
        7: "HEAD",
        8: "SEARCH",
      };

      const fullPath = `/${controllerPath}${methodPath ? "/" + methodPath : ""}`.replace(/\/+/g, "/");

      routes.push({
        controller: Controller,
        controllerName: Controller.name,
        method: methodName,
        methodName,
        path: fullPath,
        httpMethod: httpMethodMap[httpMethodMeta] ?? String(httpMethodMeta),
      });
    }
  }

  return routes.sort((a, b) => {
    const pathCompare = a.path.localeCompare(b.path);
    if (pathCompare !== 0) return pathCompare;
    return a.httpMethod.localeCompare(b.httpMethod);
  });
}

function createMockExecutionContext(
  controller: Function,
  methodName: string,
  user: {
    userId: string;
    email: string;
    estabelecimentoId: string;
    perfil: PerfilAcesso;
    permissoesModulos: MapaPermissoes;
  },
): ExecutionContext {
  const request = { user };
  const handler = controller.prototype[methodName];

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getClass: () => controller,
    getHandler: () => handler,
    getArgs: () => [],
    getArgByIndex: () => ({}),
    switchToRpc: () => ({
      getContext: () => ({}),
      getData: () => ({}),
    }),
    switchToWs: () => ({
      getClient: () => ({}),
      getData: () => ({}),
    }),
    getType: () => "http" as const,
  } as ExecutionContext;
}

async function testGuardForRoute(
  guard: PermissionsGuard,
  route: RouteInfo,
  perfil: PerfilAcesso,
): Promise<boolean> {
  // Criar user como o JwtStrategy faz
  const user = {
    userId: "test-user-id",
    email: "test@example.com",
    estabelecimentoId: "test-estab-id",
    perfil,
    permissoesModulos: permissoesDoPerfil(perfil), // Sem custom, só padrão
  };

  const context = createMockExecutionContext(route.controller, route.method, user);

  // Mockar super.canActivate para simular JWT OK
  const originalCanActivate = Object.getPrototypeOf(PermissionsGuard.prototype).canActivate;
  Object.getPrototypeOf(PermissionsGuard.prototype).canActivate = async function (ctx: ExecutionContext) {
    // Simular que o JWT passou: apenas retorna true
    return true;
  };

  try {
    const result = await guard.canActivate(context);
    return result === true;
  } catch (error) {
    if (error instanceof ForbiddenException) {
      return false;
    }
    if (error instanceof UnauthorizedException) {
      return false;
    }
    throw error;
  } finally {
    // Restaurar o método original
    Object.getPrototypeOf(PermissionsGuard.prototype).canActivate = originalCanActivate;
  }
}

async function generatePermissionMatrix(routes: RouteInfo[]): Promise<PermissionMatrix> {
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector);
  const perfis = Object.keys(PERMISSOES_PADRAO) as PerfilAcesso[];

  const matrix: PermissionMatrix = [];

  for (const route of routes) {
    // Verificar se é pública
    const isPublic =
      reflector.get<boolean>(IS_PUBLIC_KEY, route.controller.prototype[route.method]) ||
      reflector.get<boolean>(IS_PUBLIC_KEY, route.controller);

    const entry: PermissionMatrixEntry = {
      route: route.path,
      method: route.httpMethod,
      handler: `${route.controllerName}.${route.methodName}`,
      isPublic: isPublic ?? false,
      results: {} as Record<PerfilAcesso, "PERMITIDO" | "NEGADO">,
    };

    for (const perfil of perfis) {
      const allowed = await testGuardForRoute(guard, route, perfil);
      entry.results[perfil] = allowed ? "PERMITIDO" : "NEGADO";
    }

    matrix.push(entry);
  }

  return matrix;
}

const SNAPSHOT_PATH = resolve(__dirname, "permissions-baseline.snapshot.json");

function loadSnapshot(): PermissionMatrix | null {
  try {
    const content = readFileSync(SNAPSHOT_PATH, "utf-8");
    return JSON.parse(content) as PermissionMatrix;
  } catch {
    return null;
  }
}

function saveSnapshot(matrix: PermissionMatrix): void {
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(matrix, null, 2), "utf-8");
}

function findAllControllerFiles(): string[] {
  const srcDir = resolve(__dirname, "..");
  const controllerFiles: string[] = [];

  function scanDir(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".controller.ts")) {
        controllerFiles.push(fullPath);
      }
    }
  }

  scanDir(srcDir);
  return controllerFiles;
}

describe("Baseline de Permissões da API", () => {
  it("todos os controllers .ts estão mapeados no teste", () => {
    const controllerFiles = findAllControllerFiles();
    const mappedNames = new Set(ALL_CONTROLLERS.map((c) => c.name));

    const unmapped: string[] = [];
    for (const file of controllerFiles) {
      const filename = file.split("/").pop()!;
      // Converter auth.controller.ts -> AuthController
      const expectedName = filename
        .replace(".controller.ts", "")
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("") + "Controller";

      if (!mappedNames.has(expectedName)) {
        unmapped.push(`${filename} -> esperado: ${expectedName}`);
      }
    }

    assert.equal(
      unmapped.length,
      0,
      `Controllers não mapeados no teste:\n${unmapped.join("\n")}\n\nAdicione-os em ALL_CONTROLLERS.`,
    );
  });

  it("mapeia todas as rotas da API", async () => {
    const routes = extractRoutes();
    assert.ok(routes.length > 0, "Deve encontrar pelo menos uma rota");

    const publicRoutes = routes.filter((r) => {
      const reflector = new Reflector();
      return (
        reflector.get<boolean>(IS_PUBLIC_KEY, r.controller.prototype[r.method]) ||
        reflector.get<boolean>(IS_PUBLIC_KEY, r.controller)
      );
    });

    const protectedRoutes = routes.filter((r) => {
      const reflector = new Reflector();
      const isPublic =
        reflector.get<boolean>(IS_PUBLIC_KEY, r.controller.prototype[r.method]) ||
        reflector.get<boolean>(IS_PUBLIC_KEY, r.controller);
      return !isPublic;
    });

    assert.ok(publicRoutes.length > 0, "Deve ter rotas públicas");
    assert.ok(protectedRoutes.length > 0, "Deve ter rotas protegidas");
  });

  it("matriz de permissões coincide com o snapshot (baseline)", async () => {
    const routes = extractRoutes();
    const currentMatrix = await generatePermissionMatrix(routes);

    const updateBaseline = process.env.UPDATE_BASELINE === "1";

    if (updateBaseline) {
      saveSnapshot(currentMatrix);
      console.log(`✓ Snapshot atualizado em ${SNAPSHOT_PATH}`);
      return;
    }

    const snapshot = loadSnapshot();
    assert.ok(snapshot, `Snapshot não encontrado em ${SNAPSHOT_PATH}. Execute com UPDATE_BASELINE=1`);

    assert.equal(
      currentMatrix.length,
      snapshot.length,
      `Número de rotas mudou: atual=${currentMatrix.length}, snapshot=${snapshot.length}`,
    );

    for (let i = 0; i < currentMatrix.length; i++) {
      const current = currentMatrix[i];
      const expected = snapshot[i];

      assert.equal(
        current.route,
        expected.route,
        `Rota ${i}: rota mudou de ${expected.route} para ${current.route}`,
      );

      assert.equal(
        current.method,
        expected.method,
        `Rota ${current.route}: método mudou de ${expected.method} para ${current.method}`,
      );

      const perfis = Object.keys(PERMISSOES_PADRAO) as PerfilAcesso[];
      for (const perfil of perfis) {
        assert.equal(
          current.results[perfil],
          expected.results[perfil],
          `Rota ${current.route} [${perfil}]: resultado mudou de ${expected.results[perfil]} para ${current.results[perfil]}`,
        );
      }
    }
  });

  it("rotas públicas permitem acesso sem JWT", async () => {
    const routes = extractRoutes();
    const matrix = await generatePermissionMatrix(routes);
    const perfis = Object.keys(PERMISSOES_PADRAO) as PerfilAcesso[];

    const publicRoutes = matrix.filter((e) => e.isPublic);
    assert.ok(publicRoutes.length > 0, "Deve haver rotas públicas");

    for (const route of publicRoutes) {
      for (const perfil of perfis) {
        assert.equal(
          route.results[perfil],
          "PERMITIDO",
          `Rota pública ${route.route} deve permitir ${perfil}`,
        );
      }
    }
  });

  it("TECNICO e SOLICITANTE são negados em rotas administrativas", async () => {
    const routes = extractRoutes();
    const matrix = await generatePermissionMatrix(routes);

    // Buscar rotas de config e pessoas que exigem mais que LEITURA
    const reflector = new Reflector();
    const adminRoutes: PermissionMatrixEntry[] = [];

    for (const route of routes) {
      const permission = reflector.get<{ modulo: string; minimo: number }>(
        PERMISSAO_KEY,
        route.controller.prototype[route.method],
      ) ?? reflector.get<{ modulo: string; minimo: number }>(PERMISSAO_KEY, route.controller);

      if (
        permission &&
        (permission.modulo === "config" || permission.modulo === "pessoas") &&
        permission.minimo >= PERMISSAO_NIVEL.EDICAO
      ) {
        const entry = matrix.find((e) => e.route === route.path && e.method === route.httpMethod);
        if (entry) adminRoutes.push(entry);
      }
    }

    assert.ok(adminRoutes.length > 0, "Deve haver rotas administrativas protegidas");

    for (const route of adminRoutes) {
      assert.equal(
        route.results.TECNICO,
        "NEGADO",
        `TECNICO deve ser negado em ${route.route}`,
      );
      assert.equal(
        route.results.SOLICITANTE,
        "NEGADO",
        `SOLICITANTE deve ser negado em ${route.route}`,
      );
    }
  });

  it("TECNICO tem acesso ao módulo os (EDICAO)", async () => {
    const routes = extractRoutes();
    const matrix = await generatePermissionMatrix(routes);

    const reflector = new Reflector();
    const osRoutes: PermissionMatrixEntry[] = [];

    for (const route of routes) {
      const permission = reflector.get<{ modulo: string; minimo: number }>(
        PERMISSAO_KEY,
        route.controller.prototype[route.method],
      ) ?? reflector.get<{ modulo: string; minimo: number }>(PERMISSAO_KEY, route.controller);

      if (
        permission &&
        permission.modulo === "os" &&
        permission.minimo <= PERMISSAO_NIVEL.EDICAO
      ) {
        const entry = matrix.find((e) => e.route === route.path && e.method === route.httpMethod);
        if (entry) osRoutes.push(entry);
      }
    }

    assert.ok(osRoutes.length > 0, "Deve haver rotas de OS com LEITURA/EDICAO");

    for (const route of osRoutes) {
      assert.equal(
        route.results.TECNICO,
        "PERMITIDO",
        `TECNICO deve ter acesso a ${route.route}`,
      );
    }
  });

  it("ADMIN tem acesso total (todas as rotas protegidas)", async () => {
    const routes = extractRoutes();
    const matrix = await generatePermissionMatrix(routes);

    const protectedRoutes = matrix.filter((e) => !e.isPublic);

    for (const route of protectedRoutes) {
      assert.equal(
        route.results.ADMIN,
        "PERMITIDO",
        `ADMIN deve ter acesso total a ${route.route}`,
      );
    }
  });
});
