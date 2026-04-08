const CHAVE_HISTORICO_GERAL = "historico_geral_previna";

function obterHistoricoGeral() {
  return JSON.parse(localStorage.getItem(CHAVE_HISTORICO_GERAL)) || [];
}

function salvarHistoricoGeral(lista) {
  localStorage.setItem(CHAVE_HISTORICO_GERAL, JSON.stringify(lista));
}

function registrarHistorico(modulo, acao, descricao) {
  const historico = obterHistoricoGeral();

  historico.push({
    id: Date.now(),
    modulo,
    acao,
    descricao,
    dataHora: new Date().toLocaleString("pt-BR")
  });

  salvarHistoricoGeral(historico);
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

function exportarBackupCompleto() {
  const backup = {
    extintores_previna: JSON.parse(localStorage.getItem("extintores_previna")) || [],
    inspecoes_previna: JSON.parse(localStorage.getItem("inspecoes_previna")) || [],
    config_previna: JSON.parse(localStorage.getItem("config_previna")) || {},
    epi_funcionarios: JSON.parse(localStorage.getItem("epi_funcionarios")) || [],
    epi_itens: JSON.parse(localStorage.getItem("epi_itens")) || [],
    epi_retiradas: JSON.parse(localStorage.getItem("epi_retiradas")) || [],
    historico_geral_previna: JSON.parse(localStorage.getItem("historico_geral_previna")) || [],
    data_exportacao: new Date().toLocaleString("pt-BR")
  };

  baixarArquivo(
    "backup-previnase.json",
    JSON.stringify(backup, null, 2),
    "application/json"
  );

  registrarHistorico("Sistema", "Backup", "Backup completo exportado");
}

function importarBackupCompleto(arquivo, callback) {
  const leitor = new FileReader();

  leitor.onload = function (evento) {
    try {
      const dados = JSON.parse(evento.target.result);

      if (dados.extintores_previna) localStorage.setItem("extintores_previna", JSON.stringify(dados.extintores_previna));
      if (dados.inspecoes_previna) localStorage.setItem("inspecoes_previna", JSON.stringify(dados.inspecoes_previna));
      if (dados.config_previna) localStorage.setItem("config_previna", JSON.stringify(dados.config_previna));
      if (dados.epi_funcionarios) localStorage.setItem("epi_funcionarios", JSON.stringify(dados.epi_funcionarios));
      if (dados.epi_itens) localStorage.setItem("epi_itens", JSON.stringify(dados.epi_itens));
      if (dados.epi_retiradas) localStorage.setItem("epi_retiradas", JSON.stringify(dados.epi_retiradas));
      if (dados.historico_geral_previna) localStorage.setItem("historico_geral_previna", JSON.stringify(dados.historico_geral_previna));

      registrarHistorico("Sistema", "Backup", "Backup completo importado");
      if (callback) callback(true);
    } catch (erro) {
      if (callback) callback(false);
    }
  };

  leitor.readAsText(arquivo);
}

function gerarQrCodeNoElemento(elementoId, texto) {
  const elemento = document.getElementById(elementoId);
  elemento.innerHTML = "";

  new QRCode(elemento, {
    text: texto,
    width: 180,
    height: 180
  });
}