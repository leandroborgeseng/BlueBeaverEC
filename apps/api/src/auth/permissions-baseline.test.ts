import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ExecutionContext, RequestMethod } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  PERMISSAO_NIVEL,
  PERMISSOES_PADRAO,
  permissoesDoPerfil,
  type PerfilAcesso,
  type NivelPermissao,
  type ModuloPermissao,
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

interface RouteMetadata {
  controller: string;
  path: string;
  method: string;
  handler: string;
  isPublic: boolean;
  requiresAuth: boolean;
  permission?: {
    modulo: ModuloPermissao;
    minimo: NivelPermissao;
  };
}

interface PermissionMatrixEntry {
  route: string;
  method: string;
  handler: string;
  isPublic: boolean;
  requiresAuth: boolean;
  permission?: string;
  results: Record<PerfilAcesso, "PERMITIDO" | "NEGADO">;
}

type PermissionMatrix = PermissionMatrixEntry[];

function extractRoutes(): RouteMetadata[] {
  const reflector = new Reflector();
  const routes: RouteMetadata[] = [];

  // Mapa do enum RequestMethod para string
  const methodToString: Record<RequestMethod, string> = {
    [RequestMethod.GET]: "GET",
    [RequestMethod.POST]: "POST",
    [RequestMethod.PUT]: "PUT",
    [RequestMethod.DELETE]: "DELETE",
    [RequestMethod.PATCH]: "PATCH",
    [RequestMethod.ALL]: "ALL",
    [RequestMethod.OPTIONS]: "OPTIONS",
    [RequestMethod.HEAD]: "HEAD",
    [RequestMethod.SEARCH]: "SEARCH",
  };

  for (const Controller of ALL_CONTROLLERS) {
    const controllerPath = Reflect.getMetadata("path", Controller) ?? "";
    const controllerPermission = reflector.get<{ modulo: ModuloPermissao; minimo: NivelPermissao } | undefined>(
      PERMISSAO_KEY,
      Controller,
    );
    const controllerIsPublic = reflector.get<boolean>(IS_PUBLIC_KEY, Controller) ?? false;

    const prototype = Controller.prototype;
    const methodNames = Object.getOwnPropertyNames(prototype).filter(
      (name) => name !== "constructor" && typeof prototype[name] === "function",
    );

    for (const methodName of methodNames) {
      const method = prototype[methodName];
      const httpMethod = Reflect.getMetadata("method", method) as RequestMethod | undefined;
      const methodPath = Reflect.getMetadata("path", method) ?? "";
      
      if (httpMethod === undefined) continue; // Não é uma rota HTTP

      const isPublic = reflector.get<boolean>(IS_PUBLIC_KEY, method) ?? controllerIsPublic;
      const permission =
        reflector.get<{ modulo: ModuloPermissao; minimo: NivelPermissao } | undefined>(PERMISSAO_KEY, method) ??
        controllerPermission;

      const fullPath = `/${controllerPath}${methodPath ? "/" + methodPath : ""}`.replace(/\/+/g, "/");

      routes.push({
        controller: Controller.name,
        path: fullPath,
        method: methodToString[httpMethod] ?? String(httpMethod),
        handler: `${Controller.name}.${methodName}`,
        isPublic,
        requiresAuth: !isPublic,
        permission,
      });
    }
  }

  // Ordenar por rota para estabilidade
  return routes.sort((a, b) => {
    const pathCompare = a.path.localeCompare(b.path);
    if (pathCompare !== 0) return pathCompare;
    return a.method.localeCompare(b.method);
  });
}

