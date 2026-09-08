import { useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { apiDownload, errorMessage } from '../lib/api';
import { downloadBlob } from '../lib/utils';
import { Button } from './ui/Button';

/** Menú de exportación reutilizable (Excel / CSV). */
export function ExportMenu({
  url,
  params,
  fileName,
  disabled,
}: {
  url: string;
  params?: Record<string, unknown>;
  fileName: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const download = async (format: 'xlsx' | 'csv') => {
    setOpen(false);
    setLoading(true);
    try {
      const result = await apiDownload(url, { ...params, format }, `${fileName}.${format}`);
      downloadBlob(result.blob, result.fileName);
      toast.success('Exportación generada correctamente');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        loading={loading}
        disabled={disabled}
        icon={<Download className="h-4 w-4" />}
        onClick={() => setOpen((value) => !value)}
      >
        Exportar
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-40 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            <button
              type="button"
              onClick={() => void download('xlsx')}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => void download('csv')}
              className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <FileText className="h-4 w-4 text-sky-600" />
              CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}
