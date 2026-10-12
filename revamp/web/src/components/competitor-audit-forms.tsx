"use client";

import { useActionState } from "react";
import { saveGrowthCompetitors, saveGrowthSearchAudit } from "@/features/analytics/competitor-actions";
import { ownDomain, searchKeywords, type Competitor } from "@/features/analytics/competitor-model";

export function CompetitorSettingsForm({ competitors }: { competitors: Competitor[] }) {
  const [message, action, pending] = useActionState(saveGrowthCompetitors, null);
  return (
    <form action={action} className="growth-audit-form">
      <h2>Website pembanding</h2>
      <p>Pilih tiga usaha yang melayani kebutuhan serupa. Perubahan tidak mengubah audit lama.</p>
      {competitors.map((item, index) => (
        <div className="growth-audit-competitor" key={index}>
          <label>
            Nama usaha
            <input name={`name-${index}`} required maxLength={80} defaultValue={item.name} />
          </label>
          <label>
            Domain
            <input name={`domain-${index}`} required defaultValue={item.domain} inputMode="url" />
          </label>
        </div>
      ))}
      <button type="submit" disabled={pending}>
        Simpan pesaing
      </button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}

export function CompetitorAuditForm({ competitors }: { competitors: Competitor[] }) {
  const [message, action, pending] = useActionState(saveGrowthSearchAudit, null);
  const domains = [{ name: "Anugrah Plastik", domain: ownDomain }, ...competitors];
  return (
    <form action={action} className="growth-audit-form">
      <h2>Catat pemeriksaan minggu ini</h2>
      <input type="hidden" name="domains" value={domains.map((item) => item.domain).join(",")} />
      <p>
        Cari setiap frasa di Google dari desktop dengan lokasi Bandung dan bahasa Indonesia. Isi posisi 1 sampai 10;
        kosongkan bila situs tidak muncul pada sepuluh hasil organik pertama. Iklan tidak dihitung.
      </p>
      <p>
        Hasil pencarian dapat berbeda menurut waktu dan lokasi. Unggah tangkapan layar pemeriksaan untuk arsip internal.
      </p>
      <div className="growth-audit-keywords">
        {searchKeywords.map((keyword, keywordIndex) => (
          <fieldset key={keyword}>
            <legend>{keyword}</legend>
            <div className="growth-audit-positions">
              {domains.map((item, domainIndex) => (
                <label key={item.domain}>
                  <span>{item.name}</span>
                  <input
                    name={`position-${keywordIndex}-${domainIndex}`}
                    type="number"
                    min={1}
                    max={10}
                    step={1}
                    inputMode="numeric"
                    aria-label={`Posisi ${item.name} untuk ${keyword}`}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <label className="growth-audit-evidence">
        Tangkapan layar hasil pemeriksaan
        <input name="evidence" type="file" accept="image/png,image/jpeg,image/webp" required />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan pemeriksaan"}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
