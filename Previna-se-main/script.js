const formLogin = document.getElementById("formLogin");
const mensagem = document.getElementById("mensagem");

formLogin.addEventListener("submit", async function (event) {
  event.preventDefault();

  const email = document.getElementById("email").value;
  const senha = document.getElementById("senha").value;

  try {
    const resposta = await fetch("/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, senha })
    });

    const dados = await resposta.json();

    if (dados.sucesso) {
      mensagem.style.color = "green";
      mensagem.textContent = dados.mensagem;

      setTimeout(() => {
        window.location.href = "/modulos";
      }, 1000);
    } else {
      mensagem.style.color = "red";
      mensagem.textContent = dados.mensagem;
    }
  } catch (erro) {
    mensagem.style.color = "red";
    mensagem.textContent = "Erro ao conectar com o servidor.";
    console.error(erro);
  }
});