# Link Explorer — versão 1.0

Um explorador de links em HTML, CSS e JavaScript com identidade Purple Glass.

## Começar
Publique estes arquivos em um servidor HTTP/HTTPS. O explorador começa com exemplos editáveis. Use **Novo item** para criar links ou subpastas, e **Nova pasta** na barra lateral para criar pastas principais.

O menu de três pontos permite editar, favoritar, mover, ordenar e excluir. A ordenação por cima/baixo funciona quando **Ordem personalizada** está selecionada. Você pode escolher ícones, cores e imagens, alternar entre ícones/cartões/lista, pesquisar e personalizar os temas.

## GitHub Pages
Envie todos os arquivos deste ZIP à raiz do repositório, mantendo as pastas js/ e assets/.
Em Settings → Pages, selecione a branch e a raiz como origem da publicação.
Não há build ou instalação de dependências.

## Vercel
Importe o repositório. Escolha um projeto estático/Other, sem comando de build e com a raiz como diretório de saída. Mantenha index.html na raiz.

## Testar no computador
Com Python instalado, abra um terminal nesta pasta e execute:

    python -m http.server 8000

Acesse http://localhost:8000.
Abrir index.html com duplo clique não é suportado, pois módulos JavaScript precisam de HTTP/HTTPS.

## Seus dados
Os dados são salvos em IndexedDB neste navegador. Não há conta, sincronização em nuvem ou acesso automático em outro aparelho. O indicador informa quando a gravação foi concluída. Se o armazenamento for bloqueado, haverá um aviso de que os dados só estão na sessão.

Use **Backup e dados** para exportar um JSON com pastas, links, imagens enviadas e preferências, ou restaurar um arquivo.
Exporte antes de limpar os dados do site ou mudar de endereço/aparelho. Limite de importação: 20 MB e 10 mil itens; profundidade máxima: 128 níveis.

## Sua página pública
Em **Compartilhar coleção**, selecione o conteúdo, defina o nome/descrição e confira a prévia.
Selecionar uma pasta inclui todo seu conteúdo; os filhos aparecem marcados e bloqueados.
**Baixar site público** gera outro ZIP, apenas com a seleção, para publicar separadamente.
O download não publica automaticamente. Para atualizar a coleção hospedada, faça uma nova exportação e substitua os arquivos.
O visitante recebe uma coleção de leitura. Ela ignora os dados locais do editor e não possui um serviço para alterar a coleção hospedada.

## Arquivos
- index.html: estrutura.
- styles.css: temas e responsividade.
- js/app.js: interface, navegação e formulários.
- js/core.js: estrutura de dados, validação e seleção pública.
- js/storage.js: armazenamento transacional.
- js/export.js: exportação e geração de ZIP.
- js/icons.js e assets/: recursos vetoriais locais.

Imagens JPG, PNG e WebP de até 5 MB são otimizadas antes de salvar.
Favicons são opcionais e dependem do site de origem, com alternativa por ícone local.
Perfis sociais funcionam como links comuns. A versão não consulta Stories ou status de atividade.
Contas, sincronização e integrações sociais são etapas futuras.

Validação: 19 testes automatizados cobrindo dados, armazenamento, formulários, importação e exportação em DOM/IndexedDB simulados. A checagem visual em navegador real não esteve disponível no ambiente de criação.

## Atualização da interface
Bloco de apresentação removido, atalho Recentes removido do menu e rodapé atualizado para “Cada vez mais perto dos links”, com ícone de computador.
