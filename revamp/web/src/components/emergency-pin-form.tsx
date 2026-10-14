"use client";

import { useActionState } from "react";
import { createEmergencyPin, type EmergencyPinState } from "@/features/workspace/team-actions";

const initialState: EmergencyPinState = {};

export function EmergencyPinForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(createEmergencyPin, initialState);
  return (
    <form action={action} className="emergency-pin-form">
      <input name="id" type="hidden" value={id} />
      {state.pin ? (
        <p role="status">
          PIN sementara: <strong>{state.pin}</strong>
          <small>Salin sekarang. PIN ini tidak akan ditampilkan lagi.</small>
        </p>
      ) : (
        <button disabled={pending} type="submit">
          {pending ? "Membuat…" : "PIN darurat"}
        </button>
      )}
      {state.error ? <small role="alert">{state.error}</small> : null}
    </form>
  );
}
