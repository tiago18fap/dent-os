-- Allow users to delete from fila_envios
CREATE POLICY "Allow delete on fila_envios for clinica users" 
ON public.fila_envios 
FOR DELETE 
USING (
  clinica_id IN (
    SELECT c.id 
    FROM public.clinicas c 
    WHERE c.id = fila_envios.clinica_id
  )
);
