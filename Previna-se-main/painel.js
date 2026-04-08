let grafico = null;

let extintoresMemoria = [];
let inspecoesMemoria = [];
let configMemoria = {
  nomeEmpresa: "Previna-se",
  diasAlerta: 30
};
let historicoMemoria = [];

let timerPersistencia = null;
let persistenciaEmAndamento = false;

async function carregarDadosServidor() {
  const resposta = await fetch("/api/painel-dados", {
    headers: { Accept: "application/json" }
  });

  if (!resposta.ok) {
    throw new Error("Nao foi possivel carregar os dados do servidor.");
  }

  const payload = await resposta.json();
  const dados = payload?.dados || {};

  extintoresMemoria = Array.isArray(dados.extintores) ? dados.extintores : [];
  inspecoesMemoria = Array.isArray(dados.inspecoes) ? dados.inspecoes : [];
  historicoMemoria = Array.isArray(dados.historico) ? dados.historico : [];

  const diasAlerta = Number(dados?.config?.diasAlerta);
  configMemoria = {
    nomeEmpresa: String(dados?.config?.nomeEmpresa || "Previna-se"),
    diasAlerta: Number.isFinite(diasAlerta) && diasAlerta > 0 ? diasAlerta : 30
  };
}

async function persistirDadosServidor() {
  if (persistenciaEmAndamento) return;
  persistenciaEmAndamento = true;

  try {
    await fetch("/api/painel-dados", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        extintores: extintoresMemoria,
        inspecoes: inspecoesMemoria,
        config: configMemoria,
        historico: historicoMemoria
      })
    });
  } catch (erro) {
    console.error("Erro ao persistir dados do painel:", erro);
  } finally {
    persistenciaEmAndamento = false;
  }
}

function agendarPersistencia() {
  clearTimeout(timerPersistencia);
  timerPersistencia = setTimeout(() => {
    persistirDadosServidor();
  }, 300);
}

function obterExtintores() {
  return extintoresMemoria;
}

function salvarExtintores(lista) {
  extintoresMemoria = Array.isArray(lista) ? lista : [];
  agendarPersistencia();
}

function obterInspecoes() {
  return inspecoesMemoria;
}

function salvarInspecoes(lista) {
  inspecoesMemoria = Array.isArray(lista) ? lista : [];
  agendarPersistencia();
}

function obterConfig() {
  return {
    nomeEmpresa: configMemoria.nomeEmpresa,
    diasAlerta: configMemoria.diasAlerta
  };
}

function salvarConfig(config) {
  const diasAlerta = Number(config?.diasAlerta);
  configMemoria = {
    nomeEmpresa: String(config?.nomeEmpresa || "Previna-se"),
    diasAlerta: Number.isFinite(diasAlerta) && diasAlerta > 0 ? diasAlerta : 30
  };
  agendarPersistencia();
}

function obterHistoricoGeral() {
  return historicoMemoria;
}

function salvarHistoricoGeral(lista) {
  historicoMemoria = Array.isArray(lista) ? lista : [];
  agendarPersistencia();
}

function registrarHistorico(modulo, acao, descricao) {
  const historico = obterHistoricoGeral().slice();
  historico.push({
    id: Date.now(),
    modulo,
    acao,
    descricao,
    dataHora: new Date().toLocaleString("pt-BR")
  });
  salvarHistoricoGeral(historico);
}

function exportarBackupCompleto() {
  const backup = {
    extintores_previna: obterExtintores(),
    inspecoes_previna: obterInspecoes(),
    config_previna: obterConfig(),
    historico_geral_previna: obterHistoricoGeral(),
    data_exportacao: new Date().toLocaleString("pt-BR")
  };

  baixarArquivo(
    "backup-previnase-extintores.json",
    JSON.stringify(backup, null, 2),
    "application/json"
  );

  registrarHistorico("Sistema", "Backup", "Backup do modulo de extintores exportado");
}