function createMockExecutionContext(user: {
  userId: string;
  email: string;
  estabelecimentoId: string;
  perfil: PerfilAcesso;
  permissoesModulos?: Record<string, number>;
}): ExecutionContext {
  const request = { user };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getClass: () => Object,
    getHandler: () => function handler() {},
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

async function testGuardForProfile(
  guard: PermissionsGuard,
  reflector: Reflector,
  route: RouteMetadata,
  perfil: PerfilAcesso,
): Promise<boolean> {
  // Se é pública, sempre permite
  if (route.isPublic) return true;

  const user = {
    userId: "test-user",
    email: "test@test.com",
    estabelecimentoId: "test-estab",
    perfil,
    permissoesModulos: permissoesDoPerfil(perfil),
  };

  // Mock do contexto com os metadados corretos
  const mockHandler = function handler() {};
  const mockClass = class MockController {};

  // Aplicar metadados ao handler e à classe
  if (route.isPublic) {
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, mockHandler);
  }
  if (route.permission) {
    Reflect.defineMetadata(PERMISSAO_KEY, route.permission, mockHandler);
  }

  const context = createMockExecutionContext(user);
  // Substituir getHandler e getClass para retornar os mocks com metadados
  context.getHandler = () => mockHandler;
  context.getClass = () => mockClass;

  try {
    const result = await guard.canActivate(context);
    return result === true;
  } catch (error) {
    // ForbiddenException ou UnauthorizedException = negado
    return false;
  }
}

function generatePermissionMatrix(routes: RouteMetadata[]): PermissionMatrix {
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector);
  const perfis = Object.keys(PERMISSOES_PADRAO) as PerfilAcesso[];

  const matrix: PermissionMatrix = [];

  for (const route of routes) {
    const entry: PermissionMatrixEntry = {
      route: route.path,
      method: route.method,
      handler: route.handler,
      isPublic: route.isPublic,
      requiresAuth: route.requiresAuth,
      permission: route.permission
        ? `${route.permission.modulo}:${route.permission.minimo}`
        : undefined,
      results: {} as Record<PerfilAcesso, "PERMITIDO" | "NEGADO">,
    };

    for (const perfil of perfis) {
      const allowed = testGuardForProfile(guard, reflector, route, perfil);
      entry.results[perfil] = allowed ? "PERMITIDO" : "NEGADO";
    }

    matrix.push(entry);
  }

  return matrix;
}

