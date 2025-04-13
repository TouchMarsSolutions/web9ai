import React, { useEffect, useRef } from 'react';

export interface ControlPanelProps {
  onToggleSidebar?: () => void;
}

/**
 * A floating control panel with navigation and UI controls
 * Can be used directly in MDX files
 */
const ControlPanel: React.FC<ControlPanelProps> = (props) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  
  useEffect(() => {
    // Create container
    const panel = document.createElement('div');
    panel.className = 'floating-control-panel';
    
    // Style the panel
    Object.assign(panel.style, {
      position: 'fixed',
      right: '20px',
      top: '50%',
      transform: 'translateY(-50%)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      background: 'rgba(255, 255, 255, 0.8)',
      padding: '8px',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
      zIndex: '1000'
    });
    
    // Create buttons with simple implementation
    const createButton = (icon: string, title: string, onClick: () => void) => {
      const button = document.createElement('button');
      button.innerHTML = icon;
      button.title = title;
      
      Object.assign(button.style, {
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        fontSize: '18px',
        width: '36px',
        height: '36px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '4px'
      });
      
      button.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      };
      
      return button;
    };
    
    // Toggle Sidebar Button
    const toggleSidebarButton = createButton(
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"></path></svg>',
      'Toggle Sidebar',
      () => {
        const toggleButton = document.querySelector('.collapseSidebarButton_PEFL') as HTMLElement;
        if (toggleButton) toggleButton.click();
      }
    );
    
    // Scroll to Previous Section Button
    const scrollUpButton = createButton(
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"></path></svg>',
      'Scroll to Previous Section',
      () => {
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        if (headings.length === 0) return;
        
        const scrollY = window.scrollY;
        let target = headings[0] as HTMLElement;
        
        // Find the last heading above the current scroll position
        for (let i = headings.length - 1; i >= 0; i--) {
          const heading = headings[i] as HTMLElement;
          const rect = heading.getBoundingClientRect();
          if (rect.top + window.scrollY < scrollY - 10) {
            target = heading;
            break;
          }
        }
        
        // Scroll to the target heading
        target.scrollIntoView({ behavior: 'smooth' });
      }
    );
    
    // Scroll to Next Section Button
    const scrollDownButton = createButton(
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"></path></svg>',
      'Scroll to Next Section',
      () => {
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        if (headings.length === 0) return;
        
        // Convert to array for easier processing
        const headingsArray = Array.from(headings) as HTMLElement[];
        
        // Find the heading closest to the top of the viewport or just below it
        let closestHeadingIndex = -1;
        let smallestPositiveDistance = Infinity;
        
        headingsArray.forEach((heading, index) => {
          const rect = heading.getBoundingClientRect();
          // We're looking for headings just below the top of the viewport
          if (rect.top > 0) {
            if (rect.top < smallestPositiveDistance) {
              smallestPositiveDistance = rect.top;
              closestHeadingIndex = index;
            }
          }
        });
        
        // If we found a heading that's currently in view
        if (closestHeadingIndex !== -1) {
          // Look for the next heading
          if (closestHeadingIndex + 1 < headingsArray.length) {
            // There is a next heading, scroll to it
            headingsArray[closestHeadingIndex + 1].scrollIntoView({ behavior: 'smooth' });
            return;
          }
        }
        
        // If we didn't find a heading in view or there's no next heading,
        // find the first heading that's completely out of view below
        for (const heading of headingsArray) {
          const rect = heading.getBoundingClientRect();
          if (rect.top > window.innerHeight) {
            heading.scrollIntoView({ behavior: 'smooth' });
            return;
          }
        }
        
        // If we still haven't found a heading to scroll to,
        // scroll down by a small amount to reveal more content
        window.scrollBy({
          top: Math.min(window.innerHeight * 0.3, 200), // Smaller step
          behavior: 'smooth'
        });
      }
    );
    
    // Scroll to Top Button
    const scrollTopButton = createButton(
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"></path></svg>',
      'Scroll to Top',
      () => {
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      }
    );
    
    // Scroll to Bottom Button
    const scrollBottomButton = createButton(
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"></path></svg>',
      'Scroll to Bottom',
      () => {
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: 'smooth'
        });
      }
    );
    
    // Add buttons to panel
    panel.appendChild(toggleSidebarButton);
    panel.appendChild(scrollTopButton);
    panel.appendChild(scrollUpButton);
    panel.appendChild(scrollDownButton);
    panel.appendChild(scrollBottomButton);
    
    // Add panel to document
    document.body.appendChild(panel);
    
    // Save reference for cleanup
    panelRef.current = panel;
    
    // Cleanup function
    return () => {
      if (panelRef.current) {
        panelRef.current.remove();
      }
    };
  }, [props.onToggleSidebar]);
  
  return null;
};

export default ControlPanel;
