"use client";

import { useEffect, useRef, useState } from "react";
import { FBR_LOGO_URL } from "@/lib/fbrPrint";

/**
 * The official "Digital Invoicing System" logo image from PRAL/FBR.
 * Put the file at public/fbr-logo.png. Until it is there nothing is drawn, so no broken picture shows on paper.
 * Do not draw your own version: FBR says to use its image.
 */
export default function FbrLogo() {
  const [missing, setMissing] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // An image that failed before the page woke up never fires onError, so check it once here.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setMissing(true);
  }, []);

  if (missing) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={FBR_LOGO_URL}
      alt="FBR Digital Invoicing System"
      onError={() => setMissing(true)}
      style={{ height: "0.7in", width: "auto" }}
    />
  );
}
