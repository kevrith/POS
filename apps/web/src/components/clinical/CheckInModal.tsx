import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import type { Patient } from '../../lib/clinical';
import { Button, Input } from '../ui';
import { Modal } from '../../pages/fuel/Modal';
import PatientPicker from './PatientPicker';

/**
 * A booked patient has arrived. Find their patient record (or register them), and they go into the queue as a visit tied to the
 * appointment, with the booked services already on the bill. The search starts from the name and phone on the booking.
 */
export default function CheckInModal({ appointment, onClose, onDone }: {
  appointment: { id: string; customerName: string; customerPhone?: string | null; notes?: string | null };
  onClose: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [complaint, setComplaint] = useState(appointment.notes ?? '');
  const start = appointment.customerPhone || appointment.customerName;
  const save = useMutation({
    mutationFn: () => api.post<{ visitNumber: string }>(`/visits/from-appointment/${appointment.id}`, { patientId: patient?.id, complaint: complaint.trim() || undefined }),
    onSuccess: (v) => {
      toast.success(`${patient?.name} is in the queue (${v.visitNumber})`);
      void qc.invalidateQueries({ queryKey: ['visits'] });
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Modal title={`Check in ${appointment.customerName}`} subtitle="Put them in the clinic queue from this appointment" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (patient) save.mutate(); }}>
        <PatientPicker value={patient} onChange={setPatient} initialQuery={start} />
        <Input label="What they came for (optional)" value={complaint} onChange={(e) => setComplaint(e.target.value)} />
        <p className="text-xs text-gray-500">The services booked are added to the visit's bill. Finishing the visit completes the appointment.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={save.isPending} disabled={!patient}>Check in</Button>
        </div>
      </form>
    </Modal>
  );
}
