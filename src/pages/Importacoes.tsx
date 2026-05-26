import { AppLayout } from "@/layouts/AppLayout";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useClinica } from "@/contexts/ClinicaContext";
import * as xlsx from "xlsx";

interface HistoricoItem {
  id: string;
  arquivo: string;
  tipo: string;
  data: string;
  status: "Sucesso" | "Erro";
}

const Importacoes = () => {
  const { toast } = useToast();
  const { clinica, loading, isSuperAdmin, isImpersonating } = useClinica();
  const [clientesFile, setClientesFile] = useState<File | null>(null);
  const [procedimentosFile, setProcedimentosFile] = useState<File | null>(null);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [loadingProcedimentos, setLoadingProcedimentos] = useState(false);

  const {
    data: historico,
    isLoading: loadingHistorico,
    error: historicoError,
    refetch: refetchHistorico,
  } = useQuery<HistoricoItem[]>({
    queryKey: ["importacoes_historico", clinica?.id, isSuperAdmin, isImpersonating],
    queryFn: async () => {
      let query = supabase
        .from("importacoes_historico")
        .select("created_at, tipo, status, file_name");

      if (!isSuperAdmin || isImpersonating) {
        if (clinica?.id) {
          query = query.eq("clinica_id", clinica.id);
        } else {
          return [];
        }
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;
      const rows = (data ?? []) as any[];

      return rows.map((row, index) => {
        const createdAt = new Date(row.created_at as string);
        const dataStr = `${createdAt.toLocaleDateString("pt-BR")} ${createdAt.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })}`;

        const statusLower = String(row.status ?? "").toLowerCase();
        const status: HistoricoItem["status"] = statusLower.startsWith("erro") ? "Erro" : "Sucesso";
        const tipoDb = (row.tipo as string | null) ?? null;
        const tipoLabel: string = tipoDb && tipoDb.trim() !== "" ? tipoDb : "—";

        return {
          id: `${createdAt.getTime()}-${index}`,
          arquivo: (row.file_name as string) ?? "—",
          tipo: tipoLabel,
          data: dataStr,
          status,
        };
      });
    },
    enabled: !loading,
  });

  useEffect(() => {
    document.title = "Importações DentAlerta";
  }, []);

  const validateXlsx = (file: File | null) => {
    if (!file) return false;
    const isXlsx = file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls");
    if (!isXlsx) {
      toast({
        variant: "destructive",
        title: "Arquivo inválido",
        description: "Envie um arquivo Excel com extensão .xlsx ou .xls exportado do seu ERP.",
      });
    }
    return isXlsx;
  };

  const cleanName = (name: string) => {
    if (!name) return "";
    return name.trim().toUpperCase().replace(/\s+/g, ' ');
  };

  const processarClientes = async (file: File) => {
    setLoadingClientes(true);
    let sucesso = false;
    let mensagemErro = "";

    try {
      const data = await file.arrayBuffer();
      const workbook = xlsx.read(data, { cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json<any>(sheet);

      if (rows.length === 0 || !("Paciente" in (rows[0] || {}))) {
        throw new Error("Arquivo inválido. Selecione a planilha correta de Clientes (que contém a coluna 'Paciente').");
      }

      const rawPatients = rows.map((row: any) => {
        let nascimentoStr = null;
        if (row["Nascimento"]) {
          try {
            const dateObj = new Date(row["Nascimento"]);
            if (!isNaN(dateObj.getTime())) {
              nascimentoStr = dateObj.toISOString().split("T")[0];
            }
          } catch (e) {}
        }

        return {
          paciente: cleanName(row["Paciente"]),
          telefone: row["Telefone"] ? String(row["Telefone"]).trim() : null,
          codigo: row["Código"] ? String(row["Código"]).trim() : null,
          nascimento: nascimentoStr,
          situacao: row["Situação"] ? String(row["Situação"]).trim() : null,
          prestador: row["Prestador"] ? String(row["Prestador"]).trim() : null,
          clinica_id: clinica?.id,
        };
      }).filter((p) => p.paciente !== "");

      // Remover duplicatas locais (se houver o mesmo paciente 2x no Excel, mantém o último)
      // Isso previne o erro "ON CONFLICT DO UPDATE command cannot affect row a second time"
      const uniquePatientsMap = new Map();
      rawPatients.forEach(p => {
        uniquePatientsMap.set(p.paciente, p);
      });
      const patientsToUpsert = Array.from(uniquePatientsMap.values());

      if (patientsToUpsert.length === 0) throw new Error("Nenhum dado válido encontrado na planilha.");

      const chunkSize = 500;
      let insertedCount = 0;
      for (let i = 0; i < patientsToUpsert.length; i += chunkSize) {
        const chunk = patientsToUpsert.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("clientes")
          .upsert(chunk, { onConflict: "clinica_id,paciente", ignoreDuplicates: false });
        if (error) throw error;
        insertedCount += chunk.length;
      }

      toast({
        title: "Importação concluída",
        description: `Foram atualizados ${insertedCount} clientes com sucesso.`,
      });
      sucesso = true;
    } catch (error: any) {
      console.error(error);
      mensagemErro = error.message || "Erro desconhecido";
      toast({
        variant: "destructive",
        title: "Erro ao importar clientes",
        description: mensagemErro,
      });
    } finally {
      await supabase.from("importacoes_historico").insert([{
        tipo: "Clientes",
        status: sucesso ? "Concluido" : `Erro: ${mensagemErro.substring(0, 50)}`,
        file_name: file.name,
        clinica_id: clinica?.id,
      }]);
      refetchHistorico();
      setLoadingClientes(false);
    }
  };

  const processarProcedimentos = async (file: File) => {
    setLoadingProcedimentos(true);
    let sucesso = false;
    let mensagemErro = "";

    try {
      const data = await file.arrayBuffer();
      const workbook = xlsx.read(data, { raw: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });

      let isProcedimentosFile = false;
      for (let i = 0; i < Math.min(rows.length, 5); i++) {
        const row = rows[i] || [];
        const firstCell = String(row[0] || "").trim();
        const headerCell = String(row[9] || "").trim();
        if (firstCell.startsWith("Prestador:") || headerCell === "Nome do procedimento") {
          isProcedimentosFile = true;
          break;
        }
      }
      if (!isProcedimentosFile) {
        throw new Error("Arquivo inválido. Selecione o relatório correto de Procedimentos (ele possui os campos 'Prestador:' e 'Nome do procedimento').");
      }

      let currentProfessionalName = "";
      const proceduresToInsert = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const col0 = String(row[0] || "").trim();
        
        if (col0.startsWith("Prestador:")) {
          const namePart = String(row[1] || "").trim();
          if (namePart) currentProfessionalName = cleanName(namePart);
          continue;
        }

        const dataProcStr = String(row[0] || "").trim();
        const dataCompleta = String(row[2] || "").trim();
        const treatmentId = String(row[3] || "").trim();
        const procCode = String(row[5] || "").trim();
        const description = String(row[9] || "").trim();
        const region = String(row[11] || "").trim();
        const face = String(row[12] || "").trim();
        const pName = String(row[13] || "").trim();

        if (dataProcStr.match(/^\d{2}\/\d{2}\/\d{4}/) && pName.length > 2 && description.length > 2) {
           proceduresToInsert.push({
             nome_paciente: cleanName(pName),
             procedimento: description,
             data_finalizacao: dataProcStr,
             data_completa: dataCompleta,
             codigo_atendimento: treatmentId,
             codigo_procedimento_ref: procCode,
             regiao: region,
             face: face,
             prestador: currentProfessionalName,
             idchave: `${treatmentId}-${procCode}-${cleanName(pName)}`.substring(0, 50),
             clinica_id: clinica?.id,
           });
        }
      }

      if (proceduresToInsert.length === 0) throw new Error("Nenhum procedimento encontrado.");

      // Inserir em lotes diretamente em 'procedimentos'
      const chunkSize = 500;
      let insertedCount = 0;
      for (let i = 0; i < proceduresToInsert.length; i += chunkSize) {
        const chunk = proceduresToInsert.slice(i, i + chunkSize);
        const { error } = await supabase.from("procedimentos").insert(chunk);
        if (error) throw error;
        insertedCount += chunk.length;
      }

      toast({
        title: "Importação concluída",
        description: `Foram importados ${insertedCount} procedimentos com sucesso.`,
      });
      sucesso = true;

    } catch (error: any) {
      console.error(error);
      mensagemErro = error.message || "Erro desconhecido";
      toast({
        variant: "destructive",
        title: "Erro ao importar procedimentos",
        description: mensagemErro,
      });
    } finally {
      await supabase.from("importacoes_historico").insert([{
        tipo: "Procedimentos",
        status: sucesso ? "Concluido" : `Erro: ${mensagemErro.substring(0, 50)}`,
        file_name: file.name,
        clinica_id: clinica?.id,
      }]);
      refetchHistorico();
      setLoadingProcedimentos(false);
    }
  };

  const enviarArquivo = async (tipo: "clientes" | "procedimentos") => {
    const isClientes = tipo === "clientes";
    const file = isClientes ? clientesFile : procedimentosFile;

    if (!file) {
      toast({
        variant: "destructive",
        title: "Selecione um arquivo",
        description: "Escolha um arquivo exportado do seu ERP antes de enviar.",
      });
      return;
    }

    if (!validateXlsx(file)) return;

    if (isClientes) {
      await processarClientes(file);
    } else {
      await processarProcedimentos(file);
    }
  };

  return (
    <AppLayout>
      <section className="grid gap-4 lg:grid-cols-2" aria-label="Importação de dados do ERP">
        <Card>
          <CardHeader>
            <CardTitle>Importar Clientes / Pacientes</CardTitle>
            <CardDescription>
              Envie o arquivo .xlsx exportado do seu ERP com a base de clientes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clientes-file">Arquivo de clientes (.xlsx)</Label>
              <Input
                id="clientes-file"
                type="file"
                accept=".xlsx, .xls"
                onChange={(event) => setClientesFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col items-end gap-2">
            <Button type="button" onClick={() => enviarArquivo("clientes")} disabled={loadingClientes}>
              {loadingClientes ? "Processando..." : "IMPORTAR CLIENTES"}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Importar Procedimentos / Relatórios</CardTitle>
            <CardDescription>
              Envie o arquivo .xlsx de procedimentos realizados. (Pode ser enviado em qualquer ordem)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="procedimentos-file">Arquivo de relatórios (.xlsx)</Label>
              <Input
                id="procedimentos-file"
                type="file"
                accept=".xlsx, .xls"
                onChange={(event) => setProcedimentosFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col items-end gap-2">
             <Button type="button" onClick={() => enviarArquivo("procedimentos")} disabled={loadingProcedimentos} variant="secondary">
              {loadingProcedimentos ? "Processando..." : "IMPORTAR PROCEDIMENTOS"}
            </Button>
          </CardFooter>
        </Card>
      </section>

      <section className="mt-4 space-y-2" aria-label="Histórico de importações">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Histórico de importações</h2>
        </div>
        <div className="overflow-hidden rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arquivo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historico && historico.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.arquivo}</TableCell>
                    <TableCell>{item.tipo}</TableCell>
                    <TableCell>{item.data}</TableCell>
                    <TableCell>
                      <Badge variant={item.status === "Sucesso" ? "default" : "destructive"} className="text-xs font-normal">
                        {item.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </AppLayout>
  );
};

export default Importacoes;
