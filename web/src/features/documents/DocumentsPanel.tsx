import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { apiDelete, apiDownload, apiList, errorMessage, http } from '../../lib/api';
import { formatDateTime, label } from '../../lib/format';
import { downloadBlob } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../hooks/useAuth';
import type { DocumentItem } from '../../types';

type Scope =
  | { clientId: string }
  | { prospectId: string }
  | { opportunityId: string }
  | { quoteId: string };

const CATEGORIES = ['CONTRATO', 'FACTURA', 'COTIZACION', 'ORDEN_COMPRA', 'IDENTIFICACION', 'IMAGEN', 'OTRO'];

const MAX_MB = 15;

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsPanel({ scope }: { scope: Scope }) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('OTRO');
  const [toDelete, setToDelete] = useState<DocumentItem | null>(null);
  const [progress, setProgress] = useState(0);

  const query = useQuery({
    queryKey: ['documents', scope],
    queryFn: () => apiList<DocumentItem>('/documents', { ...scope, pageSize: 100 }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['documents', scope] });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Debe seleccionar un archivo');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);
      if (name.trim()) formData.append('name', name.trim());
      for (const [key, value] of Object.entries(scope)) formData.append(key, value as string);

      await http.post('/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => {
          if (event.total) setProgress(Math.round((event.loaded * 100) / event.total));
        },
      });
    },
    onSuccess: () => {
      toast.success('Documento cargado correctamente');
      setUploadOpen(false);
      setFile(null);
      setName('');
      setProgress(0);
      void invalidate();
    },
    onError: (error) => {
      setProgress(0);
      toast.error(errorMessage(error));
    },
  });

  const remove = useMutation({
    mutationFn: (document: DocumentItem) => apiDelete(`/documents/${document.id}`),
    onSuccess: () => {
      toast.success('Documento eliminado');
      setToDelete(null);
      void invalidate();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setToDelete(null);
    },
  });

  const download = async (document: DocumentItem) => {
    try {
      const result = await apiDownload(`/documents/${document.id}/download`, undefined, document.originalName);
      downloadBlob(result.blob, result.fileName);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const onSelectFile = (selected: File | null) => {
    if (!selected) return;
    if (selected.size > MAX_MB * 1024 * 1024) {
      toast.error(`El archivo supera el máximo de ${MAX_MB} MB`);
      return;
    }
    setFile(selected);
    if (!name) setName(selected.name.replace(/\.[^.]+$/, ''));
  };

  return (
    <div className="space-y-3">
      {can('documents.create') && (
        <div className="flex justify-end">
          <Button size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => setUploadOpen(true)}>
            Subir documento
          </Button>
        </div>
      )}

      {query.isLoading && <div className="skeleton h-16 w-full" />}

      {!query.isLoading && (query.data?.data.length ?? 0) === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">No hay documentos adjuntos.</p>
      )}

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {query.data?.data.map((document) => (
          <li key={document.id} className="flex items-center gap-3 px-4 py-3">
            <FileText className="h-5 w-5 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{document.name}</p>
              <p className="truncate text-xs text-slate-500">
                {humanSize(document.sizeBytes)} · {document.uploadedByName ?? 'Sistema'} ·{' '}
                {formatDateTime(document.createdAt)}
              </p>
            </div>
            <Badge tone="neutral">{label(document.category)}</Badge>
            <button
              type="button"
              onClick={() => void download(document)}
              title="Descargar"
              aria-label={`Descargar ${document.name}`}
              className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <Download className="h-4 w-4" />
            </button>
            {can('documents.delete') && (
              <button
                type="button"
                onClick={() => setToDelete(document)}
                title="Eliminar"
                aria-label={`Eliminar ${document.name}`}
                className="rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Subir documento"
        description={`Formatos permitidos: PDF, imágenes, Word, Excel, PowerPoint, texto y ZIP. Máximo ${MAX_MB} MB.`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => upload.mutate()} loading={upload.isPending} disabled={!file}>
              Subir
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-8 text-center transition hover:border-brand-400 hover:bg-brand-50/40"
          >
            <Upload className="h-7 w-7 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">
              {file ? file.name : 'Seleccione un archivo'}
            </span>
            <span className="text-xs text-slate-400">
              {file ? humanSize(file.size) : 'Haga clic para elegir desde su equipo'}
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
            onChange={(event) => onSelectFile(event.target.files?.[0] ?? null)}
          />

          <Field label="Nombre del documento">
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} />
          </Field>

          <Field label="Categoría">
            <Select value={category} onChange={(event) => setCategory(event.target.value)}>
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </Select>
          </Field>

          {progress > 0 && progress < 100 && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Eliminar documento"
        message={`El archivo "${toDelete?.name ?? ''}" se eliminará del almacenamiento. ¿Desea continuar?`}
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
