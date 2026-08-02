import { PrismaClient, PerfilAcesso, PrioridadeOS, SituacaoEquipamento, StatusOS, TipoOS } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const senhaHash = await bcrypt.hash("nexo1234", 10);

  const hospital = await prisma.estabelecimento.upsert({
    where: { id: "estab_modelo" },
    update: {},
    create: {
      id: "estab_modelo",
      nome: "Hospital e Maternidade Modelo",
    },
  });

  const engenheiro = await prisma.usuario.upsert({
    where: { email: "engenheiro@nexo.local" },
    update: {},
    create: {
      email: "engenheiro@nexo.local",
      nome: "Ana Engenheira",
      senhaHash,
    },
  });

  const tecnico = await prisma.usuario.upsert({
    where: { email: "tecnico@nexo.local" },
    update: {},
    create: {
      email: "tecnico@nexo.local",
      nome: "Carlos Técnico",
      senhaHash,
    },
  });

  const solicitante = await prisma.usuario.upsert({
    where: { email: "solicitante@nexo.local" },
    update: {},
    create: {
      email: "solicitante@nexo.local",
      nome: "Maria Solicitante",
      senhaHash,
    },
  });

  for (const [usuarioId, perfil] of [
    [engenheiro.id, PerfilAcesso.ENGENHEIRO],
    [tecnico.id, PerfilAcesso.TECNICO],
    [solicitante.id, PerfilAcesso.SOLICITANTE],
  ] as const) {
    await prisma.usuarioEstabelecimento.upsert({
      where: {
        usuarioId_estabelecimentoId: {
          usuarioId,
          estabelecimentoId: hospital.id,
        },
      },
      update: { perfil },
      create: {
        usuarioId,
        estabelecimentoId: hospital.id,
        perfil,
      },
    });
  }

  const uti = await prisma.setor.upsert({
    where: { estabelecimentoId_nome: { estabelecimentoId: hospital.id, nome: "UTI Adulto" } },
    update: {},
    create: { estabelecimentoId: hospital.id, nome: "UTI Adulto" },
  });

  const cc = await prisma.setor.upsert({
    where: { estabelecimentoId_nome: { estabelecimentoId: hospital.id, nome: "Centro Cirúrgico" } },
    update: {},
    create: { estabelecimentoId: hospital.id, nome: "Centro Cirúrgico" },
  });

  const fabricante = await prisma.fabricante.upsert({
    where: { estabelecimentoId_nome: { estabelecimentoId: hospital.id, nome: "Dräger" } },
    update: {},
    create: { estabelecimentoId: hospital.id, nome: "Dräger" },
  });

  const modelo = await prisma.modelo.upsert({
    where: { fabricanteId_nome: { fabricanteId: fabricante.id, nome: "Evita V300" } },
    update: {},
    create: { fabricanteId: fabricante.id, nome: "Evita V300" },
  });

  const plano = await prisma.planoDescricao.upsert({
    where: {
      estabelecimentoId_nome: { estabelecimentoId: hospital.id, nome: "Ventilador Pulmonar" },
    },
    update: {},
    create: {
      estabelecimentoId: hospital.id,
      nome: "Ventilador Pulmonar",
      criticidade: "ALTA",
      vidaUtilAnos: 10,
    },
  });

  const fornecedor = await prisma.fornecedor.upsert({
    where: {
      estabelecimentoId_nome: { estabelecimentoId: hospital.id, nome: "MedSupply Brasil" },
    },
    update: {},
    create: { estabelecimentoId: hospital.id, nome: "MedSupply Brasil" },
  });

  await prisma.centroCusto.upsert({
    where: { estabelecimentoId_codigo: { estabelecimentoId: hospital.id, codigo: "CC-UTI" } },
    update: {},
    create: {
      estabelecimentoId: hospital.id,
      codigo: "CC-UTI",
      nome: "UTI Adulto",
    },
  });

  const colabEng = await prisma.colaborador.upsert({
    where: {
      estabelecimentoId_matricula: { estabelecimentoId: hospital.id, matricula: "ENG-001" },
    },
    update: { usuarioId: engenheiro.id },
    create: {
      estabelecimentoId: hospital.id,
      usuarioId: engenheiro.id,
      matricula: "ENG-001",
      nome: "Ana Engenheira",
      cargo: "Engenheira Clínica",
      registroProfissional: "CREA-12345",
    },
  });

  const colabTec = await prisma.colaborador.upsert({
    where: {
      estabelecimentoId_matricula: { estabelecimentoId: hospital.id, matricula: "TEC-001" },
    },
    update: { usuarioId: tecnico.id },
    create: {
      estabelecimentoId: hospital.id,
      usuarioId: tecnico.id,
      matricula: "TEC-001",
      nome: "Carlos Técnico",
      cargo: "Técnico em Equipamentos",
    },
  });

  const eq1 = await prisma.equipamento.upsert({
    where: { estabelecimentoId_tag: { estabelecimentoId: hospital.id, tag: "EQ-0001" } },
    update: {},
    create: {
      estabelecimentoId: hospital.id,
      tag: "EQ-0001",
      nome: "Ventilador UTI 01",
      descricaoId: plano.id,
      fabricanteId: fabricante.id,
      modeloId: modelo.id,
      setorId: uti.id,
      fornecedorId: fornecedor.id,
      patrimonio: "PAT-1001",
      nSerie: "SN-DRG-88991",
      dataAquisicao: new Date("2022-03-15"),
      valorAquisicao: 185000,
      situacao: SituacaoEquipamento.ATIVO,
      checklistRecebimentoPendente: true,
    },
  });

  await prisma.equipamento.upsert({
    where: { estabelecimentoId_tag: { estabelecimentoId: hospital.id, tag: "EQ-0002" } },
    update: {},
    create: {
      estabelecimentoId: hospital.id,
      tag: "EQ-0002",
      nome: "Ventilador CC 01",
      descricaoId: plano.id,
      fabricanteId: fabricante.id,
      modeloId: modelo.id,
      setorId: cc.id,
      patrimonio: "PAT-1002",
      nSerie: "SN-DRG-88992",
      dataAquisicao: new Date("2021-08-01"),
      valorAquisicao: 175000,
      situacao: SituacaoEquipamento.EM_GARANTIA,
      checklistRecebimentoPendente: false,
    },
  });

  await prisma.contadorSequencia.upsert({
    where: { estabelecimentoId_chave: { estabelecimentoId: hospital.id, chave: "OS" } },
    update: {},
    create: { estabelecimentoId: hospital.id, chave: "OS", valor: 2 },
  });

  await prisma.ordemServico.upsert({
    where: { estabelecimentoId_numero: { estabelecimentoId: hospital.id, numero: 1 } },
    update: {},
    create: {
      estabelecimentoId: hospital.id,
      numero: 1,
      codigo: "OS-00001",
      equipamentoId: eq1.id,
      tipo: TipoOS.CORRETIVA,
      prioridade: PrioridadeOS.URGENTE,
      status: StatusOS.EM_ANDAMENTO,
      responsavelId: colabTec.id,
      observacaoRequisicao: "Alarme de pressão persistente",
      abertura: new Date(Date.now() - 3 * 60 * 60 * 1000),
    },
  });

  await prisma.ordemServico.upsert({
    where: { estabelecimentoId_numero: { estabelecimentoId: hospital.id, numero: 2 } },
    update: {},
    create: {
      estabelecimentoId: hospital.id,
      numero: 2,
      codigo: "OS-00002",
      equipamentoId: eq1.id,
      tipo: TipoOS.PREVENTIVA,
      prioridade: PrioridadeOS.MEDIA,
      status: StatusOS.NAO_ATRIBUIDA,
      observacaoRequisicao: "Preventiva mensal",
    },
  });

  // silencia unused var warning in strict tooling
  void colabEng;

  await prisma.estoqueItem.upsert({
    where: {
      estabelecimentoId_codigo: { estabelecimentoId: hospital.id, codigo: "PEC-SENSOR-01" },
    },
    update: {},
    create: {
      estabelecimentoId: hospital.id,
      codigo: "PEC-SENSOR-01",
      descricao: "Sensor de fluxo",
      almoxarifado: "Principal",
      qtdAtual: 12,
      qtdMinima: 5,
      valorUnitario: 450,
    },
  });

  await prisma.estoqueItem.upsert({
    where: {
      estabelecimentoId_codigo: { estabelecimentoId: hospital.id, codigo: "PEC-FILTRO-02" },
    },
    update: {},
    create: {
      estabelecimentoId: hospital.id,
      codigo: "PEC-FILTRO-02",
      descricao: "Filtro bacteriano",
      almoxarifado: "Principal",
      qtdAtual: 2,
      qtdMinima: 10,
      valorUnitario: 85,
    },
  });

  await prisma.contadorSequencia.upsert({
    where: { estabelecimentoId_chave: { estabelecimentoId: hospital.id, chave: "SOL" } },
    update: {},
    create: { estabelecimentoId: hospital.id, chave: "SOL", valor: 1 },
  });

  await prisma.solicitacaoServico.upsert({
    where: {
      estabelecimentoId_protocolo: { estabelecimentoId: hospital.id, protocolo: "SOL-0001" },
    },
    update: {},
    create: {
      estabelecimentoId: hospital.id,
      protocolo: "SOL-0001",
      equipamentoId: eq1.id,
      setorNome: "UTI Adulto",
      descricao: "Equipamento com alarme intermitente desde o plantão da manhã",
      urgencia: "ALTA",
      solicitanteNome: "Maria Solicitante",
      ramal: "2045",
      status: "PENDENTE",
    },
  });

  const instrumento = await prisma.instrumentoPadrao.upsert({
    where: {
      estabelecimentoId_nSerie: { estabelecimentoId: hospital.id, nSerie: "FLUKE-ESA615-001" },
    },
    update: {},
    create: {
      estabelecimentoId: hospital.id,
      nome: "Analisador de Segurança Elétrica Fluke ESA615",
      nSerie: "FLUKE-ESA615-001",
      certificadoNumero: "RBC-99881",
      certificadoEmissao: new Date("2025-09-01"),
      certificadoValidade: new Date("2027-09-01"),
      laboratorioEmissor: "Lab Metrologia Sul",
    },
  });

  const procPrev = await prisma.procedimentoLaudo.upsert({
    where: { id: "proc_prev_vent" },
    update: {},
    create: {
      id: "proc_prev_vent",
      estabelecimentoId: hospital.id,
      nome: "Preventiva Ventilador Pulmonar",
      tipo: "PREVENTIVA",
      validadeMeses: 6,
      itens: [
        { id: "1", pergunta: "Filtros limpos/substituídos" },
        { id: "2", pergunta: "Sensores calibrados" },
        { id: "3", pergunta: "Alarmes funcionais" },
      ],
    },
  });

  await prisma.procedimentoModelo.upsert({
    where: {
      procedimentoId_modeloId: { procedimentoId: procPrev.id, modeloId: modelo.id },
    },
    update: {},
    create: { procedimentoId: procPrev.id, modeloId: modelo.id },
  });

  void instrumento;

  console.log("Seed OK");
  console.log("Logins: engenheiro@nexo.local / tecnico@nexo.local / solicitante@nexo.local");
  console.log("Senha: nexo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
