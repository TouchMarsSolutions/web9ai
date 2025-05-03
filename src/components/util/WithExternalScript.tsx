// components/WithExternalScript.tsx
import React, { useEffect, ReactNode } from 'react';

interface WithExternalScriptProps {
  src: string;
  children: ReactNode;
}

export default function WithExternalScript({ 
  src, 
  children 
}: WithExternalScriptProps): React.ReactElement {
  useEffect(() => {
    // Check if script is already loaded
    const existingScript = document.querySelector(`script[src="${src}"]`);
    if (existingScript) {
      return;
    }

    // Create and load the script
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    document.body.appendChild(script);

    // Cleanup function - only remove if it's our script
    return () => {
      const currentScript = document.querySelector(`script[src="${src}"]`);
      if (currentScript && currentScript === script) {
        document.body.removeChild(currentScript);
      }
    };
  }, [src]);

  return <>{children}</>;
}