function importarBackupCompleto(arquivo, callback) {
  const leitor = new FileReader();

  leitor.onload = function (evento) {
    try {
      const dados = JSON.parse(evento.target.result);
      extintoresMemoria = Array.isArray(dados.extintores_previna) ? dados.extintores_previna : [];
      inspecoesMemoria = Array.isArray(dados.inspecoes_previna) ? dados.inspecoes_previna : [];
      historicoMemoria = Array.isArray(dados.historico_geral_previna) ? dados.historico_geral_previna : [];

      const cfg = dados.config_previna || {};
      const diasAlerta = Number(cfg.diasAlerta);
      configMemoria = {
        nomeEmpresa: String(cfg.nomeEmpresa || "Previna-se"),
        diasAlerta: Number.isFinite(diasAlerta) && diasAlerta > 0 ? diasAlerta : 30
      };

      registrarHistorico("Sistema", "Backup", "Backup do modulo de extintores importado");
      agendarPersistencia();
      if (callback) callback(true);
    } catch (erro) {
      if (callback) callback(false);
    }
  };

  leitor.readAsText(arquivo);
}

function criarDadosIniciais() {
}

function formatarData(data) {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function calcularStatus(validade) {
  const config = obterConfig();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const dataValidade = new Date(validade + "T00:00:00");
  const diferenca = Math.ceil((dataValidade - hoje) / (1000 * 60 * 60 * 24));

  if (diferenca < 0) return { texto: "Vencido", classe: "status-danger" };
  if (diferenca <= Number(config.diasAlerta)) return { texto: "PrÃ³ximo", classe: "status-warning" };
  return { texto: "Em dia", classe: "status-ok" };
}

function atualizarDashboard() {
  const extintores = obterExtintores();

  let emDia = 0;
  let proximos = 0;
  let vencidos = 0;

  extintores.forEach((extintor) => {
    const status = calcularStatus(extintor.validade).texto;
    if (status === "Em dia") emDia++;
    if (status === "PrÃ³ximo") proximos++;
    if (status === "Vencido") vencidos++;
  });

  document.getElementById("totalExtintores").textContent = extintores.length;
  document.getElementById("totalProximos").textContent = proximos;
  document.getElementById("totalEmDia").textContent = emDia;
  document.getElementById("totalVencidos").textContent = vencidos;

  document.getElementById("alertaVencidos").textContent = `${vencidos} extintores vencidos`;
  document.getElementById("alertaProximos").textContent = `${proximos} prÃ³ximos do vencimento`;
  document.getElementById("alertaEmDia").textContent = `${emDia} extintores em dia`;

  atualizarGrafico(emDia, proximos, vencidos);
  renderTabelaDashboard();
}

function atualizarGrafico(emDia, proximos, vencidos) {
  const ctx = document.getElementById("graficoExtintores");

  if (grafico) grafico.destroy();

  grafico = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Em dia", "PrÃ³ximos do vencimento", "Vencidos"],
      datasets: [{
        data: [emDia, proximos, vencidos],
        backgroundColor: ["#15803d", "#d97706", "#dc2626"],
        borderWidth: 0,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      cutout: "68%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { padding: 18, usePointStyle: true }
        }
      }
    }
  });
}

function renderTabelaDashboard() {
  const tbody = document.getElementById("tabelaDashboard");
  const extintores = obterExtintores().slice(-5).reverse();

  tbody.innerHTML = "";
  extintores.forEach((extintor) => {
    const status = calcularStatus(extintor.validade);
    tbody.innerHTML += `
      <tr>
        <td>${extintor.id}</td>
        <td>${extintor.tipo}</td>
        <td>${extintor.local}</td>
        <td>${formatarData(extintor.validade)}</td>
        <td><span class="status ${status.classe}">${status.texto}</span></td>
      </tr>
    `;
  });
}

