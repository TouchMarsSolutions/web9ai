import React from 'react';

interface VoomlyEmbedProps {
  id: string;
  ratio?: number;
  type?: string;
  skinColor?: string;
  shadow?: string;
  nativeFullscreen?: boolean;
  style?: React.CSSProperties;
}

const defaultStyle: React.CSSProperties = {
  width: '100%',
  aspectRatio: '1.81991 / 1',
  background: 'linear-gradient(45deg, rgb(142, 150, 164) 0%, rgb(201, 208, 222) 100%)',
  borderRadius: '10px',
};

export default function VoomlyEmbed({
  id,
  ratio = 1.819905,
  type = 'v',
  skinColor = '#008EFF',
  shadow = '',
  nativeFullscreen = true,
  style = {},
}: VoomlyEmbedProps) {
  return (
    <div
      className="voomly-embed"
      data-id={id}
      data-ratio={ratio}
      data-type={type}
      data-skin-color={skinColor}
      data-shadow={shadow}
      data-native-fullscreen={nativeFullscreen ? 'true' : undefined}
      style={{ ...defaultStyle, ...style }}
    />
  );
} 