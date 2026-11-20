// Registro das funcoes carregadas: nome da pasta -> handler (Request) => Response.

const handlers = new Map();
let loading = null;

export function beginLoading(name) {
  loading = name;
}

export function endLoading() {
  loading = null;
}

export function registerHandler(handler) {
  if (!loading) {
    throw new Error("serve() chamado fora do carregamento de uma funcao");
  }
  handlers.set(loading, handler);
}

export function getHandler(name) {
  return handlers.get(name) || null;
}

export function listHandlers() {
  return [...handlers.keys()].sort();
}