function renderExtintores() {
  const tbody = document.getElementById("tabelaExtintores");
  const extintores = obterExtintores();
  tbody.innerHTML = "";

  extintores.forEach((extintor) => {
    const status = calcularStatus(extintor.validade);

    tbody.innerHTML += `
      <tr>
        <td>${extintor.id}</td>
        <td>${extintor.tipo}</td>
        <td>${extintor.local}</td>
        <td>${extintor.numeroSerie}</td>
        <td>${formatarData(extintor.validade)}</td>
        <td><span class="status ${status.classe}">${status.texto}</span></td>
        <td>
          <button class="btn-acao btn-editar" onclick="editarExtintor(${extintor.id})">Editar</button>
          <button class="btn-acao btn-excluir" onclick="excluirExtintor(${extintor.id})">Excluir</button>
          <button class="btn-acao btn-editar" onclick="mostrarQrExtintor(${extintor.id})">QR</button>
        </td>
      </tr>
    `;
  });

  atualizarSelectExtintores();
}

function atualizarSelectExtintores() {
  const select = document.getElementById("inspecaoExtintor");
  const extintores = obterExtintores();

  select.innerHTML = `<option value="">Selecione</option>`;
  extintores.forEach((extintor) => {
    select.innerHTML += `<option value="${extintor.id}">${extintor.tipo} - ${extintor.local}</option>`;
  });
}

function renderInspecoes() {
  const tbody = document.getElementById("tabelaInspecoes");
  const inspecoes = obterInspecoes().slice().reverse();
  tbody.innerHTML = "";

  inspecoes.forEach((inspecao) => {
    tbody.innerHTML += `
      <tr>
        <td>${inspecao.extintorNome}</td>
        <td>${formatarData(inspecao.data)}</td>
        <td>${inspecao.responsavel}</td>
        <td>${inspecao.resultado}</td>
        <td>${inspecao.observacoes || "-"}</td>
      </tr>
    `;
  });
}

function renderRelatorios() {
  const extintores = obterExtintores();
  const inspecoes = obterInspecoes();

  let emDia = 0;
  let proximos = 0;
  let vencidos = 0;

  extintores.forEach((extintor) => {
    const status = calcularStatus(extintor.validade).texto;
    if (status === "Em dia") emDia++;
    if (status === "PrÃ³ximo") proximos++;
    if (status === "Vencido") vencidos++;
  });

  document.getElementById("relatorioTotal").textContent = extintores.length;
  document.getElementById("relatorioInspecoes").textContent = inspecoes.length;
  document.getElementById("relatorioVencidos").textContent = vencidos;
  document.getElementById("relatorioProximos").textContent = proximos;

  document.getElementById("textoRelatorio").innerHTML = `
    <p><strong>Total cadastrado:</strong> ${extintores.length} extintores.</p>
    <p><strong>Em dia:</strong> ${emDia} equipamentos.</p>
    <p><strong>PrÃ³ximos do vencimento:</strong> ${proximos} equipamentos.</p>
    <p><strong>Vencidos:</strong> ${vencidos} equipamentos.</p>
    <p><strong>InspeÃ§Ãµes registradas:</strong> ${inspecoes.length} inspeÃ§Ãµes.</p>
  `;
}

function renderHistoricoExtintores() {
  const tbody = document.getElementById("tabelaHistoricoExtintores");
  const historico = obterHistoricoGeral().slice().reverse();
  tbody.innerHTML = "";

  historico.forEach((item) => {
    tbody.innerHTML += `
      <tr>
        <td>${item.modulo}</td>
        <td>${item.acao}</td>
        <td>${item.descricao}</td>
        <td>${item.dataHora}</td>
      </tr>
    `;
  });
}

function carregarConfiguracoes() {
  const config = obterConfig();
  document.getElementById("nomeEmpresa").value = config.nomeEmpresa;
  document.getElementById("diasAlerta").value = config.diasAlerta;
  document.getElementById("nomeEmpresaSidebar").textContent = config.nomeEmpresa;
}

