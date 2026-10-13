# 2 Apostascaixa

Crie um aplicativo web completo, moderno e otimizado para celular (PWA instalável).



Nome do app: Loterias Caixa Gerador



Funcionalidades obrigatórias:



1. Gerador de jogos das loterias da Caixa:

- Mega-Sena

- Lotofácil

- Quina

- Lotomania

- Timemania

- Dupla Sena

- Dia de Sorte

- Super Sete

- +Milionária



O usuário deve poder escolher:

- A loteria

- Quantidade de jogos (1, 2, 3, 5 ou 10)

- Método de geração: Aleatório, Equilibrado (pares e ímpares), Por Soma, Frequência



Mostrar os números gerados em bolinhas verdes.

Ter botão grande e fácil de "Compartilhar no WhatsApp".



2. Aba de Resultados:

- Mostrar o último resultado de cada loteria

- Números sorteados

- Quantidade de ganhadores do prêmio principal

- Local/estado dos ganhadores (ex: MG, SP, RJ, BA, Canal Eletrônico, São Paulo - SP)

- Se tiver vários locais, mostrar todos (exemplo: 1x MG • 2x SP • 1x Canal Eletrônico)

- Se não tiver informação de local, escrever "Local não informado"

- Botão de atualizar resultados



Usar APIs públicas de resultados das loterias da Caixa. Procurar pelos campos: localGanhadores, estadosPremiados, listaMunicipioUFGanhadores ou similares.



3. Design:

- Mobile-first, moderno e limpo

- Cores principais em verde

- Tema claro e tema escuro (com botão para alternar)

- Fácil de usar com uma mão só



4. PWA completo:

- Deve ser possível instalar no celular Android (Adicionar à tela inicial / Instalar app)

- Configurar manifest e service worker corretamente

- Ícone do app

- Nome e descrição corretos



5. Não precisa de login ou cadastro de usuário.



Faça o app o mais completo, estável e polido possível. Priorize que funcione bem no celular e que seja instalável.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://sorteioscaixa.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6bdc2378-f800-4717-9b38-e96b1ed9ef5b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
