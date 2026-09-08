import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiPost, errorMessage } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { useCatalogs } from '../../hooks/useCatalogs';
import type { Opportunity } from '../../types';

/** Cambio de etapa con nota y motivo obligatorio para etapas de pérdida. */
export function MoveStageModal({
  opportunity,
  targetStageId,
  onClose,
}: {
  opportunity: Opportunity;
  targetStageId?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: catalogs } = useCatalogs();
  const [stageId, setStageId] = useState(targetStageId ?? opportunity.stageId);
  const [note, setNote] = useState('');
  const [lostReason, setLostReason] = useState('');

  useEffect(() => {
    setStageId(targetStageId ?? opportunity.stageId);
  }, [targetStageId, opportunity.stageId]);

  const stage = catalogs?.pipelineStages.find((item) => item.id === stageId);
  const requiresReason = Boolean(stage?.isLost);

  const mutation = useMutation({
    mutationFn: () =>
      apiPost(`/opportunities/${opportunity.id}/stage`, {
        stageId,
        note: note || undefined,
        lostReason: requiresReason ? lostReason : undefined,
      }),
    onSuccess: () => {
      toast.success('Etapa actualizada');
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      void queryClient.invalidateQueries({ queryKey: ['opportunity'] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Mover oportunidad de etapa"
      description={opportunity.name}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={requiresReason && !lostReason.trim()}
          >
            Confirmar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nueva etapa" required>
          <Select value={stageId} onChange={(event) => setStageId(event.target.value)}>
            {catalogs?.pipelineStages.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.probability}%)
              </option>
            ))}
          </Select>
        </Field>

        {requiresReason && (
          <Field label="Motivo de pérdida" required hint="Obligatorio al marcar la oportunidad como perdida">
            <Input value={lostReason} onChange={(event) => setLostReason(event.target.value)} maxLength={500} />
          </Field>
        )}

        <Field label="Nota del movimiento">
          <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
        </Field>
      </div>
    </Modal>
  );
}
