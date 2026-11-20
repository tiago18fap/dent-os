// Hooks de resolucao de modulos: deixam o codigo Deno das Edge Functions
// (supabase/functions/*/index.ts) rodar no Node sem editar os arquivos.
// Os imports por URL (esm.sh / deno.land) viram pacotes npm ou shims locais.

const SERVER_ROOT = new URL("../", import.meta.url).href; // .../server/
const SHIMS = new URL("./shims/", import.meta.url).href;

const RULES = [
  [/^https:\/\/esm\.sh\/@supabase\/supabase-js(@[^/?]*)?(\?.*)?$/, "@supabase/supabase-js"],
  [/^https:\/\/esm\.sh\/stripe(@[^/?]*)?(\?.*)?$/, "stripe"],
  [/^https:\/\/deno\.land\/std(@[^/]*)?\/http\/server\.ts$/, `${SHIMS}deno-http-server.js`],
  [/^https:\/\/deno\.land\/std(@[^/]*)?\/crypto\/mod\.ts$/, `${SHIMS}deno-crypto.js`],
  // Polyfill de XMLHttpRequest para o Deno; o Node ja tem fetch, nada a fazer.
  [/^https:\/\/deno\.land\/x\/xhr(@[^/]*)?\/mod\.ts$/, `${SHIMS}empty.js`],
];

export async function resolve(specifier, context, nextResolve) {
  for (const [re, target] of RULES) {
    if (re.test(specifier)) {
      // Pacotes npm sao resolvidos a partir de server/ (onde esta o node_modules).
      return nextResolve(target, { ...context, parentURL: `${SERVER_ROOT}index.js` });
    }
  }
  if (/^https?:\/\//.test(specifier)) {
    throw new Error(
      `Import remoto nao mapeado em server/functions/loader-hooks.js: ${specifier}. ` +
        "Adicione o pacote npm equivalente em RULES.",
    );
  }
  return nextResolve(specifier, context);
}
