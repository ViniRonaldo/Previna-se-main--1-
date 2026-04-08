const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro"
];

let registrosAt = [];
let historicoAt = [];
let graficoMes = null;
let relatorioCache = [];
let persistenciaTimer = null;
let persistenciaEmAndamento = false;

function hojeISO() {
  return new Date().toISOString().split("T")[0];
}

function formatarDataBR(data) {
  if (!data || !String(data).includes("-")) return data || "-";
  const [ano, mes, dia] = String(data).split("-");
  return `${dia}/${mes}/${ano}`;
}

function obterMesPorData(data) {
  if (!data || !String(data).includes("-")) return "Janeiro";
  const partes = String(data).split("-");
  const idx = Number(partes[1]) - 1;
  return MESES_PT[idx] || "Janeiro";
}

function baixarArquivo(nome, conteudo, tipo = "application/json") {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
}

function definirMensagem(id, texto, cor = "#15803d") {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.color = cor;
  el.textContent = texto;
}

async function carregarDadosServidor() {
  const resposta = await fetch("/api/atestados-dados", {
    headers: { Accept: "application/json" }
  });

  if (resposta.status === 401) {
    window.location.href = "/";
    return;
  }

  if (!resposta.ok) {
    throw new Error("Nao foi possivel carregar os dados de atestados.");
  }

  const payload = await resposta.json();
  const dados = payload?.dados || {};
  registrosAt = Array.isArray(dados.registros) ? dados.registros : [];
  historicoAt = Array.isArray(dados.historico) ? dados.historico : [];
}

async function persistirDadosServidor() {
  if (persistenciaEmAndamento) return;
  persistenciaEmAndamento = true;

  try {
    await fetch("/api/atestados-dados", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        registros: registrosAt,
        historico: historicoAt
      })
    });
  } catch (erro) {
    console.error("Erro ao salvar atestados:", erro);
  } finally {
    persistenciaEmAndamento = false;
  }
}

function agendarPersistencia() {
  clearTimeout(persistenciaTimer);
  persistenciaTimer = setTimeout(() => {
    persistirDadosServidor();
  }, 300);
}

function registrarHistorico(acao, descricao) {
  historicoAt.push({
    id: Date.now(),
    modulo: "Atestados",
    acao,
    descricao,
    dataHora: new Date().toLocaleString("pt-BR")
  });
  agendarPersistencia();
}

function calcularAlertas(registros) {
  const porFuncionario = {};
  registros.forEach((r) => {
    const chave = r.matricula || r.nome;
    if (!porFuncionario[chave]) {
      porFuncionario[chave] = { dias: 0, atestados: 0 };
    }
    porFuncionario[chave].dias += Number(r.diasAfastamento || 0);
    porFuncionario[chave].atestados += Number(r.quantidadeAtestados || 0);
  });

  let alertas = 0;
  Object.values(porFuncionario).forEach((item) => {
    if (item.dias >= 10) alertas += 1;
    if (item.atestados >= 3) alertas += 1;
  });
  return alertas;
}

