const FORMATOS = [
  "qr_code",
  "code_128",
  "code_39",
  "code_93",
  "ean_13",
  "ean_8",
  "itf",
  "upc_a",
  "upc_e",
  "codabar",
];

type DetectorCtor = new (o: { formats: string[] }) => {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

export function barcodeDetectorDisponivel(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia);
}

export async function criarBarcodeDetector() {
  const Detector = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (!Detector) return null;
  try {
    return new Detector({ formats: FORMATOS });
  } catch {
    try {
      return new Detector({ formats: ["qr_code", "code_128"] });
    } catch {
      return new Detector({ formats: ["qr_code"] });
    }
  }
}
