import { useEffect, useState } from 'react';
import { invoicesApi } from '../api/invoicesApi';

// Asked once per app load; every date picker shares the answer.
let firstDatePromise = null;
let firstDateKnown;

/** First invoice date ('YYYY-MM-DD' or null): month pickers fade months before it. */
export function useFirstInvoiceDate() {
  const [firstDate, setFirstDate] = useState(firstDateKnown);
  useEffect(() => {
    if (firstDateKnown !== undefined) return undefined;
    let alive = true;
    firstDatePromise ||= invoicesApi.getFirstDate()
      .then((data) => { firstDateKnown = data.first_invoice_date || null; return firstDateKnown; })
      .catch(() => { firstDatePromise = null; return null; });
    firstDatePromise.then((value) => { if (alive) setFirstDate(value); });
    return () => { alive = false; };
  }, []);
  return firstDate;
}
