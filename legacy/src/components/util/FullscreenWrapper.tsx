import React, { useState, useRef, ReactNode, useEffect } from 'react';
import styles from './FullscreenWrapper.module.css';
import { useColorMode } from '@docusaurus/theme-common';

interface FullscreenWrapperProps {
  children: ReactNode;
  buttonPosition?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export default function FullscreenWrapper({ 
  children, 
  buttonPosition = 'top-right' 
}: FullscreenWrapperProps): JSX.Element {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { colorMode } = useColorMode();

  const toggleFullscreen = async () => {
    if (!isFullscreen && containerRef.current) {
      try {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } catch (err) {
        console.error('Error attempting to enable fullscreen:', err);
      }
    } else if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } catch (err) {
        console.error('Error attempting to exit fullscreen:', err);
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    // Handle tab selection
    const handleTabClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.getAttribute('role') === 'tab') {
        // Let Docusaurus handle the tab switching
        return;
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleKeyDown);
    containerRef.current?.addEventListener('click', handleTabClick);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('keydown', handleKeyDown);
      containerRef.current?.removeEventListener('click', handleTabClick);
    };
  }, [isFullscreen]);

  return (
    <div 
      ref={containerRef} 
      className={`${styles.container} ${isFullscreen ? styles.fullscreen : ''}`}
      data-theme={colorMode}
    >
      <button
        onClick={toggleFullscreen}
        className={`${styles.fullscreenButton} ${styles[buttonPosition]} ${isFullscreen ? styles.active : ''}`}
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      >
        {isFullscreen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h6v6M9 21H3v-6M21 9v6h-6M3 9v6h6" />
          </svg>
        )}
      </button>
      {children}
    </div>
  );
} 