function renderGraficoMes() {
  const canvas = document.getElementById("graficoAtestadosMes");
  if (!canvas) return;

  const contagem = new Map(MESES_PT.map((m) => [m, 0]));
  registrosAt.forEach((r) => {
    const mes = r.mes || obterMesPorData(r.dataCadastro);
    contagem.set(mes, (contagem.get(mes) || 0) + Number(r.quantidadeAtestados || 0));
  });

  if (graficoMes) graficoMes.destroy();

  graficoMes = new Chart(canvas, {
    type: "bar",
    data: {
      labels: MESES_PT,
      datasets: [{
        label: "Atestados",
        data: MESES_PT.map((mes) => contagem.get(mes) || 0),
        backgroundColor: "#b91c1c",
        borderRadius: 8,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: "#f1f5f9" } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderDashboard() {
  const totalRegistros = registrosAt.length;
  const totalDias = registrosAt.reduce((s, r) => s + Number(r.diasAfastamento || 0), 0);
  const funcionarios = new Set(registrosAt.map((r) => r.matricula || r.nome)).size;
  const alertas = calcularAlertas(registrosAt);

  document.getElementById("totalRegistrosAt").textContent = totalRegistros;
  document.getElementById("totalDiasAt").textContent = totalDias;
  document.getElementById("totalAlertasAt").textContent = alertas;
  document.getElementById("totalFuncionariosAt").textContent = funcionarios;

  const tbody = document.getElementById("tabelaUltimosAt");
  const ultimos = registrosAt.slice().sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 6);
  tbody.innerHTML = "";
  if (ultimos.length === 0) {
    tbody.innerHTML = "<tr><td colspan=\"4\">Nenhum registro encontrado.</td></tr>";
  } else {
    ultimos.forEach((r) => {
      tbody.innerHTML += `
        <tr>
          <td>${r.nome}</td>
          <td>${r.setor}</td>
          <td>${r.diasAfastamento || 0}</td>
          <td>${formatarDataBR(r.dataCadastro)}</td>
        </tr>
      `;
    });
  }

  renderGraficoMes();
}

function obterRegistrosFiltradosCadastro() {
  const filtroNome = (document.getElementById("filtroNomeAt").value || "").toLowerCase().trim();
  const filtroSetor = (document.getElementById("filtroSetorAt").value || "").toLowerCase().trim();
  return registrosAt.filter((r) => {
    const matchNome = !filtroNome || String(r.nome || "").toLowerCase().includes(filtroNome);
    const matchSetor = !filtroSetor || String(r.setor || "").toLowerCase().includes(filtroSetor);
    return matchNome && matchSetor;
  });
}

function renderTabelaCadastro() {
  const tbody = document.getElementById("tabelaAtestados");
  const lista = obterRegistrosFiltradosCadastro();

  tbody.innerHTML = "";
  if (lista.length === 0) {
    tbody.innerHTML = "<tr><td colspan=\"8\">Nenhum registro encontrado.</td></tr>";
    return;
  }

  lista.slice().sort((a, b) => Number(b.id) - Number(a.id)).forEach((r) => {
    tbody.innerHTML += `
      <tr>
        <td>${r.matricula}</td>
        <td>${r.nome}</td>
        <td>${r.setor}</td>
        <td>${r.tipoAtestado}</td>
        <td>${r.diasAfastamento || 0}</td>
        <td>${r.quantidadeAtestados || 0}</td>
        <td>${formatarDataBR(r.dataCadastro)}</td>
        <td>
          <button class="btn-acao btn-editar" onclick="editarAtestado(${r.id})">Editar</button>
          <button class="btn-acao btn-excluir" onclick="excluirAtestado(${r.id})">Excluir</button>
        </td>
      </tr>
    `;
  });
}

function statusFuncionario(totalDias, totalAtestados) {
  if (totalDias >= 10 || totalAtestados >= 3) return "<span class=\"status status-danger\">Critico</span>";
  if (totalDias >= 5 || totalAtestados >= 2) return "<span class=\"status status-warning\">Atencao</span>";
  return "<span class=\"status status-ok\">Normal</span>";
}

function renderFuncionarios() {
  const busca = (document.getElementById("buscaFuncionarioAt").value || "").toLowerCase().trim();
  const mapa = {};

  registrosAt.forEach((r) => {
    const chave = r.matricula || r.nome;
    if (!mapa[chave]) {
      mapa[chave] = {
        matricula: r.matricula,
        nome: r.nome,
        setor: r.setor,
        totalDias: 0,
        totalAtestados: 0
      };
    }
    mapa[chave].totalDias += Number(r.diasAfastamento || 0);
    mapa[chave].totalAtestados += Number(r.quantidadeAtestados || 0);
  });

  let lista = Object.values(mapa);
  if (busca) {
    lista = lista.filter((f) => {
      const alvo = `${f.matricula} ${f.nome} ${f.setor}`.toLowerCase();
      return alvo.includes(busca);
    });
  }

  lista.sort((a, b) => (b.totalDias - a.totalDias) || (b.totalAtestados - a.totalAtestados));

  const tbody = document.getElementById("tabelaFuncionariosAt");
  tbody.innerHTML = "";
  if (lista.length === 0) {
    tbody.innerHTML = "<tr><td colspan=\"6\">Nenhum funcionario encontrado.</td></tr>";
    return;
  }

  lista.forEach((f) => {
    tbody.innerHTML += `
      <tr>
        <td>${f.matricula}</td>
        <td>${f.nome}</td>
        <td>${f.setor}</td>
        <td>${f.totalDias}</td>
        <td>${f.totalAtestados}</td>
        <td>${statusFuncionario(f.totalDias, f.totalAtestados)}</td>
      </tr>
    `;
  });
}

function obterRegistrosRelatorio() {
  const mes = document.getElementById("relMesAt").value;
  const ano = (document.getElementById("relAnoAt").value || "").trim();
  const setor = (document.getElementById("relSetorAt").value || "").toLowerCase().trim();

  return registrosAt.filter((r) => {
    const matchMes = !mes || (r.mes === mes);
    const matchAno = !ano || String(r.ano) === String(ano);
    const matchSetor = !setor || String(r.setor || "").toLowerCase().includes(setor);
    return matchMes && matchAno && matchSetor;
  });
}

function renderRelatorio() {
  relatorioCache = obterRegistrosRelatorio();

  const totalReg = relatorioCache.length;
  const totalDias = relatorioCache.reduce((s, r) => s + Number(r.diasAfastamento || 0), 0);
  const totalFunc = new Set(relatorioCache.map((r) => r.matricula || r.nome)).size;

  document.getElementById("relTotalRegAt").textContent = totalReg;
  document.getElementById("relTotalDiasAt").textContent = totalDias;
  document.getElementById("relTotalFuncAt").textContent = totalFunc;

  const tbody = document.getElementById("tabelaRelatorioAt");
  tbody.innerHTML = "";
  if (relatorioCache.length === 0) {
    tbody.innerHTML = "<tr><td colspan=\"7\">Nenhum registro para os filtros selecionados.</td></tr>";
    return;
  }

  relatorioCache.slice().sort((a, b) => Number(b.id) - Number(a.id)).forEach((r) => {
    tbody.innerHTML += `
      <tr>
        <td>${r.matricula}</td>
        <td>${r.nome}</td>
        <td>${r.setor}</td>
        <td>${r.tipoAtestado}</td>
        <td>${r.diasAfastamento || 0}</td>
        <td>${r.quantidadeAtestados || 0}</td>
        <td>${formatarDataBR(r.dataCadastro)}</td>
      </tr>
    `;
  });
}

function renderHistorico() {
  const tbody = document.getElementById("tabelaHistoricoAt");
  const lista = historicoAt.slice().sort((a, b) => Number(b.id) - Number(a.id));
  tbody.innerHTML = "";

  if (lista.length === 0) {
    tbody.innerHTML = "<tr><td colspan=\"4\">Nenhuma movimentacao registrada.</td></tr>";
    return;
  }

  lista.forEach((item) => {
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

function mostrarSecao(secao) {
  document.querySelectorAll(".section-content").forEach((item) => item.classList.remove("active-section"));
  document.querySelectorAll(".menu-link").forEach((item) => item.classList.remove("active"));

  document.getElementById(`sec-${secao}`).classList.add("active-section");
  document.querySelector(`.menu-link[data-section="${secao}"]`).classList.add("active");

  const titulos = {
    dashboard: ["Controle de Atestados", "Acompanhe afastamentos, alertas e relatorios da equipe."],
    cadastro: ["Cadastro de atestados", "Registre novos atestados e gerencie os existentes."],
    funcionarios: ["Funcionarios", "Visao consolidada por colaborador."],
    relatorios: ["Relatorios", "Filtre e exporte os dados de atestados."],
    historico: ["Historico", "Acompanhe movimentacoes do modulo."],
    backup: ["Backup", "Exporte ou importe os dados de atestados."]
  };

  document.getElementById("tituloSecao").textContent = titulos[secao][0];
  document.getElementById("subtituloSecao").textContent = titulos[secao][1];
}

function limparFormularioAtestado(limparMensagem = true) {
  document.getElementById("formAtestado").reset();
  document.getElementById("atestadoIdEdicao").value = "";
  document.getElementById("dataCadastroAt").value = hojeISO();
  if (limparMensagem) {
    document.getElementById("mensagemAtestado").textContent = "";
  }
}

function atualizarTudo() {
  renderDashboard();
  renderTabelaCadastro();
  renderFuncionarios();
  renderRelatorio();
  renderHistorico();
}

window.editarAtestado = function editarAtestado(id) {
  const registro = registrosAt.find((r) => Number(r.id) === Number(id));
  if (!registro) return;

  document.getElementById("atestadoIdEdicao").value = registro.id;
  document.getElementById("matriculaAt").value = registro.matricula || "";
  document.getElementById("nomeAt").value = registro.nome || "";
  document.getElementById("setorAt").value = registro.setor || "";
  document.getElementById("tipoAt").value = registro.tipoAtestado || "Medico";
  document.getElementById("diasAt").value = registro.diasAfastamento ?? 0;
  document.getElementById("qtdAt").value = registro.quantidadeAtestados ?? 1;
  document.getElementById("cidAt").value = registro.cid || "";
  document.getElementById("dataCadastroAt").value = registro.dataCadastro || "";
  document.getElementById("dataRetornoAt").value = registro.dataRetorno || "";
  document.getElementById("cargoAt").value = registro.cargo || "";
  document.getElementById("empresaAt").value = registro.empresa || "Previna-se";
  document.getElementById("obsAt").value = registro.observacao || "";

  mostrarSecao("cadastro");
  definirMensagem("mensagemAtestado", "Editando registro selecionado.", "#1d4ed8");
};

window.excluirAtestado = function excluirAtestado(id) {
  if (!confirm("Deseja excluir este registro?")) return;

  const alvo = registrosAt.find((r) => Number(r.id) === Number(id));
  registrosAt = registrosAt.filter((r) => Number(r.id) !== Number(id));
  registrarHistorico("Exclusao", `Registro removido: ${alvo ? alvo.nome : `ID ${id}`}`);
  agendarPersistencia();
  atualizarTudo();
};

document.getElementById("formAtestado").addEventListener("submit", (e) => {
  e.preventDefault();

  const idEdicao = Number(document.getElementById("atestadoIdEdicao").value);
  const dataCadastro = document.getElementById("dataCadastroAt").value;
  const mes = obterMesPorData(dataCadastro);
  const ano = Number((dataCadastro || "0000-01-01").split("-")[0]);

  const registro = {
    id: idEdicao || (registrosAt.length ? Math.max(...registrosAt.map((r) => Number(r.id) || 0)) + 1 : 1),
    matricula: document.getElementById("matriculaAt").value.trim(),
    nome: document.getElementById("nomeAt").value.trim(),
    setor: document.getElementById("setorAt").value.trim(),
    tipoAtestado: document.getElementById("tipoAt").value,
    diasAfastamento: Number(document.getElementById("diasAt").value) || 0,
    quantidadeAtestados: Number(document.getElementById("qtdAt").value) || 1,
    cid: document.getElementById("cidAt").value.trim(),
    dataCadastro,
    dataRetorno: document.getElementById("dataRetornoAt").value,
    cargo: document.getElementById("cargoAt").value.trim(),
    empresa: document.getElementById("empresaAt").value.trim(),
    observacao: document.getElementById("obsAt").value.trim(),
    mes,
    ano: Number.isFinite(ano) ? ano : new Date().getFullYear()
  };

  if (!registro.matricula || !registro.nome || !registro.setor || !registro.dataCadastro) {
    definirMensagem("mensagemAtestado", "Preencha matricula, nome, setor e data.", "#dc2626");
    return;
  }

  let mensagemSucesso = "";
  if (idEdicao) {
    registrosAt = registrosAt.map((r) => (Number(r.id) === idEdicao ? registro : r));
    registrarHistorico("Edicao", `Registro atualizado para ${registro.nome}`);
    mensagemSucesso = "Registro atualizado com sucesso.";
  } else {
    registrosAt.push(registro);
    registrarHistorico("Cadastro", `Registro criado para ${registro.nome}`);
    mensagemSucesso = "Registro cadastrado com sucesso.";
  }

  agendarPersistencia();
  limparFormularioAtestado(false);
  definirMensagem("mensagemAtestado", mensagemSucesso);
  atualizarTudo();
});

document.getElementById("cancelarEdicaoAt").addEventListener("click", () => {
  limparFormularioAtestado();
});

document.getElementById("filtroNomeAt").addEventListener("input", renderTabelaCadastro);
document.getElementById("filtroSetorAt").addEventListener("input", renderTabelaCadastro);
document.getElementById("buscaFuncionarioAt").addEventListener("input", renderFuncionarios);

document.getElementById("btnGerarRelatorioAt").addEventListener("click", renderRelatorio);

document.getElementById("btnExportarCsvAt").addEventListener("click", () => {
  if (!relatorioCache.length) {
    renderRelatorio();
  }

  if (!relatorioCache.length) {
    alert("Nenhum dado para exportar.");
    return;
  }

  const header = ["Matricula", "Nome", "Setor", "Tipo", "Dias", "Atestados", "Data", "CID"].join(";");
  const rows = relatorioCache.map((r) => [
    r.matricula,
    r.nome,
    r.setor,
    r.tipoAtestado,
    r.diasAfastamento || 0,
    r.quantidadeAtestados || 0,
    formatarDataBR(r.dataCadastro),
    r.cid || ""
  ].join(";"));

  const csv = "\uFEFF" + [header, ...rows].join("\n");
  baixarArquivo(`relatorio-atestados-${hojeISO()}.csv`, csv, "text/csv;charset=utf-8;");
  registrarHistorico("Exportacao", "Relatorio CSV exportado");
});

document.getElementById("btnExportarBackupAt").addEventListener("click", () => {
  const backup = {
    registros: registrosAt,
    historico: historicoAt,
    dataExportacao: new Date().toLocaleString("pt-BR")
  };
  baixarArquivo("backup-atestados-previnase.json", JSON.stringify(backup, null, 2));
  registrarHistorico("Backup", "Backup de atestados exportado");
  definirMensagem("mensagemBackupAt", "Backup exportado com sucesso.");
});

document.getElementById("arquivoBackupAt").addEventListener("change", (e) => {
  const arquivo = e.target.files?.[0];
  if (!arquivo) return;

  const leitor = new FileReader();
  leitor.onload = () => {
    try {
      const dados = JSON.parse(leitor.result);
      registrosAt = Array.isArray(dados.registros) ? dados.registros : [];
      historicoAt = Array.isArray(dados.historico) ? dados.historico : [];
      registrarHistorico("Backup", "Backup de atestados importado");
      agendarPersistencia();
      atualizarTudo();
      definirMensagem("mensagemBackupAt", "Backup importado com sucesso.");
    } catch (erro) {
      definirMensagem("mensagemBackupAt", "Erro ao importar backup.", "#dc2626");
    }
  };
  leitor.readAsText(arquivo);
});

document.querySelectorAll(".menu-link").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    mostrarSecao(link.dataset.section);
  });
});

async function iniciarModuloAtestados() {
  document.getElementById("dataCadastroAt").value = hojeISO();
  document.getElementById("relAnoAt").value = new Date().getFullYear();

  try {
    await carregarDadosServidor();
  } catch (erro) {
    console.error(erro);
    definirMensagem("mensagemAtestado", "Nao foi possivel carregar os dados.", "#dc2626");
  }

  atualizarTudo();
  mostrarSecao("dashboard");
}

iniciarModuloAtestados();
