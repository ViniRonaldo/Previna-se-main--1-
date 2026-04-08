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

app.get("/painel", protegerRota, (req, res) => {
  res.sendFile(path.join(__dirname, "painel.html"));
});

app.get("/modulos", protegerRota, (req, res) => {
  res.sendFile(path.join(__dirname, "modulos.html"));
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
