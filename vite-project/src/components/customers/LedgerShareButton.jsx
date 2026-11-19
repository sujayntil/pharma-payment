import { useRef, useState } from 'react';
import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconShare } from '@tabler/icons-react';
import { customersApi } from '../../api/customersApi';
import { errorText } from '../../utils/formatters';

// Phones that can share files (Android, iPhone) get "Share" → the phone's own
// share sheet with the PDF attached (WhatsApp, Gmail…). Laptops get "Download".
function canShareFiles() {
  try {
    if (typeof navigator.canShare !== 'function' || !window.matchMedia('(pointer: coarse)').matches) return false;
    return navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] });
  } catch {
    return false;
  }
}

async function readError(err) {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try { return JSON.parse(await data.text()).detail || 'Could not make the PDF.'; } catch { return 'Could not make the PDF.'; }
  }
  return errorText(err, 'Could not make the PDF.');
}

/** "Share" / "Download" the ledger as a PDF. params: the ledger's filters. */
export default function LedgerShareButton({ customerId, customerName, params, disabled = false }) {
  const [share] = useState(canShareFiles);
  const [busy, setBusy] = useState(false);
  // Some phones only open the share sheet straight from a tap; if the PDF took
  // too long, it is kept here and the next tap shares it at once.
  const ready = useRef(null);
  const [waiting, setWaiting] = useState(null); // key of a PDF waiting for a tap
  const fileName = `Ledger - ${(customerName || 'Customer').replace(/[\\/:*?"<>|]/g, '').trim()}.pdf`;
  const key = JSON.stringify([customerId, params]);

  const shareFile = async (file) => {
    try {
      await navigator.share({ files: [file], title: fileName });
      ready.current = null; setWaiting(null);
    } catch (err) {
      if (err?.name === 'NotAllowedError') { ready.current = { key, file }; setWaiting(key); return; }
      ready.current = null; setWaiting(null); // AbortError: they closed the sheet.
    }
  };

  const run = async () => {
    if (share && ready.current?.key === key) { await shareFile(ready.current.file); return; }
    setBusy(true);
    try {
      const blob = await customersApi.getLedgerPdf(customerId, params);
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (share) {
        await shareFile(file);
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url; a.download = fileName; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    } catch (err) {
      notifications.show({ color: 'red', title: 'Ledger PDF', message: await readError(err) });
    } finally {
      setBusy(false);
    }
  };

  const Icon = share ? IconShare : IconDownload;
  const label = share ? (waiting === key ? 'Tap to share' : 'Share') : 'Download';
  return (
    <Button size="xs" variant="default" radius="xl" leftSection={<Icon size={14} />} loading={busy} disabled={disabled}
      onClick={run} aria-label={`${share ? 'Share' : 'Download'} ledger PDF for ${customerName || 'customer'}`} style={{ flexShrink: 0 }}>
      {label}
    </Button>
  );
}
