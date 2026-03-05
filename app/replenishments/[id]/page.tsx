'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Redirect old detail page to new edit/view page
export default function ReplenishmentDetailRedirect() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  useEffect(() => {
    if (id) {
      router.replace(`/replenishments/new?id=${id}&view=1`);
    }
  }, [id, router]);

  return null;
}
