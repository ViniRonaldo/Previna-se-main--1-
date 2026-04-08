let dadosBanco = null;

function formatarDataISO(data) {
  if (!data || typeof data !== "string" || !data.includes("-")) return data || "-";
  const partes = data.split("-");
  if (partes.length !== 3) return data;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function escapeHtml(texto) {
  return String(texto ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function atualizarMensagem(texto, erro = false) {
  const el = document.getElementById("mensagem");
  el.textContent = texto;
  el.style.color = erro ? "#b91c1c" : "#6b7280";
}

function renderResumo(dados) {
  const resumo = dados?.resumo || {};
  const config = dados?.config || {};

  document.getElementById("resumoExtintores").textContent = resumo.totalExtintores ?? 0;
  document.getElementById("resumoInspecoes").textContent = resumo.totalInspecoes ?? 0;
  document.getElementById("resumoHistorico").textContent = resumo.totalHistorico ?? 0;
  document.getElementById("resumoDiasAlerta").textContent = config.diasAlerta ?? 0;
  document.getElementById("cfgNomeEmpresa").textContent = config.nomeEmpresa || "-";
  document.getElementById("cfgDiasAlerta").textContent = config.diasAlerta ?? "-";
}

function renderExtintores(lista) {
  const tbody = document.getElementById("tabelaExtintores");
  if (!Array.isArray(lista) || lista.length === 0) {
    tbody.innerHTML = "<tr><td colspan=\"5\">Nenhum registro.</td></tr>";
    return;
  }

  tbody.innerHTML = lista.map((item) => `
    <tr>
      <td>${escapeHtml(item.id)}</td>
      <td>${escapeHtml(item.tipo)}</td>
      <td>${escapeHtml(item.local)}</td>
      <td>${escapeHtml(formatarDataISO(item.validade))}</td>
      <td>${escapeHtml(item.numeroSerie)}</td>
    </tr>
  `).join("");
}

function renderInspecoes(lista) {
  const tbody = document.getElementById("tabelaInspecoes");
  if (!Array.isArray(lista) || lista.length === 0) {
    tbody.innerHTML = "<tr><td colspan=\"6\">Nenhum registro.</td></tr>";
    return;
  }

  tbody.innerHTML = lista.map((item) => `
    <tr>
      <td>${escapeHtml(item.id)}</td>
      <td>${escapeHtml((item.extintorTipo || "-") + " - " + (item.extintorLocal || "-"))}</td>
      <td>${escapeHtml(formatarDataISO(item.data))}</td>
      <td>${escapeHtml(item.responsavel)}</td>
      <td>${escapeHtml(item.resultado)}</td>
      <td>${escapeHtml(item.observacoes || "-")}</td>
    </tr>
  `).join("");
}

function renderHistorico(lista) {
  const tbody = document.getElementById("tabelaHistorico");
  if (!Array.isArray(lista) || lista.length === 0) {
    tbody.innerHTML = "<tr><td colspan=\"5\">Nenhum registro.</td></tr>";
    return;
  }

  tbody.innerHTML = lista.map((item) => `
    <tr>
      <td>${escapeHtml(item.id)}</td>
      <td>${escapeHtml(item.modulo)}</td>
      <td>${escapeHtml(item.acao)}</td>
      <td>${escapeHtml(item.descricao)}</td>
      <td>${escapeHtml(item.dataHora)}</td>
    </tr>
  `).join("");
}

function renderTudo(dados) {
  renderResumo(dados);
  renderExtintores(dados?.extintores || []);
  renderInspecoes(dados?.inspecoes || []);
  renderHistorico(dados?.historico || []);
}

async function carregarBanco() {
  atualizarMensagem("Carregando dados do banco...");

  try {
    const resposta = await fetch("/api/admin-banco?limiteHistorico=200&limiteInspecoes=200", {
      headers: { Accept: "application/json" }
    });

    if (resposta.status === 401) {
      window.location.href = "/";
      return;
    }

    if (!resposta.ok) {
      throw new Error("Falha ao carregar o banco.");
    }

    const payload = await resposta.json();
    dadosBanco = payload?.dados || null;
    renderTudo(dadosBanco || {});
    atualizarMensagem("Dados carregados com sucesso.");
  } catch (erro) {
    console.error(erro);
    atualizarMensagem("Nao foi possivel carregar os dados do banco.", true);
  }
}

function exportarJson() {
  if (!dadosBanco) {
    atualizarMensagem("Carregue os dados antes de exportar.", true);
    return;
  }

  const conteudo = JSON.stringify(dadosBanco, null, 2);
  const blob = new Blob([conteudo], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "admin-banco-previnase.json";
  a.click();
  URL.revokeObjectURL(url);
  atualizarMensagem("JSON exportado com sucesso.");
}

document.getElementById("btnAtualizar").addEventListener("click", carregarBanco);
document.getElementById("btnExportarJson").addEventListener("click", exportarJson);

carregarBanco();