function editarExtintor(id) {
  const extintores = obterExtintores();
  const extintor = extintores.find((item) => item.id === id);
  if (!extintor) return;

  document.getElementById("extintorIdEdicao").value = extintor.id;
  document.getElementById("tipo").value = extintor.tipo;
  document.getElementById("local").value = extintor.local;
  document.getElementById("validade").value = extintor.validade;
  document.getElementById("numeroSerie").value = extintor.numeroSerie;

  mostrarSecao("extintores");
  document.getElementById("mensagemExtintor").textContent = "Editando extintor.";
}

function excluirExtintor(id) {
  const confirmar = confirm("Deseja excluir este extintor?");
  if (!confirmar) return;

  let extintores = obterExtintores();
  extintores = extintores.filter((item) => item.id !== id);
  salvarExtintores(extintores);

  let inspecoes = obterInspecoes();
  inspecoes = inspecoes.filter((item) => item.extintorId !== id);
  salvarInspecoes(inspecoes);

  registrarHistorico("Extintores", "ExclusÃ£o", `Extintor excluÃ­do: ID ${id}`);
  atualizarTudo();
}

function mostrarQrExtintor(id) {
  const extintor = obterExtintores().find((item) => item.id === id);
  if (!extintor) return;

  gerarQrCodeNoElemento(
    "qrCodeBoxExt",
    `Extintor ID ${extintor.id} | ${extintor.tipo} | Local: ${extintor.local} | SÃ©rie: ${extintor.numeroSerie} | Validade: ${extintor.validade}`
  );

  document.getElementById("modalQrExt").classList.remove("hidden");
}

function mostrarSecao(secao) {
  document.querySelectorAll(".section-content").forEach((item) => item.classList.remove("active-section"));
  document.querySelectorAll(".menu-link").forEach((item) => item.classList.remove("active"));

  document.getElementById(`sec-${secao}`).classList.add("active-section");
  document.querySelector(`.menu-link[data-section="${secao}"]`).classList.add("active");

  const titulos = {
    dashboard: ["Controle de Extintores", "Acompanhe status, vencimentos e inspeÃ§Ãµes em tempo real."],
    extintores: ["Extintores", "Cadastre, edite e acompanhe os equipamentos."],
    inspecoes: ["InspeÃ§Ãµes", "Registre e acompanhe o histÃ³rico de inspeÃ§Ãµes."],
    relatorios: ["RelatÃ³rios", "Visualize o resumo geral do sistema."],
    configuracoes: ["ConfiguraÃ§Ãµes", "Personalize o comportamento do painel."]
  };

  document.getElementById("tituloSecao").textContent = titulos[secao][0];
  document.getElementById("subtituloSecao").textContent = titulos[secao][1];
}

function atualizarTudo() {
  atualizarDashboard();
  renderExtintores();
  renderInspecoes();
  renderRelatorios();
  renderHistoricoExtintores();
  carregarConfiguracoes();
}

document.getElementById("formExtintor").addEventListener("submit", function (e) {
  e.preventDefault();

  const idEdicao = document.getElementById("extintorIdEdicao").value;
  const tipo = document.getElementById("tipo").value;
  const local = document.getElementById("local").value;
  const validade = document.getElementById("validade").value;
  const numeroSerie = document.getElementById("numeroSerie").value;

  let extintores = obterExtintores();

  if (idEdicao) {
    extintores = extintores.map((item) =>
      item.id === Number(idEdicao) ? { ...item, tipo, local, validade, numeroSerie } : item
    );
    registrarHistorico("Extintores", "EdiÃ§Ã£o", `Extintor atualizado: ${tipo} - ${local}`);
    document.getElementById("mensagemExtintor").textContent = "Extintor atualizado com sucesso!";
  } else {
    const novo = {
      id: extintores.length ? Math.max(...extintores.map((item) => item.id)) + 1 : 1,
      tipo, local, validade, numeroSerie
    };
    extintores.push(novo);
    registrarHistorico("Extintores", "Cadastro", `Extintor cadastrado: ${tipo} - ${local}`);
    document.getElementById("mensagemExtintor").textContent = "Extintor cadastrado com sucesso!";
  }

  salvarExtintores(extintores);
  this.reset();
  document.getElementById("extintorIdEdicao").value = "";
  atualizarTudo();
});

