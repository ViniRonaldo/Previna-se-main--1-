const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const USUARIO_INTERNO = {
  email: "admin@previnase.com",
  senha: "123456"
};

const dataDir = path.join(__dirname, ".server");
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, "previnase.db");
const db = new DatabaseSync(dbPath);

function initDatabase() {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS extintores (
      id INTEGER PRIMARY KEY,
      tipo TEXT NOT NULL,
      local TEXT NOT NULL,
      validade TEXT NOT NULL,
      numero_serie TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inspecoes (
      id INTEGER PRIMARY KEY,
      extintor_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      responsavel TEXT NOT NULL,
      resultado TEXT NOT NULL,
      observacoes TEXT DEFAULT "",
      FOREIGN KEY (extintor_id) REFERENCES extintores(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS configuracoes (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      nome_empresa TEXT NOT NULL,
      dias_alerta INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS historico (
      id INTEGER PRIMARY KEY,
      modulo TEXT NOT NULL,
      acao TEXT NOT NULL,
      descricao TEXT NOT NULL,
      data_hora TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS atestados_registros (
      id INTEGER PRIMARY KEY,
      matricula TEXT NOT NULL,
      nome TEXT NOT NULL,
      setor TEXT NOT NULL,
      tipo_atestado TEXT NOT NULL,
      dias_afastamento INTEGER NOT NULL DEFAULT 0,
      quantidade_atestados INTEGER NOT NULL DEFAULT 1,
      cid TEXT DEFAULT "",
      data_cadastro TEXT NOT NULL,
      data_retorno TEXT DEFAULT "",
      cargo TEXT DEFAULT "",
      empresa TEXT DEFAULT "",
      observacao TEXT DEFAULT "",
      mes TEXT NOT NULL,
      ano INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS atestados_historico (
      id INTEGER PRIMARY KEY,
      modulo TEXT NOT NULL,
      acao TEXT NOT NULL,
      descricao TEXT NOT NULL,
      data_hora TEXT NOT NULL
    );
  `);

  const totalExt = db.prepare("SELECT COUNT(*) AS total FROM extintores").get().total;
  if (totalExt === 0) {
    const insertExt = db.prepare(`
      INSERT INTO extintores (id, tipo, local, validade, numero_serie)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertExt.run(1, "Po Quimico", "Recepcao", "2026-04-15", "PQ-1001");
    insertExt.run(2, "CO2", "Almoxarifado", "2026-11-02", "CO2-2030");
    insertExt.run(3, "Agua Pressurizada", "Corredor A", "2026-03-28", "AG-3021");
  }

  const totalIns = db.prepare("SELECT COUNT(*) AS total FROM inspecoes").get().total;
  if (totalIns === 0) {
    db.prepare(`
      INSERT INTO inspecoes (id, extintor_id, data, responsavel, resultado, observacoes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(1, 1, "2026-03-01", "Carlos", "Aprovado", "Equipamento em bom estado");
  }

  const cfg = db.prepare("SELECT id FROM configuracoes WHERE id = 1").get();
  if (!cfg) {
    db.prepare(`
      INSERT INTO configuracoes (id, nome_empresa, dias_alerta)
      VALUES (1, ?, ?)
    `).run("Previna-se", 30);
  }

  const totalAtestados = db.prepare("SELECT COUNT(*) AS total FROM atestados_registros").get().total;
  if (totalAtestados === 0) {
    db.prepare(`
      INSERT INTO atestados_registros (
        id, matricula, nome, setor, tipo_atestado, dias_afastamento, quantidade_atestados,
        cid, data_cadastro, data_retorno, cargo, empresa, observacao, mes, ano
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      "1001",
      "Joao Silva",
      "ADM",
      "Medico",
      2,
      1,
      "J11",
      "2026-04-08",
      "2026-04-10",
      "Assistente",
      "Previna-se",
      "Acompanhamento inicial",
      "Abril",
      2026
    );
  }
}

initDatabase();

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "2mb" }));

app.use(
  session({
    secret: "segredo-extintor",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  })
);

app.use(express.static(__dirname, { dotfiles: "deny" }));

function protegerRota(req, res, next) {
  if (req.session.usuarioLogado) {
    next();
    return;
  }
  res.redirect("/");
}

function protegerApi(req, res, next) {
  if (req.session.usuarioLogado) {
    next();
    return;
  }
  res.status(401).json({
    sucesso: false,
    mensagem: "Sessao expirada. Faca login novamente."
  });
}

function normalizarConfig(config) {
  const nomeEmpresa = String(config?.nomeEmpresa || "Previna-se").trim() || "Previna-se";
  const diasAlertaRaw = Number(config?.diasAlerta);
  const diasAlerta = Number.isFinite(diasAlertaRaw) && diasAlertaRaw > 0 ? Math.floor(diasAlertaRaw) : 30;
  return { nomeEmpresa, diasAlerta };
}

function obterPainelDados() {
  const extintores = db.prepare(`
    SELECT id, tipo, local, validade, numero_serie AS numeroSerie
    FROM extintores
    ORDER BY id
  `).all();

  const inspecoes = db.prepare(`
    SELECT
      i.id,
      i.extintor_id AS extintorId,
      i.data,
      i.responsavel,
      i.resultado,
      i.observacoes
    FROM inspecoes i
    ORDER BY i.id
  `).all().map((item) => {
    const extintor = extintores.find((e) => e.id === item.extintorId);
    return {
      ...item,
      extintorNome: extintor ? `${extintor.tipo} - ${extintor.local}` : `Extintor ${item.extintorId}`
    };
  });

  const configRow = db.prepare(`
    SELECT nome_empresa AS nomeEmpresa, dias_alerta AS diasAlerta
    FROM configuracoes
    WHERE id = 1
  `).get();

  const historico = db.prepare(`
    SELECT id, modulo, acao, descricao, data_hora AS dataHora
    FROM historico
    ORDER BY id
  `).all();

  return {
    extintores,
    inspecoes,
    config: normalizarConfig(configRow || {}),
    historico
  };
}

function obterAdminBancoDados(limites = {}) {
  const limiteHistoricoRaw = Number(limites?.historico);
  const limiteInspecoesRaw = Number(limites?.inspecoes);
  const limiteHistorico = Number.isFinite(limiteHistoricoRaw) ? Math.max(10, Math.min(500, Math.floor(limiteHistoricoRaw))) : 150;
  const limiteInspecoes = Number.isFinite(limiteInspecoesRaw) ? Math.max(10, Math.min(500, Math.floor(limiteInspecoesRaw))) : 150;

  const resumo = {
    totalExtintores: db.prepare("SELECT COUNT(*) AS total FROM extintores").get().total,
    totalInspecoes: db.prepare("SELECT COUNT(*) AS total FROM inspecoes").get().total,
    totalHistorico: db.prepare("SELECT COUNT(*) AS total FROM historico").get().total
  };

  const config = db.prepare(`
    SELECT nome_empresa AS nomeEmpresa, dias_alerta AS diasAlerta
    FROM configuracoes
    WHERE id = 1
  `).get() || { nomeEmpresa: "Previna-se", diasAlerta: 30 };

  const extintores = db.prepare(`
    SELECT id, tipo, local, validade, numero_serie AS numeroSerie
    FROM extintores
    ORDER BY id DESC
  `).all();

  const inspecoes = db.prepare(`
    SELECT
      i.id,
      i.extintor_id AS extintorId,
      e.tipo AS extintorTipo,
      e.local AS extintorLocal,
      i.data,
      i.responsavel,
      i.resultado,
      i.observacoes
    FROM inspecoes i
    LEFT JOIN extintores e ON e.id = i.extintor_id
    ORDER BY i.id DESC
    LIMIT ?
  `).all(limiteInspecoes);

  const historico = db.prepare(`
    SELECT id, modulo, acao, descricao, data_hora AS dataHora
    FROM historico
    ORDER BY id DESC
    LIMIT ?
  `).all(limiteHistorico);

  return {
    resumo,
    config: normalizarConfig(config),
    extintores,
    inspecoes,
    historico
  };
}

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

function normalizarRegistroAtestado(item) {
  const matricula = String(item?.matricula || "").trim();
  const nome = String(item?.nome || "").trim();
  const setor = String(item?.setor || "").trim();
  const tipoAtestado = String(item?.tipoAtestado || item?.tipo_atestado || "Medico").trim();
  const diasAfastamentoRaw = Number(item?.diasAfastamento ?? item?.dias_afastamento);
  const quantidadeAtestadosRaw = Number(item?.quantidadeAtestados ?? item?.quantidade_atestados);
  const cid = String(item?.cid || "").trim();
  const dataCadastro = String(item?.dataCadastro || item?.data_cadastro || "").trim();
  const dataRetorno = String(item?.dataRetorno || item?.data_retorno || "").trim();
  const cargo = String(item?.cargo || "").trim();
  const empresa = String(item?.empresa || "").trim();
  const observacao = String(item?.observacao || "").trim();

  if (!matricula || !nome || !setor || !tipoAtestado || !dataCadastro) {
    return null;
  }

  const matchData = dataCadastro.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matchData) return null;

  const mesIndex = Number(matchData[2]) - 1;
  const anoDaData = Number(matchData[1]);
  const mes = String(item?.mes || MESES_PT[mesIndex] || "Janeiro").trim();
  const anoRaw = Number(item?.ano);
  const ano = Number.isFinite(anoRaw) ? Math.floor(anoRaw) : anoDaData;

  const diasAfastamento = Number.isFinite(diasAfastamentoRaw) ? Math.max(0, Math.floor(diasAfastamentoRaw)) : 0;
  const quantidadeAtestados = Number.isFinite(quantidadeAtestadosRaw) ? Math.max(0, Math.floor(quantidadeAtestadosRaw)) : 1;

  return {
    id: Number(item?.id),
    matricula,
    nome,
    setor,
    tipoAtestado,
    diasAfastamento,
    quantidadeAtestados,
    cid,
    dataCadastro,
    dataRetorno,
    cargo,
    empresa,
    observacao,
    mes,
    ano
  };
}

function obterAtestadosDados() {
  const registros = db.prepare(`
    SELECT
      id,
      matricula,
      nome,
      setor,
      tipo_atestado AS tipoAtestado,
      dias_afastamento AS diasAfastamento,
      quantidade_atestados AS quantidadeAtestados,
      cid,
      data_cadastro AS dataCadastro,
      data_retorno AS dataRetorno,
      cargo,
      empresa,
      observacao,
      mes,
      ano
    FROM atestados_registros
    ORDER BY id DESC
  `).all();

  const historico = db.prepare(`
    SELECT id, modulo, acao, descricao, data_hora AS dataHora
    FROM atestados_historico
    ORDER BY id DESC
  `).all();

  return { registros, historico };
}

function salvarAtestadosDados(payload) {
  const registros = Array.isArray(payload?.registros) ? payload.registros : [];
  const historico = Array.isArray(payload?.historico) ? payload.historico : [];

  const insertRegistroSemId = db.prepare(`
    INSERT INTO atestados_registros (
      matricula, nome, setor, tipo_atestado, dias_afastamento, quantidade_atestados, cid,
      data_cadastro, data_retorno, cargo, empresa, observacao, mes, ano
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRegistroComId = db.prepare(`
    INSERT INTO atestados_registros (
      id, matricula, nome, setor, tipo_atestado, dias_afastamento, quantidade_atestados, cid,
      data_cadastro, data_retorno, cargo, empresa, observacao, mes, ano
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertHistoricoSemId = db.prepare(`
    INSERT INTO atestados_historico (modulo, acao, descricao, data_hora)
    VALUES (?, ?, ?, ?)
  `);

  const insertHistoricoComId = db.prepare(`
    INSERT INTO atestados_historico (id, modulo, acao, descricao, data_hora)
    VALUES (?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM atestados_registros;");
    db.exec("DELETE FROM atestados_historico;");

    for (const item of registros) {
      const reg = normalizarRegistroAtestado(item);
      if (!reg) continue;

      if (Number.isInteger(reg.id) && reg.id > 0) {
        insertRegistroComId.run(
          reg.id,
          reg.matricula,
          reg.nome,
          reg.setor,
          reg.tipoAtestado,
          reg.diasAfastamento,
          reg.quantidadeAtestados,
          reg.cid,
          reg.dataCadastro,
          reg.dataRetorno,
          reg.cargo,
          reg.empresa,
          reg.observacao,
          reg.mes,
          reg.ano
        );
      } else {
        insertRegistroSemId.run(
          reg.matricula,
          reg.nome,
          reg.setor,
          reg.tipoAtestado,
          reg.diasAfastamento,
          reg.quantidadeAtestados,
          reg.cid,
          reg.dataCadastro,
          reg.dataRetorno,
          reg.cargo,
          reg.empresa,
          reg.observacao,
          reg.mes,
          reg.ano
        );
      }
    }

    for (const item of historico) {
      const modulo = String(item?.modulo || "").trim();
      const acao = String(item?.acao || "").trim();
      const descricao = String(item?.descricao || "").trim();
      const dataHora = String(item?.dataHora || new Date().toLocaleString("pt-BR")).trim();

      if (!modulo || !acao || !descricao) continue;

      const id = Number(item?.id);
      if (Number.isInteger(id) && id > 0) {
        insertHistoricoComId.run(id, modulo, acao, descricao, dataHora);
      } else {
        insertHistoricoSemId.run(modulo, acao, descricao, dataHora);
      }
    }

    db.exec("COMMIT");
  } catch (erro) {
    db.exec("ROLLBACK");
    throw erro;
  }
}

function salvarPainelDados(payload) {
  const extintores = Array.isArray(payload?.extintores) ? payload.extintores : [];
  const inspecoes = Array.isArray(payload?.inspecoes) ? payload.inspecoes : [];
  const historico = Array.isArray(payload?.historico) ? payload.historico : [];
  const config = normalizarConfig(payload?.config || {});

  const insertExtSemId = db.prepare(`
    INSERT INTO extintores (tipo, local, validade, numero_serie)
    VALUES (?, ?, ?, ?)
  `);
  const insertExtComId = db.prepare(`
    INSERT INTO extintores (id, tipo, local, validade, numero_serie)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertInsSemId = db.prepare(`
    INSERT INTO inspecoes (extintor_id, data, responsavel, resultado, observacoes)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertInsComId = db.prepare(`
    INSERT INTO inspecoes (id, extintor_id, data, responsavel, resultado, observacoes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertHistSemId = db.prepare(`
    INSERT INTO historico (modulo, acao, descricao, data_hora)
    VALUES (?, ?, ?, ?)
  `);
  const insertHistComId = db.prepare(`
    INSERT INTO historico (id, modulo, acao, descricao, data_hora)
    VALUES (?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM inspecoes;");
    db.exec("DELETE FROM extintores;");
    db.exec("DELETE FROM historico;");

    for (const item of extintores) {
      const tipo = String(item?.tipo || "").trim();
      const local = String(item?.local || "").trim();
      const validade = String(item?.validade || "").trim();
      const numeroSerie = String(item?.numeroSerie || item?.numero_serie || "").trim();
      if (!tipo || !local || !validade || !numeroSerie) {
        continue;
      }

      const id = Number(item?.id);
      if (Number.isInteger(id) && id > 0) {
        insertExtComId.run(id, tipo, local, validade, numeroSerie);
      } else {
        insertExtSemId.run(tipo, local, validade, numeroSerie);
      }
    }

    const idsExtintores = new Set(
      db.prepare("SELECT id FROM extintores").all().map((row) => Number(row.id))
    );

    for (const item of inspecoes) {
      const extintorId = Number(item?.extintorId);
      const data = String(item?.data || "").trim();
      const responsavel = String(item?.responsavel || "").trim();
      const resultado = String(item?.resultado || "").trim();
      const observacoes = String(item?.observacoes || "").trim();

      if (!idsExtintores.has(extintorId) || !data || !responsavel || !resultado) {
        continue;
      }

      const id = Number(item?.id);
      if (Number.isInteger(id) && id > 0) {
        insertInsComId.run(id, extintorId, data, responsavel, resultado, observacoes);
      } else {
        insertInsSemId.run(extintorId, data, responsavel, resultado, observacoes);
      }
    }

    for (const item of historico) {
      const modulo = String(item?.modulo || "").trim();
      const acao = String(item?.acao || "").trim();
      const descricao = String(item?.descricao || "").trim();
      const dataHora = String(item?.dataHora || new Date().toLocaleString("pt-BR")).trim();

      if (!modulo || !acao || !descricao) {
        continue;
      }

      const id = Number(item?.id);
      if (Number.isInteger(id) && id > 0) {
        insertHistComId.run(id, modulo, acao, descricao, dataHora);
      } else {
        insertHistSemId.run(modulo, acao, descricao, dataHora);
      }
    }

    db.prepare(`
      INSERT INTO configuracoes (id, nome_empresa, dias_alerta)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        nome_empresa = excluded.nome_empresa,
        dias_alerta = excluded.dias_alerta
    `).run(config.nomeEmpresa, config.diasAlerta);

    db.exec("COMMIT");
  } catch (erro) {
    db.exec("ROLLBACK");
    throw erro;
  }
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/login", (req, res) => {
  const { email, senha } = req.body;

  if (email === USUARIO_INTERNO.email && senha === USUARIO_INTERNO.senha) {
    req.session.usuarioLogado = true;
    req.session.usuarioEmail = email;

    return res.json({
      sucesso: true,
      mensagem: "Login realizado com sucesso!"
    });
  }

  return res.status(401).json({
    sucesso: false,
    mensagem: "E-mail ou senha invalidos."
  });
});

app.get("/api/painel-dados", protegerApi, (req, res) => {
  try {
    return res.json({
      sucesso: true,
      dados: obterPainelDados()
    });
  } catch (erro) {
    console.error("Erro GET /api/painel-dados:", erro);
    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao carregar dados do painel."
    });
  }
});

app.get("/api/admin-banco", protegerApi, (req, res) => {
  try {
    return res.json({
      sucesso: true,
      dados: obterAdminBancoDados({
        historico: req.query.limiteHistorico,
        inspecoes: req.query.limiteInspecoes
      })
    });
  } catch (erro) {
    console.error("Erro GET /api/admin-banco:", erro);
    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao carregar dados do banco."
    });
  }
});

app.get("/api/atestados-dados", protegerApi, (req, res) => {
  try {
    return res.json({
      sucesso: true,
      dados: obterAtestadosDados()
    });
  } catch (erro) {
    console.error("Erro GET /api/atestados-dados:", erro);
    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao carregar dados de atestados."
    });
  }
});

app.put("/api/painel-dados", protegerApi, (req, res) => {
  try {
    salvarPainelDados(req.body || {});
    return res.json({
      sucesso: true,
      mensagem: "Dados salvos com sucesso."
    });
  } catch (erro) {
    console.error("Erro PUT /api/painel-dados:", erro);
    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao salvar dados do painel."
    });
  }
});

app.put("/api/atestados-dados", protegerApi, (req, res) => {
  try {
    salvarAtestadosDados(req.body || {});
    return res.json({
      sucesso: true,
      mensagem: "Dados de atestados salvos com sucesso."
    });
  } catch (erro) {
    console.error("Erro PUT /api/atestados-dados:", erro);
    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao salvar dados de atestados."
    });
  }
});

app.get("/painel", protegerRota, (req, res) => {
  res.sendFile(path.join(__dirname, "painel.html"));
});

app.get("/atestados", protegerRota, (req, res) => {
  res.sendFile(path.join(__dirname, "atestados.html"));
});

app.get("/modulos", protegerRota, (req, res) => {
  res.sendFile(path.join(__dirname, "modulos.html"));
});

app.get("/admin-banco", protegerRota, (req, res) => {
  res.sendFile(path.join(__dirname, "admin-banco.html"));
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