function generatePermissionMatrixSync(routes: RouteMetadata[]): PermissionMatrix {
  const perfis = Object.keys(PERMISSOES_PADRAO) as PerfilAcesso[];
  const matrix: PermissionMatrix = [];

  for (const route of routes) {
    const entry: PermissionMatrixEntry = {
      route: route.path,
      method: route.method,
      handler: route.handler,
      isPublic: route.isPublic,
      requiresAuth: route.requiresAuth,
      permission: route.permission
        ? `${route.permission.modulo}:${route.permission.minimo}`
        : undefined,
      results: {} as Record<PerfilAcesso, "PERMITIDO" | "NEGADO">,
    };

    for (const perfil of perfis) {
      // Se é pública, sempre permite
      if (route.isPublic) {
        entry.results[perfil] = "PERMITIDO";
        continue;
      }

      // Se não tem permissão específica, só precisa de JWT (permite)
      if (!route.permission) {
        entry.results[perfil] = "PERMITIDO";
        continue;
      }

      // Verificar se o perfil tem a permissão necessária
      const mapa = permissoesDoPerfil(perfil);
      const nivelAtual = mapa[route.permission.modulo] ?? PERMISSAO_NIVEL.NENHUM;
      const permitido = nivelAtual >= route.permission.minimo;
      entry.results[perfil] = permitido ? "PERMITIDO" : "NEGADO";
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

describe("Baseline de Permissões da API", () => {
  it("mapeia todas as rotas protegidas", () => {
    const routes = extractRoutes();
    assert.ok(routes.length > 0, "Deve encontrar pelo menos uma rota");
    
    const protectedRoutes = routes.filter((r) => r.permission);
    assert.ok(protectedRoutes.length > 0, "Deve encontrar rotas protegidas");
  });

  it("matriz de permissões coincide com o snapshot (baseline)", () => {
    const routes = extractRoutes();
    const currentMatrix = generatePermissionMatrixSync(routes);

    const updateBaseline = process.env.UPDATE_BASELINE === "1";
    
    if (updateBaseline) {
      saveSnapshot(currentMatrix);
      console.log(`✓ Snapshot atualizado em ${SNAPSHOT_PATH}`);
      return;
    }

    const snapshot = loadSnapshot();
    assert.ok(snapshot, `Snapshot não encontrado em ${SNAPSHOT_PATH}. Execute com UPDATE_BASELINE=1`);

    // Comparar tamanho
    assert.equal(
      currentMatrix.length,
      snapshot.length,
      `Número de rotas mudou: atual=${currentMatrix.length}, snapshot=${snapshot.length}`,
    );

    // Comparar cada entrada
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

      assert.equal(
        current.permission,
        expected.permission,
        `Rota ${current.route}: permissão mudou de ${expected.permission} para ${current.permission}`,
      );

      // Comparar resultados por perfil
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

  it("rotas sem @RequirePermission exigem apenas JWT (comportamento atual)", () => {
    const routes = extractRoutes();
    const authOnlyRoutes = routes.filter((r) => !r.isPublic && !r.permission);
    
    // Deve haver rotas que só precisam de JWT (ex: session/me)
    assert.ok(authOnlyRoutes.length > 0, "Deve haver rotas que só exigem JWT");

    // Para essas rotas, todos os perfis devem ser permitidos (exceto validação de JWT)
    const matrix = generatePermissionMatrixSync(routes);
    const perfis = Object.keys(PERMISSOES_PADRAO) as PerfilAcesso[];
    
    for (const route of authOnlyRoutes) {
      const entry = matrix.find((e) => e.route === route.path && e.method === route.method);
      assert.ok(entry, `Entrada não encontrada para ${route.method} ${route.path}`);
      
      for (const perfil of perfis) {
        assert.equal(
          entry.results[perfil],
          "PERMITIDO",
          `Rota sem @RequirePermission (${route.path}) deve permitir ${perfil}`,
        );
      }
    }
  });

  it("TECNICO e SOLICITANTE são negados em rotas administrativas", () => {
    const routes = extractRoutes();
    const matrix = generatePermissionMatrixSync(routes);

    // Rotas administrativas: config, pessoas (com EDICAO ou mais)
    const adminRoutes = matrix.filter(
      (e) =>
        e.permission &&
        (e.permission.startsWith("config:") || 
         e.permission.startsWith("pessoas:")) &&
        !e.permission.includes(":0") && // Não é NENHUM
        !e.permission.includes(":1")    // Não é só LEITURA
    );

    assert.ok(adminRoutes.length > 0, "Deve haver rotas administrativas protegidas");

    for (const route of adminRoutes) {
      assert.equal(
        route.results.TECNICO,
        "NEGADO",
        `TECNICO deve ser negado em ${route.route} (${route.permission})`,
      );
      assert.equal(
        route.results.SOLICITANTE,
        "NEGADO",
        `SOLICITANTE deve ser negado em ${route.route} (${route.permission})`,
      );
    }
  });

  it("TECNICO tem acesso ao módulo os (EDICAO=2)", () => {
    const routes = extractRoutes();
    const matrix = generatePermissionMatrixSync(routes);

    // Rotas de OS com LEITURA ou EDICAO (não APROVACAO)
    const osEditRoutes = matrix.filter(
      (e) =>
        e.permission &&
        e.permission.startsWith("os:") &&
        (e.permission === "os:1" || e.permission === "os:2")
    );

    assert.ok(osEditRoutes.length > 0, "Deve haver rotas de OS com LEITURA/EDICAO");

    for (const route of osEditRoutes) {
      assert.equal(
        route.results.TECNICO,
        "PERMITIDO",
        `TECNICO deve ter acesso a ${route.route} (${route.permission})`,
      );
    }
  });

  it("ADMIN tem acesso total (todas as rotas protegidas)", () => {
    const routes = extractRoutes();
    const matrix = generatePermissionMatrixSync(routes);

    const protectedRoutes = matrix.filter((e) => e.permission);

    for (const route of protectedRoutes) {
      assert.equal(
        route.results.ADMIN,
        "PERMITIDO",
        `ADMIN deve ter acesso total a ${route.route} (${route.permission})`,
      );
    }
  });
});