document.getElementById("cancelarEdicao").addEventListener("click", function () {
  document.getElementById("formExtintor").reset();
  document.getElementById("extintorIdEdicao").value = "";
  document.getElementById("mensagemExtintor").textContent = "";
});

document.getElementById("formInspecao").addEventListener("submit", function (e) {
  e.preventDefault();

  const extintorId = Number(document.getElementById("inspecaoExtintor").value);
  const data = document.getElementById("dataInspecao").value;
  const responsavel = document.getElementById("responsavelInspecao").value;
  const resultado = document.getElementById("resultadoInspecao").value;
  const observacoes = document.getElementById("observacoesInspecao").value;

  const extintor = obterExtintores().find((item) => item.id === extintorId);
  if (!extintor) return;

  const inspecoes = obterInspecoes();
  inspecoes.push({
    extintorId,
    extintorNome: `${extintor.tipo} - ${extintor.local}`,
    data,
    responsavel,
    resultado,
    observacoes
  });

  salvarInspecoes(inspecoes);
  registrarHistorico("Extintores", "InspeÃ§Ã£o", `InspeÃ§Ã£o registrada para ${extintor.tipo} - ${extintor.local}`);
  this.reset();
  document.getElementById("mensagemInspecao").textContent = "InspeÃ§Ã£o registrada com sucesso!";
  atualizarTudo();
});

document.getElementById("formConfiguracoes").addEventListener("submit", function (e) {
  e.preventDefault();

  const nomeEmpresa = document.getElementById("nomeEmpresa").value;
  const diasAlerta = document.getElementById("diasAlerta").value;

  salvarConfig({ nomeEmpresa, diasAlerta: Number(diasAlerta) });
  registrarHistorico("Extintores", "ConfiguraÃ§Ã£o", `ConfiguraÃ§Ãµes atualizadas: ${nomeEmpresa}`);
  document.getElementById("mensagemConfig").textContent = "ConfiguraÃ§Ãµes salvas com sucesso!";
  atualizarTudo();
});

document.querySelectorAll(".menu-link").forEach((link) => {
  link.addEventListener("click", function (e) {
    e.preventDefault();
    mostrarSecao(this.dataset.section);
  });
});

document.getElementById("btnPdfExtintores")?.addEventListener("click", function () {
  const elemento = document.querySelector(".table-card");
  html2pdf().from(elemento).set({
    margin: 10,
    filename: "relatorio-extintores.pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
  }).save();

  registrarHistorico("Extintores", "PDF", "RelatÃ³rio de extintores gerado em PDF");
});

document.getElementById("btnExportarBackupExt")?.addEventListener("click", function () {
  exportarBackupCompleto();
  document.getElementById("mensagemBackupExt").textContent = "Backup exportado com sucesso!";
});

document.getElementById("arquivoBackupExt")?.addEventListener("change", function () {
  const arquivo = this.files[0];
  if (!arquivo) return;

  importarBackupCompleto(arquivo, function (sucesso) {
    document.getElementById("mensagemBackupExt").textContent = sucesso
      ? "Backup importado com sucesso!"
      : "Erro ao importar backup.";
    if (sucesso) {
      atualizarTudo();
      location.reload();
    }
  });
});

document.getElementById("fecharModalQrExt")?.addEventListener("click", function () {
  document.getElementById("modalQrExt").classList.add("hidden");
});

async function iniciarPainel() {
  try {
    await carregarDadosServidor();
  } catch (erro) {
    console.error("Erro ao carregar dados do painel:", erro);
  }

  atualizarTudo();
  mostrarSecao("dashboard");
}

iniciarPainel();
