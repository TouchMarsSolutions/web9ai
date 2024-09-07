import React, { ReactNode } from 'react';

type AlignmentType = 'left' | 'right' | 'center';

interface AlignedTextProps {
  children: ReactNode;
  align?: AlignmentType;
}

export function AlignedText({ children, align = 'right' }: AlignedTextProps) {
  return (
    <div className={`text--${align}`}>
      {children}
    </div>
  );
}

export default AlignedText;