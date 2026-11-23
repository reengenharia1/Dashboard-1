# Prompt de Desenvolvimento — Dashboard de Etapas Regulatórias

Copie e cole o bloco abaixo em um agente/chat de desenvolvimento para gerar o dashboard completo.

---

## PROMPT (copiar a partir daqui)

Você é um desenvolvedor front-end sênior. Crie um **dashboard analítico profissional estilo Power BI**, 100% responsivo (mobile-first), usando **HTML, CSS e JavaScript puro** (sem React, Vue, Angular ou bundlers).

### Objetivo
Construir um dashboard visualmente rico, com cards de totais, gráficos dinâmicos, ícones, motion e animações, alimentado pelo arquivo CSV local `etapas atuais.csv` (delimitador `;`, ~475 registros). O visual deve lembrar o layout de referência estilo Power BI (fundo escuro, cards coloridos no topo, grid de painéis com gráficos).

### Stack obrigatória
- `index.html` — estrutura semântica
- `styles.css` — layout, tema, responsividade, animações
- `app.js` — parse do CSV, agregações, filtros, gráficos e animações
- Chart.js via CDN (gráficos dinâmicos)
- Lucide Icons **ou** Font Awesome via CDN (ícones)
- Sem frameworks, sem build step, sem TypeScript
- Servir/abrir via servidor local simples se necessário para `fetch` do CSV (não inventar backend)

### Fonte de dados
Arquivo: `etapas atuais.csv`

Colunas (exatas):
1. `SEI Regulatório`
2. `Concessionária`
3. `Processo Projeto Funcional`
4. `Descrição`
5. `Etapa Atual`
6. `Status da Etapa`
7. `Prioridade`
8. `Modo de Transporte`
9. `Status`

Regras de dados:
- Carregar com `fetch('etapas atuais.csv')` e parsear CSV com `;`
- Tratar campos vazios (ex.: Prioridade em branco → categoria “Sem prioridade”)
- Normalizar espaços e valores inconsistentes de status de etapa quando fizer sentido para agrupamento (ex.: “Não recebido” / “NÃO recebido”)
- **Não inventar** campos que não existem no CSV (sem orçamento, sem “Total Budget”, sem “Cost Variance” fictício)
- Todos os KPIs e gráficos devem recalcular a partir dos dados filtrados

Distribuição de referência do dataset completo (use apenas como sanity-check; calcule sempre dinamicamente):
- Status: Em Andamento ~355 | Não Iniciado ~53 | Arquivado ~36 | Concluído ~31
- Modo: Rodoviário ~449 | Metroferroviário ~20 | Transp.Coletivo ~3 | Aeroportuário ~3

### Layout (composição estilo Power BI)

#### Header
- Título: **Dashboard de Etapas Regulatórias** (ou similar, em português)
- Subtítulo curto (ex.: “Acompanhamento de processos e etapas”)
- Ícone/logo minimalista no canto (não precisa ser logo Power BI oficial)
- Barra de filtros: Status, Concessionária, Modo de Transporte (+ botão Limpar filtros)
- No mobile: header empilhado, filtros em coluna/full-width

#### Linha de KPI Cards (topo)
Sete cards coloridos com ícone + label + valor grande animado (count-up):

| Card | Fonte |
|------|--------|
| Total de Processos | `count` de registros filtrados |
| Em Andamento | `Status === "Em Andamento"` |
| Concluído | `Status === "Concluído"` |
| Não Iniciado | `Status === "Não Iniciado"` |
| Arquivado | `Status === "Arquivado"` |
| Concessionárias | `count` distinto de `Concessionária` |
| % Concluídos | `(Concluído / Total) * 100` formatado com 1 casa decimal |

Cores dos cards (vibrantes, contraste no dark theme): verde, azul, laranja/dourado, teal, vermelho suave / indigo — estilo Power BI. Cada card com ícone distinto.

#### Área de gráficos (grid)

**Linha do meio**
1. **Donut — Status dos Processos**  
   Labels: Em Andamento, Concluído, Não Iniciado, Arquivado  
   Legenda abaixo/lado com cores consistentes

2. **Linha — Ranking de volume por Concessionária (Top 10)**  
   Eixo X: nomes (abreviados se longo)  
   Eixo Y: quantidade de processos  
   Linha suave com pontos; tooltip com nome completo

3. **Barras horizontais — Top 8 Concessionárias**  
   Comparativo de volume por concessionária

