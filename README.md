# Câmara AFO

App de bolso (PWA) da Câmara Municipal de Alta Floresta D'Oeste (RO).

Ele lê os dados públicos do [SAPL da Câmara](https://sapl.altaflorestadoeste.ro.leg.br) e mostra:

- **Sessões:** as últimas sessões, com pauta, ata e vídeo, e as matérias lidas e votadas em cada uma.
- **Matérias:** busca por assunto ou número, com filtros por tipo, ano e autor. Cada matéria mostra autoria, situação atual, texto original em PDF e toda a tramitação.
- **Vereadores:** os vereadores da legislatura atual, com números de produção e as matérias mais recentes de cada um.
- **Salvos:** matérias que você acompanha. Quando uma delas anda, aparece o selo "Novidade".

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
