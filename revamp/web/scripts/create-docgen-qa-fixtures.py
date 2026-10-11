"""Create clearly fictional PDFs for the local DocGen transaction QA flow."""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


DESTINATION = Path(__file__).resolve().parents[1] / "tmp" / "pdfs"
REFERENCE = "TRX-2026-UJI01"


def make_pdf(filename: str, title: str, rows: list[tuple[str, str]]) -> None:
    DESTINATION.mkdir(parents=True, exist_ok=True)
    target = DESTINATION / filename
    if target.exists():
        raise FileExistsError(f"Refusing to replace existing QA fixture: {target.name}")

    page = canvas.Canvas(str(target), pagesize=A4)
    width, height = A4
    page.setFillColor(colors.HexColor("#FFF0E5"))
    page.rect(38, height - 112, width - 76, 58, fill=1, stroke=0)
    page.setFillColor(colors.HexColor("#A43D15"))
    page.setFont("Helvetica-Bold", 15)
    page.drawCentredString(width / 2, height - 77, "DRAF CONTOH - BUKAN DOKUMEN RESMI")
    page.setFillColor(colors.HexColor("#102844"))
    page.setFont("Helvetica-Bold", 19)
    page.drawString(44, height - 155, title)
    page.setFont("Helvetica", 10)
    page.drawString(44, height - 176, f"Transaksi uji: {REFERENCE}")
    page.drawString(44, height - 192, "Pelanggan fiktif: [UJI] Pelanggan DocGen")

    y = height - 230
    for label, value in rows:
        page.setFont("Helvetica-Bold", 10)
        page.drawString(44, y, f"{label}:")
        page.setFont("Helvetica", 10)
        page.drawString(178, y, value)
        y -= 26

    y -= 26
    page.setFont("Helvetica-Bold", 11)
    page.setFillColor(colors.HexColor("#A43D15"))
    page.drawString(44, y, "TANDA TANGAN CONTOH - TIDAK SAH")
    page.setFont("Helvetica", 9)
    page.drawString(44, y - 18, "Tidak menunjukkan pesanan, transfer, atau penerimaan barang yang nyata.")
    page.save()


if __name__ == "__main__":
    make_pdf(
        "qa-po-fiktif.pdf",
        "PESANAN PEMBELIAN FIKTIF (PO)",
        [
            ("Nomor PO", "PO-UJI-2026-001"),
            ("Pekerjaan", "Spacer conduit contoh"),
            ("Jumlah", "100 pcs"),
            ("Nilai pesanan", "Rp1.000.000"),
        ],
    )
    make_pdf(
        "qa-bukti-dp-fiktif.pdf",
        "BUKTI TRANSFER FIKTIF - DP",
        [("Referensi", "BAYAR-UJI-DP-001"), ("Jumlah", "Rp300.000"), ("Status", "SIMULASI - TIDAK ADA TRANSFER")],
    )
    make_pdf(
        "qa-bukti-pelunasan-fiktif.pdf",
        "BUKTI TRANSFER FIKTIF - PELUNASAN",
        [("Referensi", "BAYAR-UJI-LUNAS-002"), ("Jumlah", "Rp700.000"), ("Status", "SIMULASI - TIDAK ADA TRANSFER")],
    )
    for part, quantity in ((1, 40), (2, 60)):
        make_pdf(
            f"qa-bast-ttd-fiktif-{part}.pdf",
            f"BAST BERTANDA TANGAN CONTOH {part}",
            [
                ("Pengiriman", f"Tahap {part} dari 2"),
                ("Barang", f"Spacer conduit contoh, {quantity} pcs"),
                ("Penerima", "PENERIMA FIKTIF - BUKAN PELANGGAN"),
            ],
        )
