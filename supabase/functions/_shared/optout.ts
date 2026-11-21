// Regra unica de deteccao de opt-out (pedido para sair da lista / LGPD).
// Usada pelo webhook da Evolution (whatsapp-webhook) e pelo da Zernio (zernio-webhook).

/**
 * Algoritmo profissional de detecção de Opt-Out.
 * Usa sistema de pontuação para evitar falsos positivos.
 * Retorna { isOptOut: boolean, confianca: 'alta' | 'media' | 'baixa' | 'none' }
 */
export function analyzeOptOutIntent(text: string): { isOptOut: boolean; confianca: 'alta' | 'media' | 'baixa' | 'none' } {
  const normalized = text.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^\w\s]/g, " ")        // Remove punctuation
    .replace(/\s+/g, " ")            // Normalize spaces
    .trim();

  // Mensagens muito curtas (1-2 palavras) com palavras genéricas = ignorar
  const wordCount = normalized.split(" ").length;

  let score = 0;

  // ═══ NÍVEL 1: Sinais FORTES (alta confiança) — frases que SÓ fazem sentido como opt-out ═══
  const strongPatterns = [
    /nao (quero|desejo) (mais )?receber (mais )?(msg|mensagem|mensagens)/,
    /pare[m]? de (me )?enviar/,
    /deixe[m]? de (me )?enviar/,
    /nao (me )?mande[m]? mais (msg|mensagem|mensagens)/,
    /nao (me )?envie[m]? mais/,
    /me tire[m]? (da|dessa) lista/,
    /me remova[m]? (da|dessa) lista/,
    /me retire[m]? (da|dessa) lista/,
    /me exclua[m]? (da|dessa) lista/,
    /tirar (meu )?(numero|telefone|contato) (da|dessa) lista/,
    /remover (meu )?(numero|telefone|contato) (da|dessa) lista/,
    /retirar (meu )?(numero|telefone|contato) (da|dessa) lista/,
    /excluir (meu )?(numero|telefone|contato) (da|dessa) lista/,
    /nao quero mais (essa[s]? )?mensagen[s]?/,
    /parar de receber (essa[s]? )?(msg|mensagem|mensagens)/,
    /\bdescadastrar\b/,
    /\bdescadastramento\b/,
    /parem com (isso|essas mensagens)/,
    /nao autorizo o envio/,
    /retir(ar|e[m]?) meu (cadastro|contato|numero)/,
  ];

  for (const pattern of strongPatterns) {
    if (pattern.test(normalized)) {
      score += 10;
      break; // Um forte já basta
    }
  }

  // ═══ NÍVEL 2: Sinais DEFINITIVOS (palavras que sozinhas indicam opt-out) ═══
  const definitiveWords = [
    /\blgpd\b/,
    /\bspam\b/,
  ];

  for (const pattern of definitiveWords) {
    if (pattern.test(normalized)) {
      score += 10;
    }
  }

  // ═══ NÍVEL 3: Sinais MÉDIOS (precisam de contexto) ═══
  const mediumPatterns = [
    { pattern: /\bsair\b/, contextRequired: /(lista|grupo|mensagen|envio|cadastro)/ },
    { pattern: /\bremover\b/, contextRequired: /(numero|telefone|contato|cadastro|lista)/ },
    { pattern: /\bexcluir\b/, contextRequired: /(numero|telefone|contato|cadastro|lista)/ },
    { pattern: /\bparar\b/, contextRequired: /(mensagen|envio|receber|enviar|mandar)/ },
    { pattern: /\bcancelar\b/, contextRequired: /(mensagen|envio|cadastro|lista)/ },
    { pattern: /\bperturbar\b/, contextRequired: null }, // Sempre conta como opt-out
    { pattern: /\bincomodar\b/, contextRequired: null },
    { pattern: /\bbloquear\b/, contextRequired: /(numero|mensagen|envio)/ },
  ];

  for (const { pattern, contextRequired } of mediumPatterns) {
    if (pattern.test(normalized)) {
      if (contextRequired === null || contextRequired.test(normalized)) {
        score += 5;
      }
    }
  }

  // ═══ NÍVEL 4: Sinais FRACOS (pouco peso, ajudam no contexto) ═══
  const weakSignals = [
    /para(r|m)? (com )?(isso|essas)/,
    /nao (preciso|quero|desejo) (disso|mais)/,
    /chega (disso|dessas)/,
  ];

  for (const pattern of weakSignals) {
    if (pattern.test(normalized)) {
      score += 2;
    }
  }

  // ═══ ANTI-PADRÕES: Indicam que NÃO é opt-out (reduzem score) ═══
  const antiPatterns = [
    /\bconsulta\b/,
    /\bagendamento\b/,
    /\bagenda(r)?\b/,
    /\bhorario\b/,
    /\batendimento\b/,
    /\btratamento\b/,
    /\bdente\b/,
    /\bimplante\b/,
    /\bortodont/,
    /\blimpeza\b/,
    /\bextracao\b/,
    /\braio.?x\b/,
    /\bcanal\b/,
    /\bprotese\b/,
    /\bque horas\b/,
    /\bmarcar\b/,
    /\bdesmarcar\b/,
    /\bremarcar\b/,
    /\bconfirm(ar|o|a)\b/,
    /\bpresente\b/,
    /\baniversario\b/,
    /\bobrigad[oa]\b/,
    /\bvaleu\b/,
    /\bvou (ai|la|ir)\b/,
    /\bchegar\b/,
    /\batrasad[oa]\b/,
  ];

  for (const pattern of antiPatterns) {
    if (pattern.test(normalized)) {
      score -= 8;
    }
  }

  // ═══ Regra especial: mensagem muito curta com palavra genérica ═══
  // "sair", "parar", "cancelar" sozinhas (1-2 palavras) SÃO ambíguas
  if (wordCount <= 2 && score > 0 && score < 10) {
    const ambiguousSingleWords = ["sair", "parar", "cancelar", "remover", "excluir"];
    if (ambiguousSingleWords.includes(normalized.trim())) {
      // Palavra ambígua sozinha — não é certeza de opt-out
      score = 3; // Confiança baixa
    }
  }

  // ═══ Determinar confiança ═══
  if (score >= 10) return { isOptOut: true, confianca: "alta" };
  if (score >= 5) return { isOptOut: true, confianca: "media" };
  if (score >= 3) return { isOptOut: false, confianca: "baixa" }; // Registra mas NÃO desabilita
  return { isOptOut: false, confianca: "none" };
}
