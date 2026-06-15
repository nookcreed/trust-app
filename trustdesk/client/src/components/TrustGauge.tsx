import { useEffect, useRef, useState } from 'react';
import { Badge } from '@databricks/appkit-ui/react';
import {
  trustLevelStroke,
  trustLevelStrokeTrack,
  TRUST_LEVEL_CONFIG,
} from '../lib/types';
import type { TrustLevel } from '../lib/types';

interface TrustGaugeProps {
  score: number;
  level: TrustLevel;
  size?: 'sm' | 'lg';
  className?: string;
}

export function TrustGauge({ score, level, size = 'lg', className = '' }: TrustGaugeProps) {
  const [animatedOffset, setAnimatedOffset] = useState<number | null>(null);
  const circleRef = useRef<SVGCircleElement>(null);

  const isSmall = size === 'sm';
  const viewBox = isSmall ? 80 : 160;
  const cx = viewBox / 2;
  const cy = viewBox / 2;
  const strokeWidth = isSmall ? 6 : 10;
  const radius = cx - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const arcFraction = 0.75; // 270-degree arc
  const totalArc = circumference * arcFraction;
  const filledArc = totalArc * (Math.min(Math.max(score, 0), 100) / 100);
  const dashOffset = totalArc - filledArc;

  // Rotation: start at bottom-left (135 degrees)
  const rotationDeg = 135;

  const strokeColor = trustLevelStroke(level);
  const trackColor = trustLevelStrokeTrack(level);
  const config = TRUST_LEVEL_CONFIG[level] ?? TRUST_LEVEL_CONFIG.insufficient_data;

  useEffect(() => {
    // Start from full offset (empty) and animate to target
    setAnimatedOffset(totalArc);
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimatedOffset(dashOffset);
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [score, totalArc, dashOffset]);

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <div className="relative" style={{ width: viewBox, height: viewBox }}>
        <svg
          width={viewBox}
          height={viewBox}
          viewBox={`0 0 ${viewBox} ${viewBox}`}
          className="drop-shadow-sm"
        >
          {/* Track */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${totalArc} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(${rotationDeg} ${cx} ${cy})`}
          />
          {/* Filled arc */}
          <circle
            ref={circleRef}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${totalArc} ${circumference}`}
            strokeDashoffset={animatedOffset ?? totalArc}
            strokeLinecap="round"
            transform={`rotate(${rotationDeg} ${cx} ${cy})`}
            style={{
              transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </svg>
        {/* Center score */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`font-display font-bold leading-none ${
              isSmall ? 'text-lg' : 'text-4xl'
            }`}
            style={{ color: strokeColor }}
          >
            {score}
          </span>
          {!isSmall && (
            <span className="text-xs text-muted-foreground mt-0.5">/100</span>
          )}
        </div>
      </div>
      <Badge
        variant="outline"
        className={`text-xs font-medium ${config.color} ${config.bg} ${config.ring} ring-1 ${
          isSmall ? 'px-1.5 py-0' : 'px-2.5 py-0.5'
        }`}
      >
        {config.label}
      </Badge>
    </div>
  );
}
