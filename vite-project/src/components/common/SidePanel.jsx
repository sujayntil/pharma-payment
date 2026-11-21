import { useEffect, useRef } from 'react';
import { ActionIcon, Drawer, Portal, Tooltip, Transition } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import classes from './SidePanel.module.css';

/**
 * The app's right-side panel on laptops: wide (width px, never more than 92%
 * of the screen), a soft shadow on its left edge, the page behind slightly
 * dimmed, and a round → on the left edge that slides it away (the ✕ stays).
 * On phones it's the usual bottom sheet: pass mobileProps for that case.
 *
 * modal=false: a "peek" panel beside a list (no dimming, page stays usable).
 * edgeClose=false: hide the → (e.g. while another panel is open on top).
 * Every other prop goes to Mantine's Drawer.
 */
/** Inside a panel, pinned table headers sit just under the panel's own header. */
function StickyOffset() {
  const probe = useRef(null);
  useEffect(() => {
    const content = probe.current?.closest('.mantine-Drawer-content');
    const header = content?.querySelector('.mantine-Drawer-header');
    if (!content) return undefined;
    const set = () => {
      const h = `${header ? header.offsetHeight : 0}px`;
      content.style.setProperty('--sticky-base', h);
      content.style.setProperty('--sticky-top', h);
      content.style.setProperty('--sticky-bg', getComputedStyle(content).backgroundColor);
    };
    set();
    const observer = new ResizeObserver(set);
    if (header) observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return <span ref={probe} hidden />;
}

export default function SidePanel({ opened, onClose, width = 840, modal = true, edgeClose = true, mobileProps = {}, zIndex = 200, styles, classNames, children, ...rest }) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <Drawer opened={opened} onClose={onClose} position="bottom" radius="lg" zIndex={zIndex} styles={styles} classNames={classNames} {...rest} {...mobileProps}>
        {opened && <StickyOffset />}
        {children}
      </Drawer>
    );
  }
  const size = typeof width === 'number' ? `min(${width}px, 92vw)` : width;
  return (
    <>
      <Drawer
        opened={opened}
        onClose={onClose}
        position="right"
        size={size}
        radius={0}
        zIndex={zIndex}
        transitionProps={{ transition: 'slide-left', duration: 220, timingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
        overlayProps={{ backgroundOpacity: 0.28, blur: 1.5 }}
        {...(!modal && { withOverlay: false, trapFocus: false, lockScroll: false, closeOnClickOutside: false })}
        classNames={{ ...classNames, content: `${classes.content} ${classNames?.content || ''}` }}
        styles={styles}
        {...rest}
      >
        {opened && <StickyOffset />}
        {children}
      </Drawer>
      {/* The → on the panel's left edge (outside the panel, so it isn't clipped by its scrolling). */}
      <Portal>
        <Transition mounted={Boolean(opened) && edgeClose} transition="fade" duration={160} enterDelay={160}>
          {(style) => (
            <div className={classes.edge} style={{ ...style, right: size, zIndex: zIndex + 2, top: styles?.inner?.top ? `calc(50% + ${styles.inner.top / 2}px)` : undefined }}>
              <Tooltip label="Close" position="left" withArrow openDelay={300}>
                <ActionIcon variant="default" radius="xl" size={34} className={classes.edgeButton} aria-label="Close panel" onClick={onClose}>
                  <IconChevronRight size={18} />
                </ActionIcon>
              </Tooltip>
            </div>
          )}
        </Transition>
      </Portal>
    </>
  );
}
