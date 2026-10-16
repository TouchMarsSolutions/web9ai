import React, { ReactNode } from 'react';
import { MDXEmbedProvider } from 'mdx-embed';

interface MDXTemplateProps {
  children: ReactNode;
}

const MDXTemplate: React.FC<MDXTemplateProps> = ({ children }) => {
  return (
    <MDXEmbedProvider>
      <div className="mdx-layout">
        {children}
      </div>
    </MDXEmbedProvider>
  );
};

export default MDXTemplate;
