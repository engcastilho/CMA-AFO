# Câmara AFO

App de bolso (PWA) da Câmara Municipal de Alta Floresta D'Oeste (RO).

Ele lê os dados públicos do [SAPL da Câmara](https://sapl.altaflorestadoeste.ro.leg.br) e mostra:

- **Hoje:** a próxima sessão em destaque, os números do ano, as matérias que você segue e as mais novas.
- **Sessões:** as sessões com pauta, ata e vídeo, as matérias lidas e votadas em cada uma e a presença dos vereadores.
- **Matérias:** busca por assunto ou número, com filtros por tipo, ano e autor. Cada matéria mostra a etapa em que está, autoria, relatoria, a tramitação completa e as votações, com o voto de cada vereador.
- **Câmara:** Mesa Diretora, comissões permanentes (composição, matérias que estão em cada comissão agora e reuniões com pauta e ata), vereadores e leis sancionadas.
- **Salvos:** matérias que você segue. Quando uma delas anda, aparece um ponto azul.

## Como instalar no iPhone

1. Abra o endereço do app no **Safari**.
2. Toque em **Compartilhar** (o quadrado com a seta para cima).
3. Toque em **Adicionar à Tela de Início**.

## Como funciona

- É um site estático (HTML, CSS e JavaScript puro), hospedado no GitHub Pages. Não precisa de servidor nem de build.
- Os dados vêm direto da API pública do SAPL (`/api/`), que libera acesso de outros sites (CORS).
- O service worker (`sw.js`) guarda o app e os últimos dados vistos, para abrir mesmo sem internet.
- Os favoritos ficam salvos só no aparelho (localStorage).

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | Estrutura da página e barra de abas |
| `styles.css` | Visual (tema escuro com as cores do município: verde, amarelo, azul e branco) |
| `app.js` | Telas, busca e acesso à API do SAPL |
| `sw.js` | Funcionamento offline |
| `manifest.webmanifest` | Nome, ícone e modo "app" ao instalar |
| `icons/` | Ícones do app |

App não oficial. Os dados são públicos e pertencem à Câmara Municipal de Alta Floresta D'Oeste.
