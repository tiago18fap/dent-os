// Substitui `serve` do deno.land/std/http/server.ts.
// Em vez de abrir uma porta, entrega o handler para o registro de funcoes.
import { registerHandler } from "../registry.js";

export function serve(handler) {
  registerHandler(handler);
}