4. **Gauge semicircular — Taxa de Conclusão**  
   Valor central = % Concluídos  
   Arco animado (Chart.js doughnut cortado ou canvas custom)

**Linha inferior**
5. **Barras horizontais — Prioridade**  
   Contagem por `Prioridade` (incluir “Sem prioridade”); cores por faixa (alta/média/baixa)

6. **Colunas — Top Etapas Atuais**  
   Top 8 valores de `Etapa Atual` (agrupar nomes compostos longos de forma legível; truncar labels no eixo)

7. **Barras de progresso / stacked horizontal — Status da Etapa**  
   Top status da etapa com % relativo ao total filtrado e labels percentuais

Cada painel de gráfico deve ter:
- fundo em card escuro com bordas levemente arredondadas
- título do painel
- padding consistente
- altura mínima confortável no desktop; no mobile altura adequada sem overflow horizontal

### Estilo visual (Power BI dark)
- Fundo geral: `#1a2332` / `#222b35` (ou equivalente)
- Cards/painéis: tom um pouco mais claro que o fundo, sombra suave
- Tipografia: sans-serif moderna via Google Fonts (ex.: Plus Jakarta Sans ou DM Sans) — **não** usar Inter/Roboto/Arial como única escolha
- Texto principal branco; labels secundários cinza claro
- Paleta de dados sugerida: `#4CAF50`, `#2196F3`, `#FF9800`, `#00BCD4`, `#E53935`, `#7E57C2`
- Cantos arredondados moderados (não “pill” excessivo)
- Evitar: tema roxo genérico AI, glow neon exagerado, emojis no UI

### Motion, ícones e microinterações
- Animação de entrada dos cards e painéis (fade + slide-up escalonado)
- Count-up animado nos KPIs ao carregar e ao filtrar
- Hover nos cards: leve elevate/scale e brilho de borda
- Gráficos Chart.js com `animation` suave
- Ícones nos KPI cards e no header
- Skeleton ou estado de loading enquanto o CSV carrega
- Estado vazio amigável se filtros zerem os dados
- Respeitar `prefers-reduced-motion` (reduzir/desligar animações)

### Responsividade (obrigatório 100% mobile)
Mobile-first com breakpoints claros (ex.: 640 / 960 / 1280):

- **Celular (&lt;640px):** 1 coluna; KPI cards em grid 2×N ou scroll horizontal com snap; gráficos empilhados full-width; filtros empilhados; tipografia e padding reduzidos; sem scroll horizontal da página
- **Tablet:** 2 colunas para gráficos; KPIs em 3–4 por linha
- **Desktop:** grid denso estilo bento (3–4 colunas na área de charts; 7 KPIs em uma fileira ou wrap elegante)

Testar mentalmente touch targets ≥44px nos filtros/botões.

### Interatividade
- Alterar qualquer filtro → recalcular KPIs + atualizar todos os charts (`chart.update()`), sem recarregar a página
- Tooltips ricos nos gráficos
- Opcional e bem-vindo: clique em fatia/barra aplica filtro correspondente

### Estrutura de arquivos esperada
```
/
├── index.html
├── styles.css
├── app.js
└── etapas atuais.csv   (já existente — não alterar dados)
```

### Critérios de aceite
1. Dashboard abre e carrega o CSV real sem erros
2. KPIs e gráficos refletem agregações corretas do CSV
3. Filtros funcionam e sincronizam todos os visuais
4. Layout impecável no celular (sem overflow horizontal, hierarquia clara)
5. Visual profissional dark estilo Power BI, com motion e ícones
6. Código organizado, comentários só onde necessário, nomes claros em português ou inglês consistente
7. Nenhuma dependência além de CDNs (Chart.js + ícones + fonte)

### Restrições
- Não usar React/Vue/Svelte/Angular
- Não inventar métricas de budget/custo
- Não alterar o conteúdo do CSV
- Não criar README longo desnecessário; foque em entregar o dashboard funcionando
- Não copiar marca/logo oficial Microsoft Power BI; apenas o **estilo visual**

### Ordem de implementação sugerida
1. HTML skeleton + CSS theme + grid responsivo
2. Parser CSV + agregações + KPIs
3. Gráficos Chart.js
4. Filtros e sync
5. Motion, ícones, polish mobile

Entregue os três arquivos (`index.html`, `styles.css`, `app.js`) completos e prontos para rodar.

## FIM DO PROMPT
