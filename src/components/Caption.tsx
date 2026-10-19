import React from 'react';

interface CaptionProps {
  contentHtml: string;
}

export const Caption: React.FC<CaptionProps> = ({ contentHtml }) => {
  return (
    <div
      id="caption"
      className="caption-box"
      dangerouslySetInnerHTML={{ __html: contentHtml }}
    />
  );
};
