import React from 'react';

interface LoadingOverlayProps {
  message: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message }) => (
  <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-4 rounded-xl border border-slate-700">
    <div className="relative w-16 h-16 mb-4">
      <div className="absolute inset-0 border-4 border-indigo-500/30 rounded-full"></div>
      <div className="absolute inset-0 border-4 border-t-indigo-500 rounded-full animate-spin"></div>
    </div>
    <p className="text-indigo-200 font-medium animate-pulse text-center">{message}</p>
  </div>
);