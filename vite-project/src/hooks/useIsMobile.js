import { useMediaQuery } from '@mantine/hooks';

/** True below Mantine's `sm` breakpoint (48em ≈ 768px), where lists switch to cards. */
export function useIsMobile() {
  return useMediaQuery('(max-width: 47.99em)', false, { getInitialValueInEffect: false });
}
