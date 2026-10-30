"use client";

import React, { useState } from "react";
import { KeyRound, X, Check, ExternalLink, AlertCircle } from "lucide-react";

interface MapboxTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveToken: (token: string) => void;
  currentToken: string;
}

export const MapboxTokenModal: React.FC<MapboxTokenModalProps> = ({
  isOpen,
  onClose,
  onSaveToken,
  currentToken,
}) => {
  const [tokenInput, setTokenInput] = useState(currentToken);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveToken(tokenInput.trim());
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">Connect Mapbox Token</h3>
              <p className="text-xs text-slate-400">Enable 3D Dark Vector Map Tiles</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Public Mapbox Token (<code className="text-amber-400">pk.eyJ...</code>)
            </label>
            <textarea
              rows={3}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="pk.eyJ1IjoieW91ci11c2VybmFtZSIsImEiOi..."
              className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-950 border border-slate-700 rounded-xl text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-start gap-2.5 text-xs text-slate-400">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span>Without a token, the built-in </span>
              <strong className="text-slate-200">Interactive High-Tech 2KM Transit Radar</strong>
              <span> runs automatically with zero setup required.</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <a
              href="https://account.mapbox.com/access-tokens/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
            >
              <span>Get Free Token</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl text-xs font-extrabold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition flex items-center gap-1.5"
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <span>Save & Apply</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

