"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";

export function HomePhotoDialog({ src, alt }: { src: string; alt: string }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="home-photo-open" type="button" aria-label={`Perbesar foto: ${alt}`}>
        <span aria-hidden="true">↗</span> Perbesar foto
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="home-photo-overlay" />
        <Dialog.Content className="home-photo-dialog" aria-describedby="home-photo-description">
          <Dialog.Title>Foto Anugrah Plastik</Dialog.Title>
          <p id="home-photo-description">{alt}</p>
          <div className="home-photo-dialog__image">
            <Image src={src} alt={alt} fill sizes="90vw" />
          </div>
          <Dialog.Close className="home-photo-dialog__close" type="button">
            Tutup foto
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
