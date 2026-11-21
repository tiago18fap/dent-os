// Regras para transformar o texto de uma campanha do DentOS ({nome}, {procedimento}...)
// num modelo da Meta ({{1}}, {{2}}...) e para recuperar os valores das variaveis
// a partir da mensagem ja montada na fila (fila_envios.mensagem).

const PLACEHOLDER = /\{([a-zA-Z_]+)\}/g;
const LIMITE_TEXTO = 1024; // limite do corpo de um modelo na Meta

/** Chave do modelo de uma mensagem da fila: grupo da campanha ou a origem. */
export function chaveDaMensagem(msg: { campanha_ref?: string | null; origem?: string | null }): string | null {
  return (msg.campanha_ref || msg.origem || "").trim() || null;
}

/** Exemplo de valor por variavel, exigido pela Meta na revisao do modelo. */
const EXEMPLOS: Record<string, string> = {
  nome: "Maria",
  procedimento: "Limpeza",
  data_procedimento: "15/03/2026",
  mes: "março",
  ano: "2026",
};

/** Valor usado quando a variavel veio vazia (a Meta recusa parametro vazio). */
const PADRAO_VAZIO: Record<string, string> = {
  nome: "paciente",
};

export interface ModeloConvertido {
  textoModelo: string;
  variaveis: string[]; // nome da variavel do DentOS por posicao ({{1}} = variaveis[0])
  exemplos: string[];
  avisos: string[];
}

/**
 * Converte o texto da campanha no corpo do modelo da Meta.
 * Cada ocorrencia de {variavel} vira um numero sequencial ({{1}}, {{2}}...).
 * A Meta nao aceita corpo comecando ou terminando com variavel: nesse caso
 * o texto ganha uma saudacao/ponto final.
 */
export function converterTextoParaModelo(textoOriginal: string): ModeloConvertido {
  const avisos: string[] = [];
  const variaveis: string[] = [];
  let n = 0;
  let textoModelo = (textoOriginal || "").replace(PLACEHOLDER, (_m, nome: string) => {
    n += 1;
    variaveis.push(nome.toLowerCase());
    return `{{${n}}}`;
  });

  if (/^\s*\{\{\d+\}\}/.test(textoModelo)) {
    textoModelo = `Olá, ${textoModelo.trimStart()}`;
    avisos.push("O texto começava com uma variável; foi adicionado \"Olá,\" no início (regra da Meta).");
  }
  if (/\{\{\d+\}\}\s*$/.test(textoModelo)) {
    textoModelo = `${textoModelo.trimEnd()}.`;
    avisos.push("O texto terminava com uma variável; foi adicionado um ponto final (regra da Meta).");
  }
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(textoModelo)) {
    avisos.push("Há duas variáveis seguidas; a Meta costuma recusar. Coloque um texto entre elas.");
  }
  if (textoModelo.length > LIMITE_TEXTO) {
    avisos.push(`O texto tem ${textoModelo.length} caracteres; o limite da Meta é ${LIMITE_TEXTO}.`);
  }
  if (!textoModelo.trim()) avisos.push("O texto da campanha está vazio.");

  const exemplos = variaveis.map((v) => EXEMPLOS[v] || "exemplo");
  return { textoModelo, variaveis, exemplos, avisos };
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parametro aceito pela Meta: sem quebra de linha/tab e sem 4+ espacos seguidos. */
function limparParametro(valor: string, variavel: string): string {
  const v = (valor || "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return v || PADRAO_VAZIO[variavel] || "-";
}

/**
 * Recupera os valores das variaveis comparando o texto da campanha com a mensagem
 * montada. Retorna null se a mensagem nao corresponde ao texto (campanha editada
 * depois que a mensagem entrou na fila, por exemplo).
 */
export function extrairVariaveis(textoOriginal: string, mensagem: string, variaveis: string[]): string[] | null {
  const partes = (textoOriginal || "").split(PLACEHOLDER);
  // split com grupo de captura: [texto, nomeVar, texto, nomeVar, texto...]
  let padrao = "^";
  for (let i = 0; i < partes.length; i++) {
    padrao += i % 2 === 0 ? escaparRegex(partes[i]) : "([\\s\\S]*?)";
  }
  padrao += "$";
  const m = new RegExp(padrao).exec(mensagem || "");
  if (!m) return null;
  const valores = m.slice(1);
  if (valores.length !== variaveis.length) return null;
  return valores.map((v, i) => limparParametro(v, variaveis[i]));
}

/** Hash curto e estavel (djb2) para versionar o nome do modelo pelo texto. */
function hashCurto(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 6);
}

/**
 * Nome do modelo na Meta: minusculas, numeros e _, comecando com letra.
 * Muda quando o texto muda, porque a Meta limita edicoes de um modelo aprovado.
 */
export function nomeDoModelo(chave: string, textoModelo: string, categoria: string): string {
  const base = (chave || "campanha")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return `dentos_${base || "campanha"}_${hashCurto(`${categoria}|${textoModelo}`)}`;
}
