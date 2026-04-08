const express = require("express");
const session = require("express-session");
const path = require("path");

const app = express();
const PORT = 3000;

const USUARIO_INTERNO = {
  email: "admin@previnase.com",
  senha: "123456"
};

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: "segredo-extintor",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  })
);


app.use(express.static(__dirname));

function protegerRota(req, res, next) {
  if (req.session.usuarioLogado) {
    next();
  } else {
    res.redirect("/");
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
    mensagem: "E-mail ou senha inválidos."
  });
});

app.get("/painel", protegerRota, (req, res) => {
  res.sendFile(path.join(__dirname, "painel.html"));
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.get("/modulos", protegerRota, (req, res) => {
  res.sendFile(path.join(__dirname, "modulos.html"));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);

